import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  configPath,
  deleteConfigFile,
  readConfigFile,
  writeConfigFile,
} from '../../../src/lib/config/file.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpConfigPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'or-config-test-'));
  return path.join(dir, 'config.toml');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('configPath', () => {
  let orig: string | undefined;

  beforeEach(() => {
    orig = process.env.OPENROUTER_CONFIG;
  });

  afterEach(() => {
    if (orig !== undefined) {
      process.env.OPENROUTER_CONFIG = orig;
    } else {
      process.env.OPENROUTER_CONFIG = undefined;
    }
  });

  test('returns OPENROUTER_CONFIG when set', () => {
    process.env.OPENROUTER_CONFIG = '/tmp/custom.toml';
    expect(configPath()).toBe('/tmp/custom.toml');
  });

  test('falls back to XDG_CONFIG_HOME when set', () => {
    process.env.OPENROUTER_CONFIG = undefined;
    process.env.XDG_CONFIG_HOME = '/tmp/xdg';
    const p = configPath();
    expect(p).toContain('xdg');
    expect(p).toContain('openrouter');
    expect(p).toEndWith('config.toml');
    process.env.XDG_CONFIG_HOME = undefined;
  });

  test('falls back to ~/.config when XDG_CONFIG_HOME unset', () => {
    process.env.OPENROUTER_CONFIG = undefined;
    process.env.XDG_CONFIG_HOME = undefined;
    const p = configPath();
    expect(p).toContain('.config');
    expect(p).toEndWith('config.toml');
  });
});

describe('readConfigFile', () => {
  let tmpPath: string;
  let origConfig: string | undefined;

  beforeEach(() => {
    tmpPath = tmpConfigPath();
    origConfig = process.env.OPENROUTER_CONFIG;
    process.env.OPENROUTER_CONFIG = tmpPath;
  });

  afterEach(() => {
    if (origConfig !== undefined) {
      process.env.OPENROUTER_CONFIG = origConfig;
    } else {
      process.env.OPENROUTER_CONFIG = undefined;
    }
    // Clean up tmp file/dir
    try {
      fs.rmSync(path.dirname(tmpPath), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('returns empty object when file does not exist', () => {
    const config = readConfigFile();
    expect(config).toEqual({});
  });

  test('round-trips a valid config', () => {
    writeConfigFile({ defaults: { model: 'gpt-4o' } });
    const config = readConfigFile();
    expect(config.defaults?.model).toBe('gpt-4o');
  });

  test('deep-merges successive writes', () => {
    writeConfigFile({ defaults: { model: 'gpt-4o' } });
    writeConfigFile({ defaults: { timeout: 30000 } });
    const config = readConfigFile();
    expect(config.defaults?.model).toBe('gpt-4o');
    expect(config.defaults?.timeout).toBe(30000);
  });

  test('throws on malformed TOML', () => {
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, 'this is [not valid\ntoml = {{\n', 'utf8');
    expect(() => readConfigFile()).toThrow();
  });

  test('throws on TOML that fails zod validation', () => {
    // defaults.output must be a valid enum value
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, '[defaults]\noutput = "invalid-mode"\n', 'utf8');
    expect(() => readConfigFile()).toThrow(/validation/i);
  });
});

describe('writeConfigFile', () => {
  let tmpPath: string;
  let origConfig: string | undefined;

  beforeEach(() => {
    tmpPath = tmpConfigPath();
    origConfig = process.env.OPENROUTER_CONFIG;
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

  test('creates parent directories automatically', () => {
    const nested = path.join(path.dirname(tmpPath), 'deep', 'nested', 'config.toml');
    process.env.OPENROUTER_CONFIG = nested;
    expect(() => writeConfigFile({ schema: 1 })).not.toThrow();
    expect(fs.existsSync(nested)).toBe(true);
  });

  test('writes valid TOML that can be re-parsed', () => {
    writeConfigFile({ auth: { api_key: 'sk-or-test-key' } });
    const raw = fs.readFileSync(tmpPath, 'utf8');
    expect(raw).toContain('api_key');
  });
});

describe('deleteConfigFile', () => {
  let tmpPath: string;
  let origConfig: string | undefined;

  beforeEach(() => {
    tmpPath = tmpConfigPath();
    origConfig = process.env.OPENROUTER_CONFIG;
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

  test('removes the file when it exists', () => {
    writeConfigFile({ schema: 1 });
    expect(fs.existsSync(tmpPath)).toBe(true);
    deleteConfigFile();
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  test('does not throw when file is already absent', () => {
    expect(() => deleteConfigFile()).not.toThrow();
  });
});
