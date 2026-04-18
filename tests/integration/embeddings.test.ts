/**
 * Integration tests for `openrouter embeddings`.
 */
import { describe, expect, test } from 'bun:test';
import { EMBED_MODEL, skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('user'))('embeddings (integration)', () => {
  test('create returns embedding vector (JSON)', async () => {
    const res = await spawnCli(
      ['embeddings', 'create', '--model', EMBED_MODEL, '--input', 'hello world', '-o', 'json'],
      { timeoutMs: 60_000 },
    );
    expect(res.exitCode).toBe(0);
    const parsed = tryParseJson<{ data: { data: { embedding: number[] }[] } }>(res.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed?.data.data[0]?.embedding.length).toBeGreaterThan(0);
  }, 90_000);

  test('missing --input returns usage error', async () => {
    const res = await spawnCli(['embeddings', 'create', '--model', EMBED_MODEL], {
      timeoutMs: 15_000,
    });
    expect(res.exitCode).not.toBe(0);
  });
});
