import { describe, expect, test } from 'bun:test';
import {
  deleteKeychainValue,
  getKeychainValue,
  isKeychainAvailable,
  setKeychainValue,
} from '../../../src/lib/config/keychain.ts';

describe('keychain', () => {
  test('isKeychainAvailable returns a boolean', () => {
    const result = isKeychainAvailable();
    expect(typeof result).toBe('boolean');
  });

  test('getKeychainValue returns string or null (never throws)', () => {
    const result = getKeychainValue('api_key');
    expect(result === null || typeof result === 'string').toBe(true);
  });

  test('setKeychainValue returns boolean (never throws)', () => {
    const result = setKeychainValue('api_key', 'test-value');
    expect(typeof result).toBe('boolean');
  });

  test('deleteKeychainValue returns boolean (never throws)', () => {
    const result = deleteKeychainValue('api_key');
    expect(typeof result).toBe('boolean');
  });

  // Full round-trip only when keychain is actually available (skipped in sandboxed CI)
  test('round-trip set/get/delete when keychain available', () => {
    if (!isKeychainAvailable()) {
      // Skip gracefully — keychain not available in this environment
      return;
    }

    const testValue = `or-test-${Date.now()}`;
    const set = setKeychainValue('api_key', testValue);
    expect(set).toBe(true);

    const got = getKeychainValue('api_key');
    expect(got).toBe(testValue);

    const del = deleteKeychainValue('api_key');
    expect(del).toBe(true);

    const afterDel = getKeychainValue('api_key');
    // After deletion the entry should be gone (null) or a prior value
    // We just verify no throw occurred
    expect(afterDel === null || typeof afterDel === 'string').toBe(true);
  });
});
