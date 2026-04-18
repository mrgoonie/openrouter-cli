/**
 * Integration tests for `openrouter generations` — chains a chat call to
 * capture a generation_id, then looks it up.
 */
import { describe, expect, test } from 'bun:test';
import { FREE_CHAT_MODEL, skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('user'))('generations (integration)', () => {
  test('get details for a generation produced by chat', async () => {
    const chat = await spawnCli(
      ['chat', '-m', FREE_CHAT_MODEL, '--no-stream', '-o', 'json', 'Say: ok'],
      { timeoutMs: 90_000 },
    );
    expect(chat.exitCode).toBe(0);
    const parsed = tryParseJson<{ meta: { generation_id?: string }; data: { id?: string } }>(
      chat.stdout,
    );
    const genId = parsed?.meta.generation_id ?? parsed?.data.id;
    if (!genId) {
      // OpenRouter sometimes delays generation records; skip gracefully
      return;
    }

    // Generation records propagate asynchronously — retry a few times
    let lastExit = -1;
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await spawnCli(['generations', 'get', genId, '-o', 'json'], {
        timeoutMs: 30_000,
      });
      lastExit = res.exitCode;
      if (res.exitCode === 0) return;
    }
    expect(lastExit).toBe(0);
  }, 180_000);
});
