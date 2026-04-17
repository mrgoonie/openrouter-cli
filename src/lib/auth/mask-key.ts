/**
 * Key masking utility — prevents full API keys from appearing in logs or terminal output.
 * Shows first 10 chars + ellipsis + last 4 chars for keys >= 12 chars long.
 */

/**
 * Mask an API key for safe display.
 * - Shorter than 12 chars → `***`
 * - Otherwise → `<first 10>…<last 4>`
 */
export function maskKey(key: string): string {
  if (key.length < 12) return '***';
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}
