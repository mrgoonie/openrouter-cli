/**
 * Integration tests for `openrouter analytics` (management key required).
 */
import { describe, expect, test } from 'bun:test';
import { skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('management'))('analytics (integration)', () => {
  test('activity returns array (JSON)', async () => {
    const res = await spawnCli(['analytics', 'activity', '-o', 'json'], {
      auth: 'management',
      timeoutMs: 30_000,
    });
    expect(res.exitCode).toBe(0);
    const parsed = tryParseJson<{ data: unknown[] }>(res.stdout);
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed?.data)).toBe(true);
  }, 60_000);
});
