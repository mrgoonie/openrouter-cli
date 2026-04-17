/**
 * Parse human-readable duration strings to milliseconds.
 * Supports: ms, s, m, h suffixes. Plain numbers treated as milliseconds.
 * Examples: '2s' → 2000, '20m' → 1200000, '500ms' → 500, '1h' → 3600000
 */

import { CliError } from '../errors/exit-codes.ts';

/**
 * Parse a duration string like '2s', '20m', '500ms', '1h' into milliseconds.
 * Throws CliError('usage') on unrecognised format.
 */
export function parseDuration(s: string): number {
  const trimmed = s.trim();
  if (trimmed === '') throw invalidDuration(s);

  if (trimmed.endsWith('ms')) {
    const n = Number(trimmed.slice(0, -2));
    if (!Number.isFinite(n) || n < 0) throw invalidDuration(s);
    return n;
  }
  if (trimmed.endsWith('h')) {
    const n = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(n) || n < 0) throw invalidDuration(s);
    return n * 3_600_000;
  }
  if (trimmed.endsWith('m')) {
    const n = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(n) || n < 0) throw invalidDuration(s);
    return n * 60_000;
  }
  if (trimmed.endsWith('s')) {
    const n = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(n) || n < 0) throw invalidDuration(s);
    return n * 1_000;
  }

  // Plain number — assume milliseconds
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) throw invalidDuration(s);
  return n;
}

function invalidDuration(s: string): CliError {
  return new CliError(
    'usage',
    `invalid duration: '${s}'`,
    "use a number with suffix: '500ms', '2s', '20m', '1h'",
  );
}
