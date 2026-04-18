/**
 * Integration tests for `openrouter org` (management key required).
 */
import { describe, expect, test } from 'bun:test';
import { skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('management'))('org (integration)', () => {
  test('members returns array (JSON)', async () => {
    const res = await spawnCli(['org', 'members', '-o', 'json'], {
      auth: 'management',
      timeoutMs: 30_000,
    });
    expect(res.exitCode).toBe(0);
    const parsed = tryParseJson<{ data: unknown[] }>(res.stdout);
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed?.data)).toBe(true);
  }, 60_000);
});
