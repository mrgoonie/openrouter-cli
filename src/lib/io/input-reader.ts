/**
 * Input reader utilities — handles stdin, file paths, and inline string literals.
 * Used by embeddings and rerank commands to abstract input collection.
 */

import { existsSync } from 'node:fs';
import { CliError } from '../errors/exit-codes.ts';

/**
 * Resolve text input from one of three sources (priority order):
 * 1. arg === '-' OR (arg undefined + !process.stdin.isTTY + allowStdinFallback) → stdin
 * 2. arg is a readable filesystem path → Bun.file read
 * 3. arg treated as inline string literal
 *
 * Throws CliError('usage') when no input source is available.
 */
export async function readInputArg(
  arg: string | undefined,
  allowStdinFallback: boolean,
): Promise<string> {
  // Explicit stdin marker OR implicit stdin (pipe detected)
  if (arg === '-' || (arg === undefined && !process.stdin.isTTY && allowStdinFallback)) {
    const text = await Bun.stdin.text();
    return text;
  }

  // No arg and no stdin fallback → caller must handle the error
  if (arg === undefined) {
    throw new CliError(
      'usage',
      'No input provided',
      'Pass --input, --input-file, or pipe via stdin',
    );
  }

  // File path
  if (existsSync(arg)) {
    return Bun.file(arg).text();
  }

  // Inline string literal
  return arg;
}

/**
 * Split raw text into non-empty trimmed lines.
 * Used for batch embeddings (one embedding per line) and rerank documents.
 */
export function readLinesFromSource(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Return UTF-8 byte size of a string.
 */
export function byteSize(text: string): number {
  return new Blob([text]).size;
}

/**
 * Guard against oversized inputs to protect API costs.
 * Throws CliError with hint to use --allow-large if text exceeds limitBytes.
 */
export function refuseLarge(text: string, limitBytes: number, allowLarge: boolean): void {
  if (allowLarge) return;
  if (byteSize(text) > limitBytes) {
    const mb = (limitBytes / 1_000_000).toFixed(0);
    throw new CliError(
      'usage',
      `Input exceeds ${mb} MB limit`,
      'Pass --allow-large to override (may incur significant API costs)',
    );
  }
}
