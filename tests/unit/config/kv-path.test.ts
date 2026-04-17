/**
 * Unit tests for kv-path helpers: getByPath, setByPath, unsetByPath, parseValue.
 */

import { describe, expect, test } from 'bun:test';
import { getByPath, parseValue, setByPath, unsetByPath } from '../../../src/lib/config/kv-path.ts';

// ---------------------------------------------------------------------------
// getByPath
// ---------------------------------------------------------------------------

describe('getByPath', () => {
  test('retrieves a top-level key', () => {
    expect(getByPath({ a: 1 }, 'a')).toBe(1);
  });

  test('retrieves a two-level nested key', () => {
    expect(getByPath({ a: { b: 'hello' } }, 'a.b')).toBe('hello');
  });

  test('retrieves a three-level nested key', () => {
    expect(getByPath({ a: { b: { c: true } } }, 'a.b.c')).toBe(true);
  });

  test('returns undefined for missing key', () => {
    expect(getByPath({ a: 1 }, 'b')).toBeUndefined();
  });

  test('returns undefined when intermediate key is missing', () => {
    expect(getByPath({ a: { b: 1 } }, 'a.c.d')).toBeUndefined();
  });

  test('returns undefined when path traverses a non-object', () => {
    expect(getByPath({ a: 42 }, 'a.b')).toBeUndefined();
  });

  test('returns null when stored value is null', () => {
    expect(getByPath({ a: null }, 'a')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setByPath
// ---------------------------------------------------------------------------

describe('setByPath', () => {
  test('sets a top-level key', () => {
    const result = setByPath({}, 'x', 42);
    expect(result).toEqual({ x: 42 });
  });

  test('sets a two-level nested key', () => {
    const result = setByPath({}, 'defaults.model', 'gpt-4o');
    expect(result).toEqual({ defaults: { model: 'gpt-4o' } });
  });

  test('sets a three-level nested key', () => {
    const result = setByPath({}, 'a.b.c', true);
    expect(result).toEqual({ a: { b: { c: true } } });
  });

  test('preserves existing sibling keys', () => {
    const obj = { defaults: { model: 'old', output: 'json' } };
    const result = setByPath(obj, 'defaults.model', 'new');
    expect(result).toEqual({ defaults: { model: 'new', output: 'json' } });
  });

  test('does not mutate the original object', () => {
    const orig = { a: { b: 1 } };
    setByPath(orig, 'a.b', 99);
    expect(orig.a.b).toBe(1);
  });

  test('overwrites a primitive along the path', () => {
    // 'a' was a number; setting 'a.b' should turn 'a' into an object
    const result = setByPath({ a: 42 }, 'a.b', 'x');
    expect(result).toEqual({ a: { b: 'x' } });
  });
});

// ---------------------------------------------------------------------------
// unsetByPath
// ---------------------------------------------------------------------------

describe('unsetByPath', () => {
  test('removes a top-level key', () => {
    const result = unsetByPath({ a: 1, b: 2 }, 'a');
    expect(result).toEqual({ b: 2 });
  });

  test('removes a nested key', () => {
    const result = unsetByPath({ defaults: { model: 'gpt-4o', output: 'json' } }, 'defaults.model');
    expect(result).toEqual({ defaults: { output: 'json' } });
  });

  test('removes a three-level nested key', () => {
    const obj = { a: { b: { c: 1, d: 2 } } };
    const result = unsetByPath(obj, 'a.b.c');
    expect(result).toEqual({ a: { b: { d: 2 } } });
  });

  test('no-ops when key does not exist', () => {
    const obj = { a: 1 };
    const result = unsetByPath(obj, 'b');
    expect(result).toEqual({ a: 1 });
  });

  test('no-ops when intermediate path does not exist', () => {
    const obj = { a: 1 };
    const result = unsetByPath(obj, 'x.y.z');
    expect(result).toEqual({ a: 1 });
  });

  test('does not mutate the original object', () => {
    const orig = { a: { b: 1 } };
    unsetByPath(orig, 'a.b');
    expect(orig.a.b).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// parseValue
// ---------------------------------------------------------------------------

describe('parseValue', () => {
  test('parses "true" as boolean true', () => {
    expect(parseValue('true')).toBe(true);
  });

  test('parses "false" as boolean false', () => {
    expect(parseValue('false')).toBe(false);
  });

  test('parses "null" as null', () => {
    expect(parseValue('null')).toBeNull();
  });

  test('parses integer string as number', () => {
    expect(parseValue('42')).toBe(42);
  });

  test('parses float string as number', () => {
    expect(parseValue('3.14')).toBeCloseTo(3.14);
  });

  test('parses zero as number', () => {
    expect(parseValue('0')).toBe(0);
  });

  test('parses plain string as string', () => {
    expect(parseValue('hello')).toBe('hello');
  });

  test('parses model id string as string', () => {
    expect(parseValue('anthropic/claude-opus-4')).toBe('anthropic/claude-opus-4');
  });

  test('parses URL string as string', () => {
    expect(parseValue('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1');
  });

  test('parses empty string as string', () => {
    expect(parseValue('')).toBe('');
  });
});
