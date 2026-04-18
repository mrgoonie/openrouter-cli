/**
 * Integration tests for `openrouter models` (public endpoint, no auth required
 * but we still pass key to match production usage).
 */
import { describe, expect, test } from 'bun:test';
import { skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('user'))('models (integration)', () => {
  test('list returns a non-empty array (JSON)', async () => {
    const res = await spawnCli(['models', 'list', '-o', 'json'], { timeoutMs: 30_000 });
    expect(res.exitCode).toBe(0);
    const parsed = tryParseJson<{ data: unknown[] }>(res.stdout);
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed?.data)).toBe(true);
    expect((parsed?.data.length ?? 0)).toBeGreaterThan(0);
  }, 60_000);

  test('get known model returns details', async () => {
    const res = await spawnCli(
      ['models', 'get', 'meta-llama/llama-3.2-1b-instruct:free', '-o', 'json'],
      { timeoutMs: 30_000 },
    );
    expect(res.exitCode).toBe(0);
  }, 60_000);

  test('endpoints returns endpoint list for a model', async () => {
    const res = await spawnCli(
      ['models', 'endpoints', 'meta-llama/llama-3.2-1b-instruct:free', '-o', 'json'],
      { timeoutMs: 30_000 },
    );
    expect(res.exitCode).toBe(0);
  }, 60_000);
});
