/**
 * Integration tests for `openrouter video`.
 * Skips paid `create` path — only verifies `status <bogus-id>` fails cleanly.
 */
import { describe, expect, test } from 'bun:test';
import { skipIfNoKey, spawnCli } from './harness.ts';

describe.skipIf(skipIfNoKey('user'))('video (integration)', () => {
  test('status with bogus id fails with non-zero exit', async () => {
    const res = await spawnCli(['video', 'status', 'nonexistent-job-id-xyz'], {
      timeoutMs: 30_000,
    });
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr.length).toBeGreaterThan(0);
  }, 60_000);
});
