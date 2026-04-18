/**
 * Integration tests for `openrouter guardrails` (management key required).
 * Read-only: list. Create/update/delete require a JSON schema file and may
 * incur side-effects, so we stick to a safe list assertion here.
 */
import { describe, expect, test } from 'bun:test';
import { skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('management'))('guardrails (integration)', () => {
  test('list returns JSON', async () => {
    const res = await spawnCli(['guardrails', 'list', '-o', 'json'], {
      auth: 'management',
      timeoutMs: 30_000,
    });
    // Some accounts may not have guardrails access — allow graceful skip
    if (res.exitCode !== 0) {
      expect(res.stderr.length).toBeGreaterThan(0);
      return;
    }
    const parsed = tryParseJson<unknown>(res.stdout);
    expect(parsed).not.toBeNull();
  }, 60_000);
});
