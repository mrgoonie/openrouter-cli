/**
 * Resolve the current environment mode from env vars.
 * Priority: OPENROUTER_ENV > NODE_ENV > 'development'
 */

/**
 * Returns the active mode string for dotenv file selection.
 * Callers use this to construct names like `.env.production.local`.
 */
export function resolveMode(): string {
  return process.env.OPENROUTER_ENV ?? process.env.NODE_ENV ?? 'development';
}
