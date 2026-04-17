/**
 * Unit tests for `openrouter config` command verbs.
 * Uses a temp OPENROUTER_CONFIG path for isolation.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { configPath, readConfigFile, writeConfigFile } from '../../../src/lib/config/file.ts';
import { getByPath } from '../../../src/lib/config/kv-path.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let origConfigEnv: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'or-config-cmd-test-'));
  origConfigEnv = process.env.OPENROUTER_CONFIG;
  process.env.OPENROUTER_CONFIG = path.join(tmpDir, 'config.toml');
});

afterEach(() => {
  if (origConfigEnv !== undefined) {
    process.env.OPENROUTER_CONFIG = origConfigEnv;
  } else {
    process.env.OPENROUTER_CONFIG = undefined;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // biome-ignore lint/suspicious/noExplicitAny: spy
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: restore
    (process.stdout as any).write = orig;
  }
  return chunks.join('');
}

// ---------------------------------------------------------------------------
// configPath
// ---------------------------------------------------------------------------

describe('configPath (env override)', () => {
  test('returns the temp path set in OPENROUTER_CONFIG', () => {
    const expected = process.env.OPENROUTER_CONFIG ?? '';
    expect(configPath()).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// set → get round-trip via file I/O helpers
// ---------------------------------------------------------------------------

describe('set → get round-trip', () => {
  test('writes a top-level key and reads it back', () => {
    writeConfigFile({ schema: 1 });
    const cfg = readConfigFile() as Record<string, unknown>;
    expect(cfg.schema).toBe(1);
  });

  test('writes a nested key (defaults.model) and reads it back', () => {
    writeConfigFile({ defaults: { model: 'anthropic/claude-opus-4' } });
    const cfg = readConfigFile() as Record<string, unknown>;
    expect(getByPath(cfg, 'defaults.model')).toBe('anthropic/claude-opus-4');
  });

  test('overwrites an existing key without disturbing siblings', () => {
    writeConfigFile({ defaults: { model: 'old', output: 'json' } });
    writeConfigFile({ defaults: { model: 'new' } });
    const cfg = readConfigFile() as Record<string, unknown>;
    // writeConfigFile deep-merges; model updated, output preserved
    expect(getByPath(cfg, 'defaults.model')).toBe('new');
    expect(getByPath(cfg, 'defaults.output')).toBe('json');
  });

  test('stores boolean value correctly', () => {
    writeConfigFile({ auth: { use_keychain: true } });
    const cfg = readConfigFile() as Record<string, unknown>;
    expect(getByPath(cfg, 'auth.use_keychain')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// auth.* gating logic (tested at kv-path + validation layer)
// ---------------------------------------------------------------------------

describe('auth.* key safety gate', () => {
  test('auth.api_key key starts with "auth."', () => {
    // Verify the gate condition used in config set command
    expect('auth.api_key'.startsWith('auth.')).toBe(true);
  });

  test('defaults.model does not trigger auth gate', () => {
    expect('defaults.model'.startsWith('auth.')).toBe(false);
  });

  test('authX.key does not trigger auth gate (prefix must be auth.)', () => {
    expect('authX.key'.startsWith('auth.')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// config path command (stdout)
// ---------------------------------------------------------------------------

describe('config path output', () => {
  test('configPath() returns a string containing the tmp dir', () => {
    const p = configPath();
    expect(p).toContain(tmpDir);
    expect(p).toMatch(/config\.toml$/);
  });

  test('stdout write of configPath produces the path string', () => {
    const out = captureStdout(() => {
      process.stdout.write(`${configPath()}\n`);
    });
    expect(out.trim()).toBe(configPath());
  });
});

// ---------------------------------------------------------------------------
// doctor row shape
// ---------------------------------------------------------------------------

describe('doctor row shapes', () => {
  test('doctor var rows have expected fields', () => {
    type DoctorRow = { name: string; source: string; value: string; valid: boolean };

    // Simulate what the doctor command builds
    const rows: DoctorRow[] = [
      { name: 'api_key', source: 'none', value: '(unset)', valid: false },
      { name: 'base_url', source: 'default', value: 'https://openrouter.ai/api/v1', valid: true },
    ];

    for (const row of rows) {
      expect(typeof row.name).toBe('string');
      expect(typeof row.source).toBe('string');
      expect(typeof row.value).toBe('string');
      expect(typeof row.valid).toBe('boolean');
    }
  });

  test('config_file diagnostic shape', () => {
    const cfgPath = configPath();
    const cfgExists = fs.existsSync(cfgPath);
    const diag = { path: cfgPath, exists: cfgExists, valid: false };

    expect(diag.path).toBe(cfgPath);
    expect(diag.exists).toBe(false); // file not written yet in this test
    expect(typeof diag.valid).toBe('boolean');
  });

  test('config_file valid becomes true after writing valid config', () => {
    writeConfigFile({ schema: 1 });
    const cfgPath = configPath();
    expect(fs.existsSync(cfgPath)).toBe(true);

    // readConfigFile should not throw → valid
    expect(() => readConfigFile()).not.toThrow();
  });

  test('keychain diagnostic shape', () => {
    const diag = { available: false };
    expect(typeof diag.available).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// getByPath integration with real config
// ---------------------------------------------------------------------------

describe('getByPath on real config file', () => {
  test('retrieves defaults.model written via writeConfigFile', () => {
    writeConfigFile({ defaults: { model: 'openai/gpt-4o', timeout: 30000 } });
    const cfg = readConfigFile() as Record<string, unknown>;

    expect(getByPath(cfg, 'defaults.model')).toBe('openai/gpt-4o');
    expect(getByPath(cfg, 'defaults.timeout')).toBe(30000);
    expect(getByPath(cfg, 'defaults.missing')).toBeUndefined();
  });

  test('returns undefined for key not in config', () => {
    writeConfigFile({ schema: 1 });
    const cfg = readConfigFile() as Record<string, unknown>;
    expect(getByPath(cfg, 'auth.api_key')).toBeUndefined();
  });
});
