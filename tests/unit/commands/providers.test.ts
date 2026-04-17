/**
 * Unit tests for `openrouter providers list` command pipeline.
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

const PROVIDERS_RESPONSE = {
  data: [
    { id: 'openai', name: 'OpenAI', status: 'active', models_count: 12 },
    { id: 'anthropic', name: 'Anthropic', status: 'active', models_count: 5 },
  ],
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

describe('providers list — JSON output', () => {
  test('returns envelope with provider array', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(PROVIDERS_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { render } = await import('../../../src/lib/output/renderer.ts');
    const { ProviderListSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/providers',
      method: 'GET',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    const parsed = ProviderListSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);

    const out = await captureStdout(async () => {
      render({ data: parsed.success ? parsed.data : null, meta: {} }, { format: 'json' });
    });

    const env = JSON.parse(out);
    expect(env.success).toBe(true);
    expect(Array.isArray(env.data.data)).toBe(true);
    expect(env.data.data).toHaveLength(2);
    expect(env.data.data[0].id).toBe('openai');
    expect(env.data.data[1].name).toBe('Anthropic');
  });

  test('schema rejects missing data field', () => {
    const { ProviderListSchema } = require('../../../src/lib/types/openrouter.ts');
    const result = ProviderListSchema.safeParse({ wrong: [] });
    expect(result.success).toBe(false);
  });
});
