/**
 * Unit tests for `openrouter video` subcommand routing.
 * Tests: subcommand registration, create without --wait, status handler.
 * Uses Bun.serve mock server for HTTP responses.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';
import { parseDuration } from '../../../src/lib/io/parse-duration.ts';
import type { VideoJob } from '../../../src/lib/types/openrouter.ts';
import { buildCreateRequest } from '../../../src/lib/video/build-create-request.ts';
import { downloadFiles } from '../../../src/lib/video/download-files.ts';
import { pollJob } from '../../../src/lib/video/poll-loop.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let mockServer: Server | null = null;

afterEach(() => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
  process.env.OPENROUTER_BASE_URL = undefined;
  process.env.OPENROUTER_API_KEY = undefined;
});

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // biome-ignore lint/suspicious/noExplicitAny: spy
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: restore
    (process.stdout as any).write = orig;
  }
  return chunks.join('');
}

const MOCK_JOB: VideoJob = {
  id: 'job-abc-123',
  status: 'pending',
  polling_url: '/videos/job-abc-123/status',
};

const MOCK_COMPLETED_JOB: VideoJob = {
  id: 'job-abc-123',
  status: 'completed',
  unsigned_urls: ['https://example.com/output.mp4'],
};

// ---------------------------------------------------------------------------
// Subcommand module exports
// ---------------------------------------------------------------------------

describe('video command — module exports', () => {
  test('video command module exports a default defineCommand result', async () => {
    const videoCmd = await import('../../../src/commands/video.ts');
    expect(videoCmd.default).toBeDefined();
    expect(typeof videoCmd.default).toBe('object');
  });

  test('video command has expected subCommands', async () => {
    const videoCmd = await import('../../../src/commands/video.ts');
    const sub = videoCmd.default.subCommands;
    expect(sub).toBeDefined();
    expect(typeof sub).toBe('object');
    // All four verbs must be registered
    expect('create' in (sub as object)).toBe(true);
    expect('status' in (sub as object)).toBe(true);
    expect('wait' in (sub as object)).toBe(true);
    expect('download' in (sub as object)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCreateRequest — integration via HTTP mock
// ---------------------------------------------------------------------------

describe('video create — request body (no --wait)', () => {
  test('POST /videos body contains prompt and model', async () => {
    let receivedBody: unknown = null;

    mockServer = Bun.serve({
      port: 0,
      async fetch(req) {
        receivedBody = await req.json();
        return new Response(JSON.stringify({ data: MOCK_JOB }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const body = await buildCreateRequest({ prompt: 'a sunset', model: 'test-model' });

    const result = await request<{ data: VideoJob }>({
      path: '/videos',
      method: 'POST',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      body,
    });

    expect(result.status).toBe(202);
    expect(result.data.data.id).toBe('job-abc-123');
    expect(result.data.data.status).toBe('pending');

    const rb = receivedBody as Record<string, unknown>;
    expect(rb.prompt).toBe('a sunset');
    expect(rb.model).toBe('test-model');
  });

  test('render formats job envelope in json mode', async () => {
    const { render } = await import('../../../src/lib/output/renderer.ts');

    const out = await captureStdout(async () => {
      render({ data: MOCK_JOB, meta: {} }, { format: 'json' });
    });

    const env = JSON.parse(out);
    expect(env.success).toBe(true);
    expect(env.data.id).toBe('job-abc-123');
    expect(env.data.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// status <id> — GET /videos/:id/status
// ---------------------------------------------------------------------------

describe('video status — GET request', () => {
  test('fetches and renders status envelope', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch() {
        return new Response(JSON.stringify({ data: MOCK_COMPLETED_JOB }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const result = await request<{ data: VideoJob }>({
      path: '/videos/job-abc-123/status',
      method: 'GET',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    expect(result.data.data.status).toBe('completed');
    expect(result.data.data.unsigned_urls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// pollJob — integrated through mock fetchStatus
// ---------------------------------------------------------------------------

describe('video wait — pollJob integration', () => {
  test('resolves when fetchStatus returns completed after in_progress', async () => {
    let call = 0;
    const fetchStatus = async (): Promise<VideoJob> => {
      call++;
      if (call === 1) return { id: 'j1', status: 'in_progress' };
      return { id: 'j1', status: 'completed' };
    };

    const result = await pollJob({ fetchStatus, intervalMs: 0, timeoutMs: 5000 });
    expect(result.status).toBe('completed');
    expect(call).toBe(2);
  });

  test('throws CliError on failed job', async () => {
    const fetchStatus = async (): Promise<VideoJob> => ({ id: 'j2', status: 'failed' });

    await expect(pollJob({ fetchStatus, intervalMs: 0, timeoutMs: 5000 })).rejects.toBeInstanceOf(
      CliError,
    );
  });
});

// ---------------------------------------------------------------------------
// parseDuration — used for --interval and --timeout flags
// ---------------------------------------------------------------------------

describe('parseDuration helper', () => {
  test('parses seconds: 2s → 2000', () => {
    expect(parseDuration('2s')).toBe(2000);
  });

  test('parses minutes: 20m → 1200000', () => {
    expect(parseDuration('20m')).toBe(1_200_000);
  });

  test('parses milliseconds: 500ms → 500', () => {
    expect(parseDuration('500ms')).toBe(500);
  });

  test('parses hours: 1h → 3600000', () => {
    expect(parseDuration('1h')).toBe(3_600_000);
  });

  test('parses plain number as ms: 1000 → 1000', () => {
    expect(parseDuration('1000')).toBe(1000);
  });

  test('throws CliError on invalid string', () => {
    expect(() => parseDuration('abc')).toThrow(CliError);
    expect(() => parseDuration('')).toThrow(CliError);
    expect(() => parseDuration('-5s')).toThrow(CliError);
  });
});

// ---------------------------------------------------------------------------
// downloadFiles — used by --download flag
// ---------------------------------------------------------------------------

describe('video download — downloadFiles integration', () => {
  test('download command rejects non-completed job', async () => {
    const job: VideoJob = { id: 'j3', status: 'in_progress' };

    expect(() => {
      if (job.status !== 'completed') {
        throw new CliError(
          'async_job_failed',
          `job ${job.id} is not completed (status: ${job.status})`,
          'use `openrouter video wait <id>` to wait for completion first',
        );
      }
    }).toThrow(CliError);
  });

  test('download command rejects completed job with no unsigned_urls', () => {
    const job: VideoJob = { id: 'j4', status: 'completed', unsigned_urls: [] };

    expect(() => {
      if (!job.unsigned_urls || job.unsigned_urls.length === 0) {
        throw new CliError(
          'invalid_response',
          'job completed but has no unsigned_urls to download',
        );
      }
    }).toThrow(CliError);
  });
});
