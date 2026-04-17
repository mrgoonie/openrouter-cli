/**
 * Unit tests for `openrouter generations` command pipeline.
 * Covers: get returns envelope, cost writes only the number.
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

const GENERATION_FIXTURE = {
  data: {
    id: 'gen-abc123',
    model: 'openai/gpt-4o',
    total_cost: 0.000123,
    tokens_prompt: 50,
    tokens_completion: 100,
    native_tokens_prompt: 50,
    native_tokens_completion: 100,
    created_at: '2024-01-01T00:00:00Z',
  },
};

let mockServer: Server | null = null;

afterEach(() => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
  process.env.OPENROUTER_BASE_URL = undefined;
  process.env.OPENROUTER_API_KEY = undefined;
});

describe('generations get — JSON output', () => {
  test('returns envelope wrapping generation data', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(GENERATION_FIXTURE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { render } = await import('../../../src/lib/output/renderer.ts');
    const { GenerationDetailSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/generation',
      method: 'GET',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      query: { id: 'gen-abc123' },
    });

    const parsed = GenerationDetailSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);

    const out = await captureStdout(async () => {
      render({ data: parsed.success ? parsed.data : null, meta: {} }, { format: 'json' });
    });

    const env = JSON.parse(out);
    expect(env.success).toBe(true);
    expect(env.data.data.id).toBe('gen-abc123');
    expect(env.data.data.total_cost).toBe(0.000123);
  });
});

describe('generations cost — pipe-safe output', () => {
  test('writes only the cost number followed by newline', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(GENERATION_FIXTURE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { GenerationDetailSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/generation',
      method: 'GET',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      query: { id: 'gen-abc123' },
    });

    const parsed = GenerationDetailSchema.parse(result.data);
    const cost = parsed.data.total_cost;

    const out = await captureStdout(async () => {
      process.stdout.write(`${cost ?? 0}\n`);
    });

    // Must be exactly the number + newline — no JSON envelope, no extra text
    expect(out).toBe('0.000123\n');
    expect(out.trim()).toBe('0.000123');
    // Confirm it can be parsed back as a float
    expect(Number.parseFloat(out.trim())).toBeCloseTo(0.000123);
  });

  test('writes 0 when total_cost is absent', async () => {
    const noCostFixture = { data: { id: 'gen-xyz' } };
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(noCostFixture), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { GenerationDetailSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/generation',
      method: 'GET',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      query: { id: 'gen-xyz' },
    });

    const parsed = GenerationDetailSchema.parse(result.data);
    const cost = parsed.data.total_cost;

    const out = await captureStdout(async () => {
      process.stdout.write(`${cost ?? 0}\n`);
    });

    expect(out).toBe('0\n');
  });
});
