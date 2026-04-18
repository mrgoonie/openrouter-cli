/**
 * Integration tests for `openrouter completion` — shell completion scripts.
 * No network / no auth required.
 */
import { describe, expect, test } from 'bun:test';
import { spawnCli } from './harness.ts';

describe('completion (integration)', () => {
  for (const shell of ['bash', 'zsh', 'fish', 'powershell'] as const) {
    test(`${shell} prints non-empty script`, async () => {
      const res = await spawnCli(['completion', shell], { auth: 'none', timeoutMs: 10_000 });
      expect(res.exitCode).toBe(0);
      expect(res.stdout.length).toBeGreaterThan(50);
    });
  }
});
