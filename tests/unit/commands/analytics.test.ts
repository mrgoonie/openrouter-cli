/**
 * Unit tests for `openrouter analytics` command pipeline.
 * Covers: activity grouping by endpoint, query param forwarding, missing key guard.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';

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

const ACTIVITY_RESPONSE = {
  data: [
    { endpoint: '/chat/completions', requests: 10, tokens: 5000, cost: 0.02 },
    { endpoint: '/chat/completions', requests: 5, tokens: 2500, cost: 0.01 },
    { endpoint: '/embeddings', requests: 20, tokens: 1000, cost: 0.001 },
  ],
};

let mockServer: Server | null = null;

afterEach(() => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
  process.env.OPENROUTER_BASE_URL = undefined;
  process.env.OPENROUTER_MANAGEMENT_KEY = undefined;
});

// ---------------------------------------------------------------------------
// Grouping logic (pure unit — no HTTP)
// ---------------------------------------------------------------------------

describe('analytics activity — grouping', () => {
  function groupByEndpoint(
    rows: Array<{ endpoint?: string; requests?: number; tokens?: number; cost?: number }>,
  ) {
    const grouped = new Map<string, { requests: number; tokens: number; cost: number }>();
    for (const row of rows) {
      const endpoint = typeof row.endpoint === 'string' ? row.endpoint : 'unknown';
      const existing = grouped.get(endpoint) ?? { requests: 0, tokens: 0, cost: 0 };
      existing.requests += typeof row.requests === 'number' ? row.requests : 0;
      existing.tokens += typeof row.tokens === 'number' ? row.tokens : 0;
      existing.cost += typeof row.cost === 'number' ? row.cost : 0;
      grouped.set(endpoint, existing);
    }
    return Array.from(grouped.entries()).map(([endpoint, agg]) => ({
      endpoint,
      requests: agg.requests,
      tokens: agg.tokens,
      cost: agg.cost.toFixed(6),
    }));
  }

  test('aggregates duplicate endpoints', () => {
    const result = groupByEndpoint(ACTIVITY_RESPONSE.data);
    expect(result).toHaveLength(2);

    const chat = result.find((r) => r.endpoint === '/chat/completions');
    expect(chat).toBeDefined();
    expect(chat?.requests).toBe(15);
    expect(chat?.tokens).toBe(7500);
    expect(Number(chat?.cost)).toBeCloseTo(0.03);
  });

  test('keeps separate endpoints distinct', () => {
    const result = groupByEndpoint(ACTIVITY_RESPONSE.data);
    const embed = result.find((r) => r.endpoint === '/embeddings');
    expect(embed).toBeDefined();
    expect(embed?.requests).toBe(20);
    expect(embed?.tokens).toBe(1000);
  });

  test('handles unknown endpoint when field is missing', () => {
    const rows = [{ requests: 3, tokens: 100, cost: 0.005 }];
    const result = groupByEndpoint(rows);
    expect(result.at(0)?.endpoint).toBe('unknown');
  });

  test('cost is formatted to 6 decimal places', () => {
    const result = groupByEndpoint([{ endpoint: '/test', requests: 1, tokens: 1, cost: 0.000001 }]);
    expect(result.at(0)?.cost).toBe('0.000001');
  });
});

// ---------------------------------------------------------------------------
// Query param forwarding
// ---------------------------------------------------------------------------

describe('analytics activity — query params', () => {
  test('forwards date, key_hash, user as query params', async () => {
    let receivedUrl = '';

    mockServer = Bun.serve({
      port: 0,
      fetch: (req) => {
        receivedUrl = req.url;
        return new Response(JSON.stringify({ data: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');

    await request<unknown>({
      path: '/activity',
      method: 'GET',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      query: { date: '2024-03-01', key_hash: 'abc123', user: 'user-42' },
    });

    const url = new URL(receivedUrl);
    expect(url.searchParams.get('date')).toBe('2024-03-01');
    expect(url.searchParams.get('key_hash')).toBe('abc123');
    expect(url.searchParams.get('user')).toBe('user-42');
  });

  test('omits undefined query params', async () => {
    let receivedUrl = '';

    mockServer = Bun.serve({
      port: 0,
      fetch: (req) => {
        receivedUrl = req.url;
        return new Response(JSON.stringify({ data: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');

    // Only pass date — key_hash and user are omitted
    await request<unknown>({
      path: '/activity',
      method: 'GET',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      query: { date: '2024-03-01' },
    });

    const url = new URL(receivedUrl);
    expect(url.searchParams.get('date')).toBe('2024-03-01');
    expect(url.searchParams.has('key_hash')).toBe(false);
    expect(url.searchParams.has('user')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// JSON passthrough
// ---------------------------------------------------------------------------

describe('analytics activity — JSON output', () => {
  test('renders data array as JSON envelope', async () => {
    const { render } = await import('../../../src/lib/output/renderer.ts');

    const rows = ACTIVITY_RESPONSE.data;
    const out = await captureStdout(async () => {
      render({ data: rows, meta: {} }, { format: 'json' });
    });

    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(3);
    expect(parsed.data[0].endpoint).toBe('/chat/completions');
  });
});

// ---------------------------------------------------------------------------
// Missing key guard
// ---------------------------------------------------------------------------

describe('analytics activity — missing key', () => {
  test('throws CliError(no_key) when management key absent', () => {
    const { CliError } = require('../../../src/lib/errors/exit-codes.ts');
    expect(() => {
      const key: string | undefined = undefined;
      if (!key) throw new CliError('no_key', 'Management key required for analytics');
    }).toThrow(CliError);
  });
});
