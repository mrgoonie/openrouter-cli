/**
 * Unit tests for confirmDestructive().
 * TTY branch is not tested directly (requires interactive terminal).
 * Covered: --force bypass, non-TTY without force → CliError('usage').
 */

import { describe, expect, test } from 'bun:test';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';
import { confirmDestructive } from '../../../src/lib/ui/confirm.ts';

describe('confirmDestructive — --force flag', () => {
  test('returns true immediately when force=true', async () => {
    const result = await confirmDestructive('Delete something?', { force: true });
    expect(result).toBe(true);
  });

  test('returns true with force=true even when nonInteractive=true', async () => {
    const result = await confirmDestructive('Delete?', { force: true, nonInteractive: true });
    expect(result).toBe(true);
  });
});

describe('confirmDestructive — non-interactive mode', () => {
  test('throws CliError(usage) when nonInteractive=true and force=false', async () => {
    await expect(
      confirmDestructive('Delete something?', { force: false, nonInteractive: true }),
    ).rejects.toThrow(CliError);
  });

  test('CliError has usage code and exit 2', async () => {
    let caught: CliError | undefined;
    try {
      await confirmDestructive('Delete?', { nonInteractive: true });
    } catch (err) {
      if (err instanceof CliError) caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught?.code).toBe('usage');
    expect(caught?.exit).toBe(2);
  });

  test('CliError hint mentions --force', async () => {
    let caught: CliError | undefined;
    try {
      await confirmDestructive('Delete?', { nonInteractive: true });
    } catch (err) {
      if (err instanceof CliError) caught = err;
    }
    expect(caught?.hint).toContain('--force');
  });

  test('throws CliError when not a TTY (simulated via nonInteractive)', async () => {
    // Simulate CI / piped context via nonInteractive flag
    await expect(
      confirmDestructive('Confirm action?', { nonInteractive: true, force: false }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
