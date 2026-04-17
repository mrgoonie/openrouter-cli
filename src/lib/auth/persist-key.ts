/**
 * Key persistence layer — stores and retrieves API/management keys from either
 * the OS keychain or the TOML config file, depending on user preference.
 *
 * Keychain account names: 'api_key' | 'management_key'
 * Config paths:            auth.api_key | auth.management_key
 */

import { readConfigFile, writeConfigFile } from '../config/file.ts';
import {
  deleteKeychainValue,
  getKeychainValue,
  isKeychainAvailable,
  setKeychainValue,
} from '../config/keychain.ts';
import type { KeychainAccount } from '../config/keychain.ts';

export type KeyKind = 'api' | 'management';
export type KeySource = 'keychain' | 'config';

/** Map logical kind to keychain account name. */
function toKeychainAccount(kind: KeyKind): KeychainAccount {
  return kind === 'management' ? 'management_key' : 'api_key';
}

/**
 * Persist a key value to the keychain (preferred) or config file.
 * Returns which storage backend was actually used.
 */
export function persistKey(
  value: string,
  opts: { useKeychain: boolean; kind: KeyKind },
): { stored: KeySource } {
  if (opts.useKeychain && isKeychainAvailable()) {
    const ok = setKeychainValue(toKeychainAccount(opts.kind), value);
    if (ok) return { stored: 'keychain' };
    // Fall through to config on keychain write failure
  }

  const patch =
    opts.kind === 'management' ? { auth: { management_key: value } } : { auth: { api_key: value } };

  writeConfigFile(patch);
  return { stored: 'config' };
}

/**
 * Remove a key from both the keychain and the config file.
 * Best-effort: does not throw on individual failures.
 */
export function clearKey(opts: { kind: KeyKind }): void {
  // Keychain — best-effort
  try {
    if (isKeychainAvailable()) {
      deleteKeychainValue(toKeychainAccount(opts.kind));
    }
  } catch {
    /* ignore */
  }

  // Config file — write undefined to clear the field
  try {
    const patch =
      opts.kind === 'management'
        ? { auth: { management_key: undefined as unknown as string } }
        : { auth: { api_key: undefined as unknown as string } };
    writeConfigFile(patch);
  } catch {
    /* ignore */
  }
}

/**
 * Load a persisted key, checking keychain first then config file.
 * Returns null if the key is not found in either location.
 */
export function loadPersistedKey(opts: { kind: KeyKind }): {
  value: string;
  source: KeySource;
} | null {
  // 1. Keychain
  if (isKeychainAvailable()) {
    const val = getKeychainValue(toKeychainAccount(opts.kind));
    if (val !== null && val !== '') return { value: val, source: 'keychain' };
  }

  // 2. Config file
  try {
    const config = readConfigFile();
    const val = opts.kind === 'management' ? config.auth?.management_key : config.auth?.api_key;
    if (val !== undefined && val !== '') return { value: val, source: 'config' };
  } catch {
    /* ignore read errors */
  }

  return null;
}
