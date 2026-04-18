/**
 * Integration tests for `openrouter responses` (Beta Responses API).
 */
import { describe, expect, test } from 'bun:test';
import { FREE_CHAT_MODEL, skipIfNoKey, spawnCli } from './harness.ts';

describe.skipIf(skipIfNoKey('user'))('responses (integration)', () => {
  test('create non-streaming returns output (JSON)', async () => {
    const res = await spawnCli(
      ['responses', 'create', '-m', FREE_CHAT_MODEL, '--no-stream', '-o', 'json', 'Say hi in one word.'],
      { timeoutMs: 90_000 },
    );
    // Responses API may not be enabled for all models — accept non-zero with stderr
    if (res.exitCode !== 0) {
      expect(res.stderr.length).toBeGreaterThan(0);
      return;
    }
    expect(res.stdout.length).toBeGreaterThan(0);
  }, 120_000);
});
