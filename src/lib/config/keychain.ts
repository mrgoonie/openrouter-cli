/**
 * OS keychain wrapper around @napi-rs/keyring.
 * Uses the class-based Entry API: `new Entry(service, account).setPassword(value)`.
 * Lazy-loads the native module; if unavailable (missing libsecret, sandboxed env, etc.)
 * all operations become no-ops and a one-time warning is emitted to stderr.
 */

const SERVICE = 'openrouter';

export type KeychainAccount = 'api_key' | 'management_key' | 'refresh_token';

// ---------- lazy load state ----------

type EntryClass = {
  new (service: string, account: string): EntryInstance;
};

type EntryInstance = {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
};

let _EntryClass: EntryClass | null | 'unloaded' = 'unloaded';
let _warnedOnce = false;

function loadEntry(): EntryClass | null {
  if (_EntryClass !== 'unloaded') return _EntryClass;

  try {
    // Dynamic require — @napi-rs/keyring is a native addon; static import would
    // fail at bundle time on platforms where the prebuilt binary is absent.
    // biome-ignore lint/suspicious/noExplicitAny: dynamic native module import
    const mod = require('@napi-rs/keyring') as any;
    _EntryClass = mod.Entry as EntryClass;
  } catch {
    _EntryClass = null;
    if (!_warnedOnce) {
      _warnedOnce = true;
      process.stderr.write(
        '[openrouter] Warning: OS keychain unavailable (@napi-rs/keyring failed to load). ' +
          'API keys will not be read from or saved to the system keychain.\n',
      );
    }
  }

  return _EntryClass;
}

function makeEntry(account: KeychainAccount): EntryInstance | null {
  const Cls = loadEntry();
  if (!Cls) return null;
  try {
    return new Cls(SERVICE, account);
  } catch {
    return null;
  }
}

// ---------- public API ----------

/** Returns true when the native keyring module loaded successfully. */
export function isKeychainAvailable(): boolean {
  return loadEntry() !== null;
}

/**
 * Retrieve a credential from the OS keychain.
 * Returns `null` when the keychain is unavailable or the entry does not exist.
 */
export function getKeychainValue(account: KeychainAccount): string | null {
  const entry = makeEntry(account);
  if (!entry) return null;
  try {
    return entry.getPassword();
  } catch {
    return null;
  }
}

/**
 * Store a credential in the OS keychain.
 * Returns `false` when the keychain is unavailable or the write fails.
 */
export function setKeychainValue(account: KeychainAccount, value: string): boolean {
  const entry = makeEntry(account);
  if (!entry) return false;
  try {
    entry.setPassword(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a credential from the OS keychain.
 * Returns `false` when the keychain is unavailable or the entry doesn't exist.
 */
export function deleteKeychainValue(account: KeychainAccount): boolean {
  const entry = makeEntry(account);
  if (!entry) return false;
  try {
    return entry.deletePassword();
  } catch {
    return false;
  }
}
