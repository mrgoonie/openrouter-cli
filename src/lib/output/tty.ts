/** TTY / environment detection utilities. Zero external deps. */

/** True when stdout is an interactive terminal. */
export function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

/** True when running inside a known CI environment. */
export function isCI(): boolean {
  return Boolean(
    process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.BUILDKITE ||
      process.env.JENKINS_URL ||
      process.env.TRAVIS ||
      process.env.CIRCLECI,
  );
}

/** True when prompts / spinners must not be shown. */
export function isNonInteractive(): boolean {
  return isCI() || !isTTY();
}

/** True when ANSI colors should be emitted. Honors NO_COLOR spec. */
export function shouldColor(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  return isTTY();
}

export type OutputMode = 'json' | 'ndjson' | 'table' | 'text' | 'yaml' | 'pretty';

const VALID_MODES = new Set<string>(['json', 'ndjson', 'table', 'text', 'yaml', 'pretty', 'auto']);

/**
 * Resolve the output mode from a CLI flag value.
 *
 * - Explicit valid mode → that mode (never overridden by TTY state)
 * - `'auto'` or undefined → `'pretty'` if interactive TTY, else `'json'`
 * - Unknown string → treated as `'auto'`
 */
export function resolveOutputMode(flag?: string): OutputMode {
  if (flag && flag !== 'auto' && VALID_MODES.has(flag)) {
    return flag as OutputMode;
  }
  // auto: pretty when interactive, json when piped/CI
  return isTTY() && !isCI() ? 'pretty' : 'json';
}
