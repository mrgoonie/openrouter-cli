import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { clearKey, loadPersistedKey, persistKey } from '../../../src/lib/auth/persist-key.ts';
import { isKeychainAvailable } from '../../../src/lib/config/keychain.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpConfigPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'or-persist-test-'));
  return path.join(dir, 'config.toml');
}

// ---------------------------------------------------------------------------
// Tests — config-file path (always exercised; keychain path is conditional)
// ---------------------------------------------------------------------------

describe('persistKey + loadPersistedKey (config backend)', () => {
  let origConfig: string | undefined;
  let tmpPath: string;

  beforeEach(() => {
    origConfig = process.env.OPENROUTER_CONFIG;
    tmpPath = makeTmpConfigPath();
    process.env.OPENROUTER_CONFIG = tmpPath;
  });

  afterEach(() => {
    if (origConfig !== undefined) {
      process.env.OPENROUTER_CONFIG = origConfig;
    } else {
      process.env.OPENROUTER_CONFIG = undefined;
    }
    try {
      fs.rmSync(path.dirname(tmpPath), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('persistKey stores api key in config and returns stored: config', () => {
    const { stored } = persistKey('sk-or-test-key-api', { useKeychain: false, kind: 'api' });
    expect(stored).toBe('config');
    expect(fs.existsSync(tmpPath)).toBe(true);
    const raw = fs.readFileSync(tmpPath, 'utf8');
    expect(raw).toContain('api_key');
  });

  test('persistKey stores management key in config', () => {
    const { stored } = persistKey('sk-or-test-mgmt', { useKeychain: false, kind: 'management' });
    expect(stored).toBe('config');
    const raw = fs.readFileSync(tmpPath, 'utf8');
    expect(raw).toContain('management_key');
  });

  test('loadPersistedKey round-trips api key from config', () => {
    persistKey('sk-or-roundtrip-api', { useKeychain: false, kind: 'api' });
    const result = loadPersistedKey({ kind: 'api' });
    expect(result).not.toBeNull();
    expect(result?.value).toBe('sk-or-roundtrip-api');
    expect(result?.source).toBe('config');
  });

  test('loadPersistedKey round-trips management key from config', () => {
    persistKey('sk-or-roundtrip-mgmt', { useKeychain: false, kind: 'management' });
    const result = loadPersistedKey({ kind: 'management' });
    expect(result?.value).toBe('sk-or-roundtrip-mgmt');
    expect(result?.source).toBe('config');
  });

  test('loadPersistedKey returns null when no key stored', () => {
    const result = loadPersistedKey({ kind: 'api' });
    expect(result).toBeNull();
  });

  test('clearKey removes api key from config', () => {
    persistKey('sk-or-to-clear', { useKeychain: false, kind: 'api' });
    clearKey({ kind: 'api' });
    const result = loadPersistedKey({ kind: 'api' });
    expect(result).toBeNull();
  });

  test('clearKey is best-effort and does not throw when nothing stored', () => {
    expect(() => clearKey({ kind: 'api' })).not.toThrow();
    expect(() => clearKey({ kind: 'management' })).not.toThrow();
  });

  test('api and management keys are stored independently', () => {
    persistKey('sk-or-api-key', { useKeychain: false, kind: 'api' });
    persistKey('sk-or-mgmt-key', { useKeychain: false, kind: 'management' });

    const api = loadPersistedKey({ kind: 'api' });
    const mgmt = loadPersistedKey({ kind: 'management' });

    expect(api?.value).toBe('sk-or-api-key');
    expect(mgmt?.value).toBe('sk-or-mgmt-key');
  });
});

// ---------------------------------------------------------------------------
// Keychain path — only runs when native module is available
// ---------------------------------------------------------------------------

describe('persistKey (keychain backend, conditional)', () => {
  test('falls back to config when keychain unavailable', () => {
    if (isKeychainAvailable()) {
      // Keychain available — this test is N/A; just assert persistKey works
      const origConfig = process.env.OPENROUTER_CONFIG;
      const tmpPath = makeTmpConfigPath();
      process.env.OPENROUTER_CONFIG = tmpPath;
      try {
        // useKeychain: true but we just verify it doesn't throw
        const result = persistKey('sk-or-kc-test', { useKeychain: true, kind: 'api' });
        expect(['keychain', 'config']).toContain(result.stored);
      } finally {
        if (origConfig !== undefined) {
          process.env.OPENROUTER_CONFIG = origConfig;
        } else {
          process.env.OPENROUTER_CONFIG = undefined;
        }
        try {
          fs.rmSync(path.dirname(tmpPath), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    } else {
      // Keychain unavailable — useKeychain: true must fall back to config
      const origConfig = process.env.OPENROUTER_CONFIG;
      const tmpPath = makeTmpConfigPath();
      process.env.OPENROUTER_CONFIG = tmpPath;
      try {
        const { stored } = persistKey('sk-or-fallback', { useKeychain: true, kind: 'api' });
        expect(stored).toBe('config');
      } finally {
        if (origConfig !== undefined) {
          process.env.OPENROUTER_CONFIG = origConfig;
        } else {
          process.env.OPENROUTER_CONFIG = undefined;
        }
        try {
          fs.rmSync(path.dirname(tmpPath), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  });
});
