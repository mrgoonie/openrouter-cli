/**
 * Integration tests for `openrouter providers` (public endpoint).
 */
import { describe, expect, test } from 'bun:test';
import { skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('user'))('providers (integration)', () => {
  test('list returns provider array (JSON)', async () => {
    const res = await spawnCli(['providers', 'list', '-o', 'json'], { timeoutMs: 30_000 });
    expect(res.exitCode).toBe(0);
    const parsed = tryParseJson<{ data: unknown[] }>(res.stdout);
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed?.data)).toBe(true);
    expect(parsed?.data.length ?? 0).toBeGreaterThan(0);
  }, 60_000);
});
