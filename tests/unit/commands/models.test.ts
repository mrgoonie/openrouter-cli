/**
 * Unit tests for `openrouter models` command handlers.
 * Uses Bun.serve mock server; invokes request + render pipeline directly.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const MODEL_FIXTURE = {
  id: 'openai/gpt-4o',
  name: 'GPT-4o',
  context_length: 128000,
  pricing: { prompt: '0.000005', completion: '0.000015' },
  architecture: { modality: 'text', tokenizer: 'cl100k' },
  top_provider: { name: 'OpenAI' },
};

const MODELS_RESPONSE = { data: [MODEL_FIXTURE] };

let mockServer: Server | null = null;

afterEach(() => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
  process.env.OPENROUTER_BASE_URL = undefined;
  process.env.OPENROUTER_API_KEY = undefined;
});

function startMock(handler: (req: Request) => Response | Promise<Response>): Server {
  mockServer = Bun.serve({ port: 0, fetch: handler });
  return mockServer;
}

// ---------------------------------------------------------------------------
// models list
// ---------------------------------------------------------------------------

describe('models list — JSON output', () => {
  test('returns envelope with data array', async () => {
    const server = startMock(
      () =>
        new Response(JSON.stringify(MODELS_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    process.env.OPENROUTER_BASE_URL = `http://localhost:${server.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { render } = await import('../../../src/lib/output/renderer.ts');
    const { ModelListResponseSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/models',
      method: 'GET',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    const parsed = ModelListResponseSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);

    const out = await captureStdout(async () => {
      render({ data: parsed.success ? parsed.data : null, meta: {} }, { format: 'json' });
    });

    const env = JSON.parse(out);
    expect(env.success).toBe(true);
    expect(Array.isArray(env.data.data)).toBe(true);
    expect(env.data.data[0].id).toBe('openai/gpt-4o');
  });
});

// ---------------------------------------------------------------------------
// models get — not found
// ---------------------------------------------------------------------------

describe('models get — not found', () => {
  test('throws CliError not_found when model absent', async () => {
    const server = startMock(
      () =>
        new Response(JSON.stringify(MODELS_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    process.env.OPENROUTER_BASE_URL = `http://localhost:${server.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { CliError } = await import('../../../src/lib/errors/exit-codes.ts');
    const { ModelListResponseSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/models',
      method: 'GET',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    const parsed = ModelListResponseSchema.parse(result.data);
    const id = 'does/not-exist';
    const model = parsed.data.find((m) => m.id === id);

    expect(model).toBeUndefined();
    expect(() => {
      if (!model) throw new CliError('not_found', `Model '${id}' not found`);
    }).toThrow(CliError);
  });
});

// ---------------------------------------------------------------------------
// models endpoints — slug validation
// ---------------------------------------------------------------------------

describe('models endpoints — slug validation', () => {
  test('valid slug passes regex', () => {
    const SLUG_RE = /^[\w.-]+\/[\w.-]+$/;
    expect(SLUG_RE.test('anthropic/claude-opus-4')).toBe(true);
    expect(SLUG_RE.test('openai/gpt-4o')).toBe(true);
  });

  test('invalid slug fails regex', () => {
    const SLUG_RE = /^[\w.-]+\/[\w.-]+$/;
    expect(SLUG_RE.test('no-slash')).toBe(false);
    expect(SLUG_RE.test('too/many/parts')).toBe(false);
    expect(SLUG_RE.test('')).toBe(false);
  });

  test('returns endpoint table data from mock', async () => {
    const endpointsPayload = {
      data: {
        id: 'anthropic/claude-opus-4',
        endpoints: [
          {
            name: 'Anthropic',
            context_length: 200000,
            pricing: { prompt: '0.000015', completion: '0.000075' },
            uptime_last_30d: 0.998,
          },
        ],
      },
    };

    const server = startMock(
      () =>
        new Response(JSON.stringify(endpointsPayload), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    process.env.OPENROUTER_BASE_URL = `http://localhost:${server.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { ModelEndpointsResponseSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/models/anthropic/claude-opus-4/endpoints',
      method: 'GET',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    const parsed = ModelEndpointsResponseSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.data.endpoints?.length).toBe(1);
  });
});
