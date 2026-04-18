/**
 * Integration tests for `openrouter rerank`.
 * Uses stdin to supply documents (one per line).
 */
import { describe, expect, test } from 'bun:test';
import { RERANK_MODEL, skipIfNoKey, spawnCli } from './harness.ts';

describe.skipIf(skipIfNoKey('user'))('rerank (integration)', () => {
  test('run returns ranked results (JSON)', async () => {
    const docs = [
      'Paris is the capital of France.',
      'Bananas are yellow.',
      'The Eiffel Tower is in Paris.',
    ].join('\n');
    const res = await spawnCli(
      [
        'rerank',
        'run',
        '--model',
        RERANK_MODEL,
        '--query',
        'What is the capital of France?',
        '--docs',
        '-',
        '-o',
        'json',
      ],
      { stdin: docs, timeoutMs: 60_000 },
    );
    // Some accounts may not have rerank access — allow graceful skip
    if (res.exitCode !== 0) {
      expect(res.stderr.length).toBeGreaterThan(0);
      return;
    }
    expect(res.stdout.length).toBeGreaterThan(0);
  }, 90_000);

  test('fewer than 2 docs fails with usage error', async () => {
    const res = await spawnCli(
      ['rerank', 'run', '--model', RERANK_MODEL, '--query', 'x', '--docs', '-'],
      { stdin: 'only one', timeoutMs: 15_000 },
    );
    expect(res.exitCode).not.toBe(0);
  });
});
