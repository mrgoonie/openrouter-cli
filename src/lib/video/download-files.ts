/**
 * Concurrent file downloader for video job output URLs.
 * Uses a semaphore to cap concurrency (default 3), streams response body to disk.
 */

import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

export type DownloadProgressCallback = (
  idx: number,
  url: string,
  bytesWritten: number,
  totalBytes?: number,
) => void;

export type DownloadFilesOpts = {
  /** Maximum simultaneous downloads. Default: 3. */
  concurrency?: number;
  /** Called after each file is written. */
  onProgress?: DownloadProgressCallback;
  /** AbortSignal for cooperative cancellation. */
  signal?: AbortSignal;
};

/** Derive a safe filename from a URL, falling back to video-<idx>.mp4. */
function filenameFromUrl(url: string, idx: number): string {
  try {
    const urlPath = new URL(url).pathname;
    const base = basename(urlPath);
    if (base && base !== '/' && base.includes('.')) return base;
  } catch {
    // malformed URL — use fallback
  }
  return `video-${idx}.mp4`;
}

/** Minimal semaphore: limits the number of concurrent async tasks. */
class Semaphore {
  private readonly limit: number;
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(limit: number) {
    this.limit = limit;
  }

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

/** Download a single URL to a file path, returning bytes written. */
async function downloadOne(url: string, destPath: string, signal?: AbortSignal): Promise<number> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  }

  // Use arrayBuffer for simplicity in v1; streaming write requires ReadableStream → WritableStream
  // which Bun.write does not yet accept directly for file paths.
  // TODO: switch to streamed write once Bun.write(path, ReadableStream) is stable.
  const buffer = await res.arrayBuffer();
  await Bun.write(destPath, buffer);
  return buffer.byteLength;
}

/**
 * Download all URLs into `outDir` concurrently (capped at `concurrency`).
 *
 * Returns an array of written file paths in the same order as the input URLs.
 * Individual download failures are re-thrown; partial downloads may exist on disk.
 */
export async function downloadFiles(
  urls: string[],
  outDir: string,
  opts: DownloadFilesOpts = {},
): Promise<string[]> {
  const { concurrency = 3, onProgress, signal } = opts;

  // Ensure output directory exists
  await mkdir(outDir, { recursive: true });

  const sem = new Semaphore(concurrency);
  const results: string[] = new Array(urls.length);

  await Promise.all(
    urls.map(async (url, idx) => {
      await sem.acquire();
      try {
        const filename = filenameFromUrl(url, idx);
        const destPath = join(outDir, filename);

        const bytesWritten = await downloadOne(url, destPath, signal);
        results[idx] = destPath;

        onProgress?.(idx, url, bytesWritten, bytesWritten);
      } finally {
        sem.release();
      }
    }),
  );

  return results;
}
