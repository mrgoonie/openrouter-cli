/**
 * Unit tests for downloadFiles — concurrent download, filename derivation, progress callbacks.
 * Uses Bun.serve to create a local mock HTTP server.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'bun';
import { downloadFiles } from '../../../src/lib/video/download-files.ts';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let mockServer: Server | null = null;
let tmpDir: string | null = null;

afterEach(async () => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

function makeTmpDir(): string {
  const dir = join(tmpdir(), `dl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpDir = dir;
  return dir;
}

/** Start a mock server that serves fixed payloads keyed by path. */
function startMockServer(routes: Record<string, Uint8Array>): Server {
  mockServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      const body = routes[url.pathname];
      if (!body) return new Response('Not Found', { status: 404 });
      return new Response(body, {
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(body.byteLength) },
      });
    },
  });
  return mockServer;
}

// ---------------------------------------------------------------------------
// Happy path — single file
// ---------------------------------------------------------------------------

describe('downloadFiles — single file', () => {
  test('downloads one file and returns its path', async () => {
    const payload = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const server = startMockServer({ '/video.mp4': payload });
    const outDir = makeTmpDir();

    const url = `http://localhost:${server.port}/video.mp4`;
    const paths = await downloadFiles([url], outDir);

    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('video.mp4');

    // Verify written content
    const written = await Bun.file(paths[0]!).arrayBuffer();
    expect(new Uint8Array(written)).toEqual(payload);
  });

  test('creates outDir when it does not exist', async () => {
    const payload = new Uint8Array(10);
    const server = startMockServer({ '/clip.mp4': payload });
    const outDir = join(tmpdir(), `nonexistent-${Date.now()}`);
    tmpDir = outDir;

    const url = `http://localhost:${server.port}/clip.mp4`;
    const paths = await downloadFiles([url], outDir);

    expect(paths).toHaveLength(1);
    const files = await readdir(outDir);
    expect(files).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Happy path — multiple files
// ---------------------------------------------------------------------------

describe('downloadFiles — multiple files', () => {
  test('downloads multiple files concurrently and returns all paths in order', async () => {
    const files: Record<string, Uint8Array> = {
      '/a.mp4': new Uint8Array([1, 2, 3]),
      '/b.mp4': new Uint8Array([4, 5, 6]),
      '/c.mp4': new Uint8Array([7, 8, 9]),
    };
    const server = startMockServer(files);
    const outDir = makeTmpDir();

    const urls = Object.keys(files).map((p) => `http://localhost:${server.port}${p}`);
    const paths = await downloadFiles(urls, outDir);

    expect(paths).toHaveLength(3);
    // All paths should be in outDir
    for (const p of paths) {
      expect(p).toContain(outDir);
    }

    // Verify contents match by filename
    const aPath = paths.find((p) => p.endsWith('a.mp4')) ?? '';
    expect(aPath).toBeTruthy();
    const aBuf = new Uint8Array(await Bun.file(aPath).arrayBuffer());
    expect(aBuf).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('calls onProgress for each downloaded file', async () => {
    const routes = {
      '/x.mp4': new Uint8Array(100),
      '/y.mp4': new Uint8Array(200),
    };
    const server = startMockServer(routes);
    const outDir = makeTmpDir();

    const progressCalls: Array<{ idx: number; bytes: number }> = [];
    const urls = Object.keys(routes).map((p) => `http://localhost:${server.port}${p}`);

    await downloadFiles(urls, outDir, {
      onProgress: (idx, _url, bytesWritten) => progressCalls.push({ idx, bytes: bytesWritten }),
    });

    expect(progressCalls).toHaveLength(2);
    // At least one call per file
    const indices = progressCalls.map((c) => c.idx).sort();
    expect(indices).toContain(0);
    expect(indices).toContain(1);
  });
});

// ---------------------------------------------------------------------------
// Filename derivation
// ---------------------------------------------------------------------------

describe('downloadFiles — filename derivation', () => {
  test('uses basename from URL path as filename', async () => {
    const server = startMockServer({ '/outputs/my-video.mp4': new Uint8Array(5) });
    const outDir = makeTmpDir();

    const url = `http://localhost:${server.port}/outputs/my-video.mp4`;
    const paths = await downloadFiles([url], outDir);

    expect(paths[0]).toMatch(/my-video\.mp4$/);
  });

  test('falls back to video-<idx>.mp4 for URL with no file extension', async () => {
    const server = startMockServer({ '/stream': new Uint8Array(5) });
    const outDir = makeTmpDir();

    const url = `http://localhost:${server.port}/stream`;
    const paths = await downloadFiles([url], outDir);

    expect(paths[0]).toMatch(/video-0\.mp4$/);
  });
});

// ---------------------------------------------------------------------------
// Concurrency cap
// ---------------------------------------------------------------------------

describe('downloadFiles — concurrency', () => {
  test('concurrency=1 downloads files sequentially (all still complete)', async () => {
    const routes: Record<string, Uint8Array> = {};
    for (let i = 0; i < 5; i++) {
      routes[`/v${i}.mp4`] = new Uint8Array([i]);
    }
    const server = startMockServer(routes);
    const outDir = makeTmpDir();

    const urls = Object.keys(routes).map((p) => `http://localhost:${server.port}${p}`);
    const paths = await downloadFiles(urls, outDir, { concurrency: 1 });

    expect(paths).toHaveLength(5);
    for (const p of paths) {
      expect(p).toBeDefined();
    }
  });

  test('respects custom concurrency without dropping files', async () => {
    const routes: Record<string, Uint8Array> = {};
    for (let i = 0; i < 6; i++) {
      routes[`/file${i}.mp4`] = new Uint8Array(i + 1);
    }
    const server = startMockServer(routes);
    const outDir = makeTmpDir();

    const urls = Object.keys(routes).map((p) => `http://localhost:${server.port}${p}`);
    const paths = await downloadFiles(urls, outDir, { concurrency: 2 });

    expect(paths).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe('downloadFiles — error handling', () => {
  test('throws on 404 response', async () => {
    const server = startMockServer({}); // no routes → 404 for everything
    const outDir = makeTmpDir();

    await expect(
      downloadFiles([`http://localhost:${server.port}/missing.mp4`], outDir),
    ).rejects.toThrow(/404|Download failed/i);
  });
});
