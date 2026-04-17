/**
 * Unit tests for `openrouter embeddings create` command pipeline.
 * Covers: JSON envelope, pretty summary, --allow-large refusal, schema validation.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';
import { refuseLarge } from '../../../src/lib/io/input-reader.ts';

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

const EMBEDDING_RESPONSE = {
  data: [{ object: 'embedding', embedding: [0.1, 0.2, 0.3], index: 0 }],
  usage: { prompt_tokens: 5, total_tokens: 5, cost: 0.001 },
  model: 'openai/text-embedding-3-small',
};

const EMBEDDING_RESPONSE_BATCH = {
  data: [
    { object: 'embedding', embedding: [0.1, 0.2, 0.3], index: 0 },
    { object: 'embedding', embedding: [0.4, 0.5, 0.6], index: 1 },
  ],
  usage: { prompt_tokens: 10, total_tokens: 10, cost: 0.002 },
  model: 'openai/text-embedding-3-small',
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

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('EmbeddingResponseSchema', () => {
  test('parses valid response correctly', async () => {
    const { EmbeddingResponseSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = EmbeddingResponseSchema.safeParse(EMBEDDING_RESPONSE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toHaveLength(1);
      expect(result.data.data[0]!.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.data.usage.cost).toBe(0.001);
    }
  });

  test('parses base64 embedding string', async () => {
    const { EmbeddingResponseSchema } = await import('../../../src/lib/types/openrouter.ts');
    const resp = {
      ...EMBEDDING_RESPONSE,
      data: [{ object: 'embedding', embedding: 'SGVsbG8=', index: 0 }],
    };
    const result = EmbeddingResponseSchema.safeParse(resp);
    expect(result.success).toBe(true);
  });

  test('rejects response missing data array', async () => {
    const { EmbeddingResponseSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = EmbeddingResponseSchema.safeParse({ usage: {}, model: 'x' });
    expect(result.success).toBe(false);
  });

  test('rejects response missing usage', async () => {
    const { EmbeddingResponseSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = EmbeddingResponseSchema.safeParse({ data: [], model: 'x' });
    expect(result.success).toBe(false);
  });

  test('passthrough preserves extra fields', async () => {
    const { EmbeddingResponseSchema } = await import('../../../src/lib/types/openrouter.ts');
    const resp = { ...EMBEDDING_RESPONSE, extra_field: 'kept' };
    const result = EmbeddingResponseSchema.safeParse(resp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra_field).toBe('kept');
    }
  });
});

// ---------------------------------------------------------------------------
// JSON envelope via request + render pipeline
// ---------------------------------------------------------------------------

describe('embeddings create — JSON output', () => {
  test('returns envelope with embedding data', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(EMBEDDING_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { render } = await import('../../../src/lib/output/renderer.ts');
    const { EmbeddingResponseSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/embeddings',
      method: 'POST',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      body: { model: 'openai/text-embedding-3-small', input: 'hello' },
    });

    const parsed = EmbeddingResponseSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);

    const out = await captureStdout(async () => {
      render({ data: parsed.success ? parsed.data : null, meta: {} }, { format: 'json' });
    });

    const env = JSON.parse(out);
    expect(env.success).toBe(true);
    expect(Array.isArray(env.data.data)).toBe(true);
    expect(env.data.data[0].embedding).toEqual([0.1, 0.2, 0.3]);
    expect(env.data.usage.cost).toBe(0.001);
  });

  test('batch response returns multiple embeddings', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(EMBEDDING_RESPONSE_BATCH), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { EmbeddingResponseSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/embeddings',
      method: 'POST',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      body: { model: 'openai/text-embedding-3-small', input: ['hello', 'world'] },
    });

    const parsed = EmbeddingResponseSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Pretty summary rendering
// ---------------------------------------------------------------------------

describe('embeddings create — pretty summary', () => {
  test('pretty output contains N × D vectors and cost', async () => {
    const { data: vectors, usage, model: respModel } = EMBEDDING_RESPONSE;
    const n = vectors.length;
    const firstEmbedding = vectors[0]?.embedding;
    const d = Array.isArray(firstEmbedding) ? firstEmbedding.length : null;
    const dimPart = d !== null ? ` × ${d}` : '';
    const costPart = usage.cost !== undefined ? ` · cost $${usage.cost.toFixed(4)}` : '';

    const out = await captureStdout(async () => {
      process.stdout.write(`${n}${dimPart} vectors · model ${respModel}${costPart}\n`);
    });

    expect(out).toContain('1 × 3 vectors');
    expect(out).toContain('cost $0.0010');
    expect(out).toContain('openai/text-embedding-3-small');
  });

  test('batch pretty output shows correct N count', async () => {
    const { data: vectors, usage, model: respModel } = EMBEDDING_RESPONSE_BATCH;
    const n = vectors.length;
    const firstEmbedding = vectors[0]?.embedding;
    const d = Array.isArray(firstEmbedding) ? firstEmbedding.length : null;
    const dimPart = d !== null ? ` × ${d}` : '';
    const costPart = usage.cost !== undefined ? ` · cost $${usage.cost.toFixed(4)}` : '';

    const out = await captureStdout(async () => {
      process.stdout.write(`${n}${dimPart} vectors · model ${respModel}${costPart}\n`);
    });

    expect(out).toContain('2 × 3 vectors');
    expect(out).toContain('cost $0.0020');
  });
});

// ---------------------------------------------------------------------------
// --allow-large refusal
// ---------------------------------------------------------------------------

describe('embeddings create — large input guard', () => {
  test('refuseLarge throws CliError when input exceeds limit', () => {
    const bigText = 'x'.repeat(11_000_000); // 11 MB
    expect(() => refuseLarge(bigText, 10_000_000, false)).toThrow(CliError);
  });

  test('refuseLarge CliError has usage code', () => {
    const bigText = 'x'.repeat(11_000_000);
    try {
      refuseLarge(bigText, 10_000_000, false);
      expect(true).toBe(false);
    } catch (err) {
      expect((err as CliError).code).toBe('usage');
    }
  });

  test('refuseLarge hint mentions --allow-large', () => {
    const bigText = 'x'.repeat(11_000_000);
    try {
      refuseLarge(bigText, 10_000_000, false);
    } catch (err) {
      expect((err as CliError).hint).toContain('--allow-large');
    }
  });

  test('refuseLarge does NOT throw when allowLarge=true', () => {
    const bigText = 'x'.repeat(11_000_000);
    expect(() => refuseLarge(bigText, 10_000_000, true)).not.toThrow();
  });

  test('refuseLarge does NOT throw when input is within limit', () => {
    const smallText = 'hello world';
    expect(() => refuseLarge(smallText, 10_000_000, false)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// EmbeddingRequestSchema
// ---------------------------------------------------------------------------

describe('EmbeddingRequestSchema', () => {
  test('accepts minimal request', async () => {
    const { EmbeddingRequestSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = EmbeddingRequestSchema.safeParse({
      model: 'openai/text-embedding-3-small',
      input: 'hello',
    });
    expect(result.success).toBe(true);
  });

  test('accepts array input', async () => {
    const { EmbeddingRequestSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = EmbeddingRequestSchema.safeParse({
      model: 'openai/text-embedding-3-small',
      input: ['hello', 'world'],
    });
    expect(result.success).toBe(true);
  });

  test('accepts optional fields', async () => {
    const { EmbeddingRequestSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = EmbeddingRequestSchema.safeParse({
      model: 'openai/text-embedding-3-small',
      input: 'hello',
      dimensions: 512,
      encoding_format: 'float',
      input_type: 'query',
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing model', async () => {
    const { EmbeddingRequestSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = EmbeddingRequestSchema.safeParse({ input: 'hello' });
    expect(result.success).toBe(false);
  });
});
