/**
 * Unit tests for src/lib/io/input-reader.ts
 * Covers: inline string, file path, line splitting, size guard.
 * Stdin branch tested indirectly (requires non-TTY environment).
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';
import {
  byteSize,
  readInputArg,
  readLinesFromSource,
  refuseLarge,
} from '../../../src/lib/io/input-reader.ts';

const TMP = tmpdir();

// Track temp files for cleanup
const tempFiles: string[] = [];

afterEach(async () => {
  for (const f of tempFiles) {
    await unlink(f).catch(() => {});
  }
  tempFiles.length = 0;
});

async function writeTempFile(name: string, content: string): Promise<string> {
  const path = join(TMP, name);
  await Bun.write(path, content);
  tempFiles.push(path);
  return path;
}

// ---------------------------------------------------------------------------
// readInputArg — inline string case
// ---------------------------------------------------------------------------

describe('readInputArg — inline string', () => {
  test('returns the arg directly when it is not a path', async () => {
    const result = await readInputArg('hello world', false);
    expect(result).toBe('hello world');
  });

  test('returns empty string arg as-is (not a path)', async () => {
    // Empty string is not a valid path on any OS
    const result = await readInputArg('', false);
    expect(result).toBe('');
  });

  test('returns multi-line inline string as-is', async () => {
    const text = 'line1\nline2\nline3';
    const result = await readInputArg(text, false);
    expect(result).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// readInputArg — file path case
// ---------------------------------------------------------------------------

describe('readInputArg — file path', () => {
  test('reads file contents when arg is a valid path', async () => {
    const path = await writeTempFile('input-reader-test-basic.txt', 'file content here');
    const result = await readInputArg(path, false);
    expect(result).toBe('file content here');
  });

  test('reads multi-line file correctly', async () => {
    const content = 'apple\nbanana\ncherry\n';
    const path = await writeTempFile('input-reader-test-multiline.txt', content);
    const result = await readInputArg(path, false);
    expect(result).toBe(content);
  });

  test('reads empty file as empty string', async () => {
    const path = await writeTempFile('input-reader-test-empty.txt', '');
    const result = await readInputArg(path, false);
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// readInputArg — error when no input available
// ---------------------------------------------------------------------------

describe('readInputArg — missing arg no stdin fallback', () => {
  test('throws CliError usage when arg is undefined and allowStdinFallback=false', async () => {
    // process.stdin.isTTY is true in test environment, so stdin branch won't trigger
    // With allowStdinFallback=false, always throws
    expect(readInputArg(undefined, false)).rejects.toThrow(CliError);
  });

  test('thrown CliError has usage code', async () => {
    try {
      await readInputArg(undefined, false);
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe('usage');
    }
  });
});

// ---------------------------------------------------------------------------
// readLinesFromSource
// ---------------------------------------------------------------------------

describe('readLinesFromSource', () => {
  test('splits on newlines and trims whitespace', () => {
    expect(readLinesFromSource('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  test('drops empty lines', () => {
    expect(readLinesFromSource('a\n\nb\n')).toEqual(['a', 'b']);
  });

  test('trims lines with leading/trailing spaces', () => {
    expect(readLinesFromSource('  foo  \n  bar  \n')).toEqual(['foo', 'bar']);
  });

  test('returns empty array for blank text', () => {
    expect(readLinesFromSource('\n\n  \n')).toEqual([]);
  });

  test('handles single line without trailing newline', () => {
    expect(readLinesFromSource('only one')).toEqual(['only one']);
  });

  test('handles Windows-style CRLF after trim', () => {
    // \r gets trimmed by .trim()
    expect(readLinesFromSource('line1\r\nline2\r\n')).toEqual(['line1', 'line2']);
  });
});

// ---------------------------------------------------------------------------
// byteSize
// ---------------------------------------------------------------------------

describe('byteSize', () => {
  test('returns correct byte count for ASCII', () => {
    expect(byteSize('hello')).toBe(5);
  });

  test('returns correct byte count for multi-byte UTF-8', () => {
    // '€' is 3 bytes in UTF-8
    expect(byteSize('€')).toBe(3);
  });

  test('returns 0 for empty string', () => {
    expect(byteSize('')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// refuseLarge
// ---------------------------------------------------------------------------

describe('refuseLarge', () => {
  test('throws CliError when text exceeds limit and allowLarge=false', () => {
    const text = 'a'.repeat(20); // 20 bytes
    expect(() => refuseLarge(text, 10, false)).toThrow(CliError);
  });

  test('thrown CliError has usage code', () => {
    try {
      refuseLarge('a'.repeat(20), 10, false);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe('usage');
    }
  });

  test('thrown CliError hint mentions --allow-large', () => {
    try {
      refuseLarge('a'.repeat(20), 10, false);
    } catch (err) {
      expect((err as CliError).hint).toContain('--allow-large');
    }
  });

  test('does NOT throw when text is within limit', () => {
    expect(() => refuseLarge('hello', 10, false)).not.toThrow();
  });

  test('does NOT throw when allowLarge=true regardless of size', () => {
    const huge = 'x'.repeat(50);
    expect(() => refuseLarge(huge, 10, true)).not.toThrow();
  });

  test('does NOT throw when text is exactly at the limit', () => {
    const text = 'a'.repeat(10); // exactly 10 bytes
    expect(() => refuseLarge(text, 10, false)).not.toThrow();
  });
});
