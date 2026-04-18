/**
 * Integration tests for `openrouter keys` (management key required).
 * Uses try/finally for create+delete roundtrip so aborted tests still clean up.
 */
import { describe, expect, test } from 'bun:test';
import { skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('management'))('keys (integration)', () => {
  test('list returns array (JSON)', async () => {
    const res = await spawnCli(['keys', 'list', '-o', 'json'], {
      auth: 'management',
      timeoutMs: 30_000,
    });
    expect(res.exitCode).toBe(0);
    const parsed = tryParseJson<{ data: unknown[] }>(res.stdout);
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed?.data)).toBe(true);
  }, 60_000);

  test('create + delete roundtrip', async () => {
    const name = `int-test-${Date.now()}`;
    const created = await spawnCli(['keys', 'create', '--name', name, '-o', 'json'], {
      auth: 'management',
      timeoutMs: 30_000,
    });
    expect(created.exitCode).toBe(0);

    const parsed = tryParseJson<{
      data: { hash?: string; id?: string; name?: string };
    }>(created.stdout);
    const id = parsed?.data?.hash ?? parsed?.data?.id;
    expect(id).toBeTruthy();

    try {
      // Optional: quick sanity read
      expect(typeof id).toBe('string');
    } finally {
      if (id) {
        const del = await spawnCli(['keys', 'delete', id, '--force'], {
          auth: 'management',
          timeoutMs: 30_000,
        });
        // Don't hard-fail cleanup — just surface info
        if (del.exitCode !== 0) {
          console.warn(`keys delete ${id} exited ${del.exitCode}: ${del.stderr}`);
        }
      }
    }
  }, 120_000);
});
