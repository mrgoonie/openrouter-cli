/**
 * E2E: error envelope and exit code tests.
 * Spins a per-test error server that always returns a fixed HTTP status code.
 * Tests `models list --json` since it uses the user API key (no mgmt key needed).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { type MockServer, startMockServer } from '../fixtures/mock-server.ts';
import { spawnCli } from './harness.ts';

let mock: MockServer;

beforeAll(async () => {
  mock = await startMockServer();
});

afterAll(async () => {
  await mock.stop();
});

afterEach(() => {
  mock.reset();
});

/**
 * Spin a one-shot error server that always returns a fixed HTTP status.
 * The CLI command `models list` uses the user API key and hits GET /models.
 * Sets Retry-After: 0 and X-RateLimit-Reset: 0 so retryable codes (429) don't wait.
 */
async function startErrorServer(httpStatus: number): Promise<{ url: string; stop: () => void }> {
  const body = JSON.stringify({ error: { message: `Mock error ${httpStatus}`, code: httpStatus } });
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      new Response(body, {
        status: httpStatus,
        headers: {
          'Content-Type': 'application/json',
          // Suppress retry backoff: tell the client to retry immediately
          'Retry-After': '0',
          'X-RateLimit-Reset': '0',
        },
      }),
  });
  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(true),
  };
}

describe('error exit codes (always runs)', () => {
  it('exits 65 (unauthorized) on 401', async () => {
    const errServer = await startErrorServer(401);
    try {
      const { exitCode, stdout } = await spawnCli(['models', 'list', '--json'], {
        mockUrl: errServer.url,
      });
      expect(exitCode).toBe(65);
      // JSON mode: error envelope on stdout
      if (stdout.trim()) {
        const parsed = JSON.parse(stdout);
        expect(parsed.success).toBe(false);
        expect(parsed.schema_version).toBe('1');
        expect(parsed.error.code).toBe('unauthorized');
      }
    } finally {
      errServer.stop();
    }
  });

  it('exits 68 (insufficient_credits) on 402', async () => {
    const errServer = await startErrorServer(402);
    try {
      const { exitCode } = await spawnCli(['models', 'list', '--json'], { mockUrl: errServer.url });
      expect(exitCode).toBe(68);
    } finally {
      errServer.stop();
    }
  });

  it('exits 67 (not_found) on 404', async () => {
    const errServer = await startErrorServer(404);
    try {
      const { exitCode } = await spawnCli(['models', 'list', '--json'], { mockUrl: errServer.url });
      expect(exitCode).toBe(67);
    } finally {
      errServer.stop();
    }
  });

  it('exits 69 (rate_limited) on 429', async () => {
    const errServer = await startErrorServer(429);
    try {
      const { exitCode } = await spawnCli(['models', 'list', '--json'], { mockUrl: errServer.url });
      expect(exitCode).toBe(69);
    } finally {
      errServer.stop();
    }
  });

  it('exits 70 (server_error) on 500', async () => {
    const errServer = await startErrorServer(500);
    try {
      const { exitCode } = await spawnCli(['models', 'list', '--json'], { mockUrl: errServer.url });
      expect(exitCode).toBe(70);
    } finally {
      errServer.stop();
    }
  });

  it('error envelope has schema_version "1" and success false', async () => {
    const errServer = await startErrorServer(401);
    try {
      const { stdout } = await spawnCli(['models', 'list', '--json'], { mockUrl: errServer.url });
      expect(stdout.trim()).toBeTruthy();
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe('1');
      expect(parsed.success).toBe(false);
      expect(parsed.data).toBeNull();
      expect(parsed.error).toBeDefined();
      expect(typeof parsed.error.code).toBe('string');
      expect(typeof parsed.error.message).toBe('string');
    } finally {
      errServer.stop();
    }
  });

  it('exits 2 (usage) when required args are missing', async () => {
    const { exitCode } = await spawnCli(
      ['chat', 'send', '--non-interactive', '--no-stream', '--model', 'openai/gpt-4o'],
      { mockUrl: mock.url },
    );
    // No message provided → usage error (exit 2)
    expect(exitCode).toBe(2);
  });
});
