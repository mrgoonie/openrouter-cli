import { describe, expect, test } from 'bun:test';
import { maskKey } from '../../../src/lib/auth/mask-key.ts';

describe('maskKey', () => {
  test('returns *** for keys shorter than 12 chars', () => {
    expect(maskKey('')).toBe('***');
    expect(maskKey('short')).toBe('***');
    expect(maskKey('11chars1234')).toBe('***'); // exactly 11
  });

  test('returns *** for exactly 11 chars (boundary)', () => {
    expect(maskKey('12345678901')).toBe('***');
  });

  test('masks a key of exactly 12 chars', () => {
    // first 10 + ellipsis + last 4 — but 12 chars means last 4 overlaps with first 10
    const key = '123456789012';
    const result = maskKey(key);
    expect(result).toBe('1234567890…9012');
  });

  test('masks a realistic OpenRouter key', () => {
    const key = 'sk-or-v1-abcdefghijklmnopXYZ9';
    const result = maskKey(key);
    expect(result).toStartWith('sk-or-v1-a');
    expect(result).toEndWith('XYZ9');
    expect(result).toContain('…');
    expect(result).not.toContain(key); // full key not exposed
  });

  test('first 10 chars preserved', () => {
    const key = 'sk-or-v1-abc123456789';
    const result = maskKey(key);
    expect(result.startsWith('sk-or-v1-a')).toBe(true);
  });

  test('last 4 chars preserved', () => {
    const key = 'sk-or-v1-abcdef-TAIL';
    const result = maskKey(key);
    expect(result.endsWith('TAIL')).toBe(true);
  });

  test('ellipsis separator present', () => {
    const key = 'sk-or-v1-somekey123456789';
    expect(maskKey(key)).toContain('…');
  });
});
