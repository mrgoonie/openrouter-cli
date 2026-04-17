import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { request } from '../../src/lib/client/client.ts';
import { HTTPError } from '../../src/lib/client/errors.ts';

// ---------------------------------------------------------------------------
// Shared test server
// ---------------------------------------------------------------------------

type ServerState = {
  mode: 'ok' | 'retry-429' | 'always-500';
  retryCount: number;
};

const state: ServerState = { mode: 'ok', retryCount: 0 };

let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0, // OS assigns a free port
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/api/v1/ok') {
        return new Response(JSON.stringify({ result: 'success' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': 'req_test123',
            'x-generation-id': 'gen_test456',
          },
        });
      }

      if (url.pathname === '/api/v1/retry-429') {
        state.retryCount++;
        if (state.retryCount <= 2) {
          return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              // Retry-After: 0 means retry immediately
              'Retry-After': '0',
            },
          });
        }
        // Third attempt succeeds
        return new Response(JSON.stringify({ result: 'ok after retry' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_retried' },
        });
      }

      if (url.pathname === '/api/v1/always-500') {
        return new Response(JSON.stringify({ error: { message: 'internal server error' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_err' },
        });
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('request() — happy path', () => {
  test('returns data + metadata from response headers', async () => {
    const result = await request<{ result: string }>({
      path: 'ok',
      method: 'GET',
      auth: 'user',
      apiKey: 'test-key',
      baseUrl: `${baseUrl}/api/v1/`,
    });

    expect(result.data).toEqual({ result: 'success' });
    expect(result.status).toBe(200);
    expect(result.requestId).toBe('req_test123');
    expect(result.generationId).toBe('gen_test456');
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe('request() — 429 retry', () => {
  test('retries on 429 with Retry-After:0 and eventually succeeds', async () => {
    state.retryCount = 0; // reset counter for this test

    const result = await request<{ result: string }>({
      path: 'retry-429',
      method: 'GET',
      auth: 'user',
      apiKey: 'test-key',
      baseUrl: `${baseUrl}/api/v1/`,
      timeoutMs: 10_000,
    });

    expect(result.data).toEqual({ result: 'ok after retry' });
    expect(result.requestId).toBe('req_retried');
    // Should have been called 3 times total (2 failures + 1 success)
    expect(state.retryCount).toBe(3);
  });
});

describe('request() — persistent 500', () => {
  test('throws HTTPError after max retries on persistent 500', async () => {
    let threw: unknown;
    try {
      await request({
        path: 'always-500',
        method: 'GET',
        auth: 'user',
        apiKey: 'test-key',
        baseUrl: `${baseUrl}/api/v1/`,
        timeoutMs: 10_000,
      });
    } catch (err) {
      threw = err;
    }

    expect(threw).toBeInstanceOf(HTTPError);
    const httpErr = threw as HTTPError;
    expect(httpErr.status).toBe(500);
    expect(httpErr.code).toBe('server_error');
    expect(httpErr.requestId).toBe('req_err');
  });
});

describe('request() — 404 not retried', () => {
  test('throws HTTPError immediately on 404 (no retry)', async () => {
    let threw: unknown;
    try {
      await request({
        path: 'nonexistent',
        method: 'GET',
        auth: 'user',
        apiKey: 'test-key',
        baseUrl: `${baseUrl}/api/v1/`,
      });
    } catch (err) {
      threw = err;
    }

    expect(threw).toBeInstanceOf(HTTPError);
    expect((threw as HTTPError).status).toBe(404);
    expect((threw as HTTPError).code).toBe('not_found');
  });
});
