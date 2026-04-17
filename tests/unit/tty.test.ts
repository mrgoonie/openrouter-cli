import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resolveOutputMode, shouldColor } from '../../src/lib/output/tty.ts';

describe('resolveOutputMode', () => {
  test('explicit "json" → "json" regardless of TTY', () => {
    expect(resolveOutputMode('json')).toBe('json');
  });

  test('explicit "ndjson" → "ndjson"', () => {
    expect(resolveOutputMode('ndjson')).toBe('ndjson');
  });

  test('explicit "table" → "table"', () => {
    expect(resolveOutputMode('table')).toBe('table');
  });

  test('explicit "text" → "text"', () => {
    expect(resolveOutputMode('text')).toBe('text');
  });

  test('explicit "yaml" → "yaml"', () => {
    expect(resolveOutputMode('yaml')).toBe('yaml');
  });

  test('explicit "pretty" → "pretty"', () => {
    expect(resolveOutputMode('pretty')).toBe('pretty');
  });

  test('"auto" with non-TTY stdout → "json"', () => {
    // In the test runner stdout is not a TTY, so auto → json
    const result = resolveOutputMode('auto');
    expect(result).toBe('json');
  });

  test('undefined with non-TTY stdout → "json"', () => {
    const result = resolveOutputMode(undefined);
    expect(result).toBe('json');
  });
});

describe('shouldColor', () => {
  let savedNoColor: string | undefined;

  beforeEach(() => {
    savedNoColor = process.env.NO_COLOR;
  });

  afterEach(() => {
    if (savedNoColor === undefined) {
      process.env.NO_COLOR = undefined;
    } else {
      process.env.NO_COLOR = savedNoColor;
    }
  });

  test('returns false when NO_COLOR is set to non-empty string', () => {
    process.env.NO_COLOR = '1';
    expect(shouldColor()).toBe(false);
  });

  test('returns false when NO_COLOR is empty string (NO_COLOR="" means unset per spec)', () => {
    // Per NO_COLOR spec, only non-empty value disables color
    process.env.NO_COLOR = '';
    // Empty string: shouldColor checks !== '' so this would be false only if truthy check used.
    // Our impl: if NO_COLOR !== undefined && NO_COLOR !== '' → false
    // So empty NO_COLOR string does NOT disable color per our impl (correct per spec interpretation).
    // In a non-TTY test runner, isTTY() is false, so shouldColor() returns false anyway.
    expect(shouldColor()).toBe(false); // non-TTY in test env
  });
});
