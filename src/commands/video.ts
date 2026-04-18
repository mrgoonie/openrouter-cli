/**
 * `openrouter video` sub-command group.
 * Verbs: create, status, wait, download
 *
 * Full async lifecycle: submit video job → poll → download.
 * Resumable by job ID — users and agents can detach and reattach.
 *
 * Exit codes:
 *   0   success / SIGINT detach (job still running server-side)
 *   71  timeout
 *   73  async_job_failed (failed/cancelled/expired)
 */

import { defineCommand } from 'citty';
import { request } from '../lib/client/client.ts';
import { buildResolverContext, resolveApiKey, resolveBaseUrl } from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { parseDuration } from '../lib/io/parse-duration.ts';
import { emitNdjson } from '../lib/output/json.ts';
import { render } from '../lib/output/renderer.ts';
import { isTTY, resolveOutputMode } from '../lib/output/tty.ts';
import type { VideoJob } from '../lib/types/openrouter.ts';
import { buildCreateRequest } from '../lib/video/build-create-request.ts';
import { downloadFiles } from '../lib/video/download-files.ts';
import { pollJob } from '../lib/video/poll-loop.ts';

// ---------------------------------------------------------------------------
// Shared arg definitions
// ---------------------------------------------------------------------------

const sharedArgs = {
  'api-key': { type: 'string' as const, description: 'OpenRouter API key', alias: 'k' },
  'base-url': { type: 'string' as const, description: 'API base URL' },
  config: { type: 'string' as const, description: 'Path to TOML config file', alias: 'c' },
  output: { type: 'string' as const, description: 'Output format: pretty|json|ndjson', alias: 'o' },
  json: { type: 'boolean' as const, description: 'Alias for --output json', default: false },
  'no-color': { type: 'boolean' as const, description: 'Disable ANSI color', default: false },
};

const waitArgs = {
  interval: { type: 'string' as const, description: 'Poll interval override (e.g. 2s, 5s)' },
  timeout: { type: 'string' as const, description: 'Max wait duration (e.g. 20m, 1h)' },
  download: {
    type: 'boolean' as const,
    description: 'Download completed files (to --download-dir or cwd)',
    default: false,
  },
  'download-dir': {
    type: 'string' as const,
    description: 'Directory for downloaded files (default: current dir)',
  },
};

function resolveDownloadDir(args: Record<string, unknown>): string | undefined {
  if (!(args.download as boolean)) return undefined;
  return (args['download-dir'] as string | undefined) ?? '.';
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function resolveClientOpts(args: Record<string, unknown>) {
  const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
  const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
  return {
    apiKey: resolveApiKey(args['api-key'] as string | undefined, deps).value,
    baseUrl: resolveBaseUrl(args['base-url'] as string | undefined, deps).value,
    format: resolveOutputMode(
      (args.json as boolean) ? 'json' : (args.output as string | undefined),
    ),
  };
}

/** Emit a status tick to the appropriate output channel. */
function emitTick(format: string, job: VideoJob, elapsedMs: number): void {
  if (format === 'ndjson') {
    emitNdjson({ type: 'status', status: job.status, id: job.id, elapsed_ms: elapsedMs });
  } else if (format !== 'json' && isTTY()) {
    // Pretty: spinner line on stderr (overwritten with \r)
    const elapsed = `${Math.round(elapsedMs / 1000)}s`;
    process.stderr.write(`\r  Waiting… ${job.status} [${elapsed}]   `);
  }
}

/** Clear the spinner line on stderr (pretty mode). */
function clearTicker(format: string): void {
  if (format !== 'json' && format !== 'ndjson' && isTTY()) {
    process.stderr.write(`\r${' '.repeat(50)}\r`);
  }
}

/** Run poll-loop with onTick and optional download on completion. */
async function runWait(opts: {
  fetchStatus: () => Promise<VideoJob>;
  format: string;
  intervalMs?: number;
  timeoutMs?: number;
  signal: AbortSignal;
  downloadDir?: string;
}): Promise<VideoJob> {
  const { fetchStatus, format, intervalMs, timeoutMs, signal, downloadDir } = opts;

  const job = await pollJob({
    fetchStatus,
    intervalMs,
    timeoutMs,
    signal,
    onTick: (status, elapsed) => emitTick(format, status, elapsed),
  });

  clearTicker(format);

  if (downloadDir && job.unsigned_urls && job.unsigned_urls.length > 0) {
    const paths = await downloadFiles(job.unsigned_urls, downloadDir, {
      signal,
      onProgress: (idx, url, bytes) => {
        if (format === 'ndjson') {
          emitNdjson({ type: 'download_progress', idx, url, bytes_written: bytes });
        } else if (format !== 'json' && isTTY()) {
          process.stderr.write(`\r  Downloaded [${idx + 1}/${job.unsigned_urls!.length}]   `);
        }
      },
    });
    if (format !== 'json') {
      clearTicker(format);
    }
    if (format === 'ndjson') {
      emitNdjson({ type: 'download_complete', files: paths });
    }
    return { ...job, _downloaded_to: paths } as VideoJob;
  }

  return job;
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

const createCommand = defineCommand({
  meta: { description: 'Submit a video generation job' },
  args: {
    ...sharedArgs,
    prompt: { type: 'string' as const, description: 'Generation prompt', required: true },
    model: { type: 'string' as const, description: 'Model ID', required: true, alias: 'm' },
    'aspect-ratio': { type: 'string' as const, description: 'Aspect ratio (e.g. 16:9)' },
    duration: { type: 'string' as const, description: 'Duration in seconds' },
    resolution: { type: 'string' as const, description: 'Resolution (e.g. 1080p)' },
    size: { type: 'string' as const, description: 'Size WxH (e.g. 1280x720)' },
    'frame-image': {
      type: 'string' as const,
      description: 'Frame image path (repeatable)',
      array: true,
    },
    'generate-audio': {
      type: 'boolean' as const,
      description: 'Generate audio track',
      default: undefined,
    },
    provider: { type: 'string' as const, description: 'Path to JSON provider preferences file' },
    wait: { type: 'boolean' as const, description: 'Poll until job completes', default: false },
    ...waitArgs,
  },
  async run({ args }) {
    const { apiKey, baseUrl, format } = resolveClientOpts(args as Record<string, unknown>);

    const body = await buildCreateRequest({
      prompt: args.prompt as string,
      model: args.model as string,
      aspectRatio: args['aspect-ratio'] as string | undefined,
      duration: args.duration !== undefined ? Number(args.duration) : undefined,
      resolution: args.resolution as string | undefined,
      size: args.size as string | undefined,
      frameImages: args['frame-image'] as unknown as string[] | undefined,
      generateAudio: args['generate-audio'] as boolean | undefined,
      provider: args.provider as string | undefined,
    });

    const result = await request<VideoJob>({
      path: '/videos',
      method: 'POST',
      auth: 'user',
      apiKey,
      baseUrl,
      body,
    });

    const job = result.data;

    if (!(args.wait as boolean)) {
      render(
        { data: job, meta: { request_id: result.requestId, elapsed_ms: result.elapsedMs } },
        { format },
      );
      return;
    }

    // --wait: set up SIGINT → detach
    const controller = new AbortController();
    const onSigint = () => {
      process.stderr.write(`\nDetached. Job still running: ${job.id}\n`);
      process.exit(0);
    };
    process.once('SIGINT', onSigint);

    const intervalMs = args.interval ? parseDuration(args.interval as string) : undefined;
    const timeoutMs = args.timeout ? parseDuration(args.timeout as string) : undefined;
    const downloadDir = resolveDownloadDir(args as Record<string, unknown>);

    const pollingUrl = job.polling_url ?? `/videos/${job.id}/status`;
    const fetchStatus = async () => {
      const r = await request<VideoJob>({
        path: pollingUrl,
        method: 'GET',
        auth: 'user',
        apiKey,
        baseUrl,
      });
      return r.data;
    };

    try {
      const finalJob = await runWait({
        fetchStatus,
        format,
        intervalMs,
        timeoutMs,
        signal: controller.signal,
        downloadDir,
      });

      if (format === 'ndjson') {
        emitNdjson({ type: 'result', ...finalJob });
      } else {
        render({ data: finalJob, meta: { elapsed_ms: result.elapsedMs } }, { format });
      }
    } finally {
      process.removeListener('SIGINT', onSigint);
    }
  },
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

const statusCommand = defineCommand({
  meta: { description: 'Fetch current status of a video job' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Job ID', required: true },
  },
  async run({ args }) {
    const { apiKey, baseUrl, format } = resolveClientOpts(args as Record<string, unknown>);

    const result = await request<VideoJob>({
      path: `/videos/${args.id as string}/status`,
      method: 'GET',
      auth: 'user',
      apiKey,
      baseUrl,
    });

    render(
      {
        data: result.data,
        meta: { request_id: result.requestId, elapsed_ms: result.elapsedMs },
      },
      { format },
    );
  },
});

// ---------------------------------------------------------------------------
// wait
// ---------------------------------------------------------------------------

const waitCommand = defineCommand({
  meta: { description: 'Reattach to a running video job and wait for completion' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Job ID', required: true },
    ...waitArgs,
  },
  async run({ args }) {
    const { apiKey, baseUrl, format } = resolveClientOpts(args as Record<string, unknown>);

    const controller = new AbortController();
    const jobId = args.id as string;

    const onSigint = () => {
      process.stderr.write(`\nDetached. Job still running: ${jobId}\n`);
      process.exit(0);
    };
    process.once('SIGINT', onSigint);

    const fetchStatus = async () => {
      const r = await request<VideoJob>({
        path: `/videos/${jobId}/status`,
        method: 'GET',
        auth: 'user',
        apiKey,
        baseUrl,
      });
      return r.data;
    };

    const intervalMs = args.interval ? parseDuration(args.interval as string) : undefined;
    const timeoutMs = args.timeout ? parseDuration(args.timeout as string) : undefined;
    const downloadDir = resolveDownloadDir(args as Record<string, unknown>);

    try {
      const finalJob = await runWait({
        fetchStatus,
        format,
        intervalMs,
        timeoutMs,
        signal: controller.signal,
        downloadDir,
      });

      if (format === 'ndjson') {
        emitNdjson({ type: 'result', ...finalJob });
      } else {
        render({ data: finalJob, meta: {} }, { format });
      }
    } finally {
      process.removeListener('SIGINT', onSigint);
    }
  },
});

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

const downloadCommand = defineCommand({
  meta: { description: 'Download output files from a completed video job' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Job ID', required: true },
    output: { type: 'string' as const, description: 'Output directory', default: '.' },
  },
  async run({ args }) {
    const { apiKey, baseUrl, format } = resolveClientOpts(args as Record<string, unknown>);

    const result = await request<VideoJob>({
      path: `/videos/${args.id as string}/status`,
      method: 'GET',
      auth: 'user',
      apiKey,
      baseUrl,
    });

    const job = result.data;

    if (job.status !== 'completed') {
      throw new CliError(
        'async_job_failed',
        `job ${args.id as string} is not completed (status: ${job.status})`,
        'use `openrouter video wait <id>` to wait for completion first',
      );
    }

    if (!job.unsigned_urls || job.unsigned_urls.length === 0) {
      throw new CliError('invalid_response', 'job completed but has no unsigned_urls to download');
    }

    const outDir = args.output as string;
    const paths = await downloadFiles(job.unsigned_urls, outDir, {
      onProgress: (idx, url, bytes) => {
        if (format === 'ndjson') {
          emitNdjson({ type: 'download_progress', idx, url, bytes_written: bytes });
        } else if (isTTY()) {
          process.stderr.write(`\r  Downloaded [${idx + 1}/${job.unsigned_urls!.length}]   `);
        }
      },
    });

    if (isTTY() && format !== 'ndjson' && format !== 'json') {
      process.stderr.write(`\r${' '.repeat(50)}\r`);
    }

    render({ data: { job_id: job.id, files: paths }, meta: {} }, { format });
  },
});

// ---------------------------------------------------------------------------
// Sub-router export
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: { description: 'Video generation — create, poll, and download AI-generated videos' },
  subCommands: {
    create: createCommand,
    status: statusCommand,
    wait: waitCommand,
    download: downloadCommand,
  },
});
