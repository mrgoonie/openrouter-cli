/**
 * Integration tests for `openrouter auth` — status + whoami.
 * Does NOT exercise `auth login` (OAuth flow) or `auth set-key` (config mutation).
 */
import { describe, expect, test } from 'bun:test';
import { skipIfNoKey, spawnCli } from './harness.ts';

describe.skipIf(skipIfNoKey('user'))('auth (integration)', () => {
  test('status prints resolved key info', async () => {
    const res = await spawnCli(['auth', 'status'], { timeoutMs: 15_000 });
    expect(res.exitCode).toBe(0);
    expect(res.stdout.length).toBeGreaterThan(0);
  }, 30_000);

  test('whoami succeeds with user key', async () => {
    const res = await spawnCli(['auth', 'whoami'], { timeoutMs: 30_000 });
    expect(res.exitCode).toBe(0);
  }, 60_000);
});
