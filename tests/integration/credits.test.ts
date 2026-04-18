/**
 * Integration tests for `openrouter credits` (management key required).
 */
import { describe, expect, test } from 'bun:test';
import { skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('management'))('credits (integration)', () => {
  test('show returns credit balance (JSON)', async () => {
    const res = await spawnCli(['credits', 'show', '-o', 'json'], {
      auth: 'management',
      timeoutMs: 30_000,
    });
    expect(res.exitCode).toBe(0);
    const parsed = tryParseJson<{
      data: { total_credits: number; total_usage: number; remaining: number };
    }>(res.stdout);
    expect(parsed).not.toBeNull();
    expect(typeof parsed?.data.total_credits).toBe('number');
    expect(typeof parsed?.data.total_usage).toBe('number');
    expect(typeof parsed?.data.remaining).toBe('number');
  }, 60_000);
});
