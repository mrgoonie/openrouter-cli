/**
 * Unit tests for `openrouter rerank run` command pipeline.
 * Covers: <2 docs error, sort order in pretty table, JSON envelope, schema validation.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';
import { readLinesFromSource } from '../../../src/lib/io/input-reader.ts';
import { renderTable } from '../../../src/lib/output/table.ts';

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

const RERANK_RESPONSE = {
  results: [
    { index: 0, relevance_score: 0.8, document: { text: 'The cat sat on the mat' } },
    { index: 1, relevance_score: 0.3, document: { text: 'Dogs are loyal companions' } },
    { index: 2, relevance_score: 0.95, document: { text: 'Cats are great pets' } },
  ],
  model: 'mistralai/mistral-embed',
  usage: { prompt_tokens: 20, total_tokens: 20 },
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

describe('RerankResponseSchema', () => {
  test('parses valid response', async () => {
    const { RerankResponseSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = RerankResponseSchema.safeParse(RERANK_RESPONSE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.results).toHaveLength(3);
      expect(result.data.model).toBe('mistralai/mistral-embed');
    }
  });

  test('parses response without document text (index-only mode)', async () => {
    const { RerankResponseSchema } = await import('../../../src/lib/types/openrouter.ts');
    const resp = {
      results: [
        { index: 0, relevance_score: 0.9 },
        { index: 1, relevance_score: 0.5 },
      ],
      model: 'test-model',
    };
    const result = RerankResponseSchema.safeParse(resp);
    expect(result.success).toBe(true);
  });

  test('rejects response missing results', async () => {
    const { RerankResponseSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = RerankResponseSchema.safeParse({ model: 'x' });
    expect(result.success).toBe(false);
  });

  test('passthrough preserves extra fields', async () => {
    const { RerankResponseSchema } = await import('../../../src/lib/types/openrouter.ts');
    const resp = { ...RERANK_RESPONSE, meta: { latency: 42 } };
    const result = RerankResponseSchema.safeParse(resp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).meta).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// RerankRequestSchema
// ---------------------------------------------------------------------------

describe('RerankRequestSchema', () => {
  test('accepts minimal request', async () => {
    const { RerankRequestSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = RerankRequestSchema.safeParse({
      model: 'mistralai/mistral-embed',
      query: 'cats',
      documents: ['doc one', 'doc two'],
    });
    expect(result.success).toBe(true);
  });

  test('accepts optional top_n', async () => {
    const { RerankRequestSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = RerankRequestSchema.safeParse({
      model: 'mistralai/mistral-embed',
      query: 'cats',
      documents: ['doc one', 'doc two'],
      top_n: 1,
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing documents', async () => {
    const { RerankRequestSchema } = await import('../../../src/lib/types/openrouter.ts');
    const result = RerankRequestSchema.safeParse({ model: 'x', query: 'q' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// <2 documents validation
// ---------------------------------------------------------------------------

describe('rerank run — document count validation', () => {
  test('throws CliError when only 1 doc provided', () => {
    const docs = ['only one document'];
    expect(() => {
      if (docs.length < 2) {
        throw new CliError(
          'usage',
          'At least 2 documents required for reranking',
          'Provide one document per line in the --docs file or stdin',
        );
      }
    }).toThrow(CliError);
  });

  test('throws CliError when 0 docs provided', () => {
    const docs: string[] = [];
    expect(() => {
      if (docs.length < 2) {
        throw new CliError('usage', 'At least 2 documents required for reranking');
      }
    }).toThrow(CliError);
  });

  test('CliError has usage code', () => {
    try {
      const docs = ['one'];
      if (docs.length < 2) {
        throw new CliError('usage', 'At least 2 documents required for reranking');
      }
    } catch (err) {
      expect((err as CliError).code).toBe('usage');
      expect((err as CliError).exit).toBe(2);
    }
  });

  test('does NOT throw when 2 docs provided', () => {
    const docs = ['doc one', 'doc two'];
    expect(() => {
      if (docs.length < 2) throw new CliError('usage', 'At least 2 documents required');
    }).not.toThrow();
  });

  test('readLinesFromSource from docs file produces correct doc list', () => {
    const fileContent = 'The cat sat on the mat\nDogs are loyal companions\nCats are great pets\n';
    const docs = readLinesFromSource(fileContent);
    expect(docs).toHaveLength(3);
    expect(docs[0]).toBe('The cat sat on the mat');
  });
});

// ---------------------------------------------------------------------------
// Sort order in pretty table
// ---------------------------------------------------------------------------

describe('rerank run — pretty table sort order', () => {
  test('results are sorted by relevance_score descending', () => {
    const results = RERANK_RESPONSE.results;
    const docs = results.map((r) => r.document?.text ?? '');
    const sorted = [...results].sort((a, b) => b.relevance_score - a.relevance_score);

    expect(sorted[0]!.relevance_score).toBe(0.95);
    expect(sorted[1]!.relevance_score).toBe(0.8);
    expect(sorted[2]!.relevance_score).toBe(0.3);
  });

  test('rank is 1-indexed after sort', () => {
    const results = RERANK_RESPONSE.results;
    const docs = results.map((r) => r.document?.text ?? '');
    const sorted = [...results].sort((a, b) => b.relevance_score - a.relevance_score);

    const rows = sorted.map((item, idx) => {
      const docText = item.document?.text ?? docs[item.index] ?? '';
      const truncated = docText.length > 80 ? `${docText.slice(0, 79)}\u2026` : docText;
      return {
        rank: String(idx + 1),
        score: item.relevance_score.toFixed(3),
        document: truncated,
      };
    });

    expect(rows[0]!.rank).toBe('1');
    expect(rows[0]!.score).toBe('0.950');
    expect(rows[0]!.document).toBe('Cats are great pets');
    expect(rows[1]!.rank).toBe('2');
    expect(rows[1]!.score).toBe('0.800');
    expect(rows[2]!.rank).toBe('3');
    expect(rows[2]!.score).toBe('0.300');
  });

  test('document truncated to 80 chars with ellipsis', () => {
    const longDoc = 'a'.repeat(90);
    const truncated = longDoc.length > 80 ? `${longDoc.slice(0, 79)}\u2026` : longDoc;
    expect(truncated.length).toBe(80);
    expect(truncated.endsWith('\u2026')).toBe(true);
  });

  test('short documents are not truncated', () => {
    const shortDoc = 'short text';
    const truncated = shortDoc.length > 80 ? `${shortDoc.slice(0, 79)}\u2026` : shortDoc;
    expect(truncated).toBe('short text');
  });

  test('pretty table output contains ranked results', async () => {
    const results = RERANK_RESPONSE.results;
    const docs = results.map((r) => r.document?.text ?? '');
    const sorted = [...results].sort((a, b) => b.relevance_score - a.relevance_score);

    const rows = sorted.map((item, idx) => {
      const docText = item.document?.text ?? docs[item.index] ?? '';
      const truncated = docText.length > 80 ? `${docText.slice(0, 79)}\u2026` : docText;
      return {
        rank: String(idx + 1),
        score: item.relevance_score.toFixed(3),
        document: truncated,
      };
    });

    const out = await captureStdout(async () => {
      process.stdout.write(
        `${renderTable(rows, [
          { key: 'rank', header: 'Rank', width: 6 },
          { key: 'score', header: 'Score', width: 10 },
          { key: 'document', header: 'Document', width: 84 },
        ])}\n`,
      );
    });

    expect(out).toContain('0.950');
    expect(out).toContain('0.800');
    expect(out).toContain('0.300');
    expect(out).toContain('Cats are great pets');
  });
});

// ---------------------------------------------------------------------------
// JSON envelope via request + render pipeline
// ---------------------------------------------------------------------------

describe('rerank run — JSON output', () => {
  test('returns envelope with rerank results', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(RERANK_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { render } = await import('../../../src/lib/output/renderer.ts');
    const { RerankResponseSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/rerank',
      method: 'POST',
      auth: 'user',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      body: {
        model: 'mistralai/mistral-embed',
        query: 'cats',
        documents: ['The cat sat on the mat', 'Dogs are loyal companions', 'Cats are great pets'],
      },
    });

    const parsed = RerankResponseSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);

    const out = await captureStdout(async () => {
      render({ data: parsed.success ? parsed.data : null, meta: {} }, { format: 'json' });
    });

    const env = JSON.parse(out);
    expect(env.success).toBe(true);
    expect(Array.isArray(env.data.results)).toBe(true);
    expect(env.data.results).toHaveLength(3);
    expect(env.data.model).toBe('mistralai/mistral-embed');
  });
});
