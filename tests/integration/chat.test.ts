/**
 * Integration tests for `openrouter chat` against real OpenRouter API.
 */
import { describe, expect, test } from 'bun:test';
import { FREE_CHAT_MODEL, skipIfNoKey, spawnCli, tryParseJson } from './harness.ts';

describe.skipIf(skipIfNoKey('user'))('chat (integration)', () => {
  test('non-streaming JSON output returns assistant content', async () => {
    const res = await spawnCli(
      ['chat', '-m', FREE_CHAT_MODEL, '--no-stream', '-o', 'json', 'Say hi in one word.'],
      { timeoutMs: 90_000 },
    );
    expect(res.exitCode).toBe(0);
    const parsed = tryParseJson<{ data: { choices: { message: { content: string } }[] } }>(
      res.stdout,
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.data.choices[0]?.message.content.length).toBeGreaterThan(0);
  }, 120_000);

  test('streaming pretty mode prints content', async () => {
    const res = await spawnCli(['chat', '-m', FREE_CHAT_MODEL, '--stream', 'Reply with: ok'], {
      timeoutMs: 90_000,
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout.length).toBeGreaterThan(0);
  }, 120_000);

  test('stdin message via "-" works', async () => {
    const res = await spawnCli(['chat', '-m', FREE_CHAT_MODEL, '--no-stream', '-o', 'json', '-'], {
      stdin: 'Say hello.',
      timeoutMs: 90_000,
    });
    expect(res.exitCode).toBe(0);
  }, 120_000);

  test('missing --model returns usage error', async () => {
    const res = await spawnCli(['chat', 'hello'], { timeoutMs: 30_000 });
    expect(res.exitCode).not.toBe(0);
  });
});
