/**
 * Destructive-action confirmation helper.
 *
 * Resolution order:
 *  1. `opts.force` → return true immediately (bypass prompt)
 *  2. Non-TTY / non-interactive → throw CliError('usage', ...) with --force hint
 *  3. Interactive TTY → @clack/prompts confirm dialog (initialValue: false for safety)
 */

import * as clack from '@clack/prompts';
import { CliError } from '../errors/exit-codes.ts';

export type ConfirmOpts = {
  /** When true, skip the prompt and return true immediately. */
  force?: boolean;
  /** When true, behave as if running in CI (non-interactive). */
  nonInteractive?: boolean;
};

/**
 * Prompt user to confirm a destructive action.
 * Returns true if confirmed, false if declined (cancel).
 * Throws CliError('usage') in non-TTY environments without --force.
 */
export async function confirmDestructive(message: string, opts: ConfirmOpts): Promise<boolean> {
  // --force bypasses everything
  if (opts.force) return true;

  const isTTY = process.stdin.isTTY === true && process.stdout.isTTY === true;
  const isNonInteractive = opts.nonInteractive === true || !isTTY;

  if (isNonInteractive) {
    throw new CliError(
      'usage',
      'Destructive action requires --force in non-interactive mode',
      'Pass --force to skip confirmation, e.g. openrouter keys delete <id> --force',
    );
  }

  const result = await clack.confirm({ message, initialValue: false });

  // clack returns symbol on cancel (Ctrl+C)
  if (clack.isCancel(result)) return false;

  return result as boolean;
}
