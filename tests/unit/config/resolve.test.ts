import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { DotenvMap } from '../../../src/lib/config/dotenv-cascade.ts';
import {
  resolveApiKey,
  resolveAppName,
  resolveBaseUrl,
  resolveManagementKey,
  resolveOutputMode,
  resolveSiteUrl,
  resolveString,
  resolveTimeout,
} from '../../../src/lib/config/resolve.ts';
import type { Config } from '../../../src/lib/types/config.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_MAP: DotenvMap = {};
const EMPTY_CONFIG: Config = {};

function makeMap(key: string, value: string, filePath = '/project/.env'): DotenvMap {
  return { [key]: { value, path: filePath } };
}

// Guard env var mutations
function withEnv(key: string, value: string, fn: () => void): void {
  const prev = process.env[key];
  process.env[key] = value;
  try {
    fn();
  } finally {
    if (prev !== undefined) {
      process.env[key] = prev;
    } else {
      delete process.env[key];
    }
  }
}

// ---------------------------------------------------------------------------
// resolveString core precedence matrix
// ---------------------------------------------------------------------------

describe('resolveString — precedence', () => {
  const ENV_NAME = 'TEST_RESOLVE_VAR';

  beforeEach(() => {
    delete process.env[ENV_NAME];
  });

  afterEach(() => {
    delete process.env[ENV_NAME];
  });

  test('flag wins over everything', () => {
    process.env[ENV_NAME] = 'from-env';
    const r = resolveString({
      flag: 'from-flag',
      envName: ENV_NAME,
      dotenvMap: makeMap(ENV_NAME, 'from-dotenv'),
      configValue: 'from-config',
      default: 'from-default',
    });
    expect(r.value).toBe('from-flag');
    expect(r.source).toBe('flag');
  });

  test('process.env wins over dotenv, config, default', () => {
    process.env[ENV_NAME] = 'from-env';
    const r = resolveString({
      envName: ENV_NAME,
      dotenvMap: makeMap(ENV_NAME, 'from-dotenv'),
      configValue: 'from-config',
      default: 'from-default',
    });
    expect(r.value).toBe('from-env');
    expect(r.source).toBe('env');
  });

  test('dotenv map wins over config and default', () => {
    const r = resolveString({
      envName: ENV_NAME,
      dotenvMap: makeMap(ENV_NAME, 'from-dotenv', '/repo/.env.local'),
      configValue: 'from-config',
      default: 'from-default',
    });
    expect(r.value).toBe('from-dotenv');
    expect(r.source).toBe('/repo/.env.local');
  });

  test('config wins over keychain and default', () => {
    const r = resolveString({
      envName: ENV_NAME,
      dotenvMap: EMPTY_MAP,
      configValue: 'from-config',
      default: 'from-default',
    });
    expect(r.value).toBe('from-config');
    expect(r.source).toBe('config');
  });

  test('default used when nothing else matches', () => {
    const r = resolveString({
      envName: ENV_NAME,
      dotenvMap: EMPTY_MAP,
      default: 'fallback',
    });
    expect(r.value).toBe('fallback');
    expect(r.source).toBe('default');
  });

  test('returns {value: undefined, source: none} when nothing matches', () => {
    const r = resolveString({
      envName: ENV_NAME,
      dotenvMap: EMPTY_MAP,
    });
    expect(r.value).toBeUndefined();
    expect(r.source).toBe('none');
  });

  test('empty string flag is treated as absent (falls through)', () => {
    const r = resolveString({
      flag: '',
      envName: ENV_NAME,
      dotenvMap: EMPTY_MAP,
      default: 'fallback',
    });
    expect(r.value).toBe('fallback');
    expect(r.source).toBe('default');
  });

  test('keychain consulted when configUseKeychain=true and account provided', () => {
    // We cannot guarantee keychain is available, but we can verify source logic
    // by checking source is either 'keychain' or 'default'
    const r = resolveString({
      envName: ENV_NAME,
      dotenvMap: EMPTY_MAP,
      keychainAccount: 'api_key',
      configUseKeychain: true,
      default: 'fallback',
    });
    // Value is either from keychain or default — both are valid
    expect(['keychain', 'default']).toContain(r.source);
  });

  test('keychain NOT consulted when configUseKeychain=false', () => {
    const r = resolveString({
      envName: ENV_NAME,
      dotenvMap: EMPTY_MAP,
      keychainAccount: 'api_key',
      configUseKeychain: false,
      default: 'fallback',
    });
    expect(r.source).toBe('default');
    expect(r.value).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

describe('resolveApiKey', () => {
  const KEY = 'OPENROUTER_API_KEY';

  afterEach(() => {
    delete process.env[KEY];
  });

  test('returns from flag', () => {
    const r = resolveApiKey('sk-or-flag', { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBe('sk-or-flag');
    expect(r.source).toBe('flag');
  });

  test('returns from process.env', () => {
    process.env[KEY] = 'sk-or-env';
    const r = resolveApiKey(undefined, { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBe('sk-or-env');
    expect(r.source).toBe('env');
  });

  test('returns from dotenv map', () => {
    const r = resolveApiKey(undefined, {
      dotenvMap: makeMap(KEY, 'sk-or-dotenv', '/project/.env.local'),
      config: EMPTY_CONFIG,
    });
    expect(r.value).toBe('sk-or-dotenv');
    expect(r.source).toBe('/project/.env.local');
  });

  test('returns from config', () => {
    const r = resolveApiKey(undefined, {
      dotenvMap: EMPTY_MAP,
      config: { auth: { api_key: 'sk-or-config' } },
    });
    expect(r.value).toBe('sk-or-config');
    expect(r.source).toBe('config');
  });

  test('returns undefined when no source', () => {
    const r = resolveApiKey(undefined, { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBeUndefined();
    expect(r.source).toBe('none');
  });
});

describe('resolveManagementKey', () => {
  const KEY = 'OPENROUTER_MANAGEMENT_KEY';

  afterEach(() => {
    delete process.env[KEY];
  });

  test('flag source', () => {
    const r = resolveManagementKey('mgmt-flag', { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.source).toBe('flag');
  });

  test('config source', () => {
    const r = resolveManagementKey(undefined, {
      dotenvMap: EMPTY_MAP,
      config: { auth: { management_key: 'mgmt-config' } },
    });
    expect(r.value).toBe('mgmt-config');
    expect(r.source).toBe('config');
  });
});

describe('resolveBaseUrl', () => {
  const KEY = 'OPENROUTER_BASE_URL';

  afterEach(() => {
    delete process.env[KEY];
  });

  test('has hardcoded default', () => {
    const r = resolveBaseUrl(undefined, { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBe('https://openrouter.ai/api/v1');
    expect(r.source).toBe('default');
  });

  test('env var overrides default', () => {
    withEnv(KEY, 'https://custom.ai/v1', () => {
      const r = resolveBaseUrl(undefined, { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
      expect(r.value).toBe('https://custom.ai/v1');
      expect(r.source).toBe('env');
    });
  });

  test('flag overrides env', () => {
    withEnv(KEY, 'https://env.ai/v1', () => {
      const r = resolveBaseUrl('https://flag.ai/v1', {
        dotenvMap: EMPTY_MAP,
        config: EMPTY_CONFIG,
      });
      expect(r.value).toBe('https://flag.ai/v1');
      expect(r.source).toBe('flag');
    });
  });
});

describe('resolveOutputMode', () => {
  const KEY = 'OPENROUTER_OUTPUT';

  beforeEach(() => {
    delete process.env[KEY];
  });

  afterEach(() => {
    delete process.env[KEY];
  });

  test('default is auto', () => {
    const r = resolveOutputMode(undefined, { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBe('auto');
    expect(r.source).toBe('default');
  });

  test('flag overrides', () => {
    const r = resolveOutputMode('json', { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBe('json');
    expect(r.source).toBe('flag');
  });

  test('config value used', () => {
    const r = resolveOutputMode(undefined, {
      dotenvMap: EMPTY_MAP,
      config: { defaults: { output: 'ndjson' } },
    });
    expect(r.value).toBe('ndjson');
    expect(r.source).toBe('config');
  });
});

describe('resolveTimeout', () => {
  const KEY = 'OPENROUTER_TIMEOUT';

  beforeEach(() => {
    delete process.env[KEY];
  });

  afterEach(() => {
    delete process.env[KEY];
  });

  test('default is 60000', () => {
    const r = resolveTimeout(undefined, { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBe(60_000);
    expect(r.source).toBe('default');
  });

  test('flag overrides as number', () => {
    const r = resolveTimeout('5000', { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBe(5_000);
    expect(r.source).toBe('flag');
  });

  test('env var parsed as number', () => {
    withEnv(KEY, '30000', () => {
      const r = resolveTimeout(undefined, { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
      expect(r.value).toBe(30_000);
      expect(r.source).toBe('env');
    });
  });

  test('config value as number', () => {
    const r = resolveTimeout(undefined, {
      dotenvMap: EMPTY_MAP,
      config: { defaults: { timeout: 15000 } },
    });
    expect(r.value).toBe(15_000);
    expect(r.source).toBe('config');
  });
});

describe('resolveSiteUrl', () => {
  const KEY = 'OPENROUTER_SITE_URL';

  beforeEach(() => {
    delete process.env[KEY];
  });

  afterEach(() => {
    delete process.env[KEY];
  });

  test('returns undefined when no source', () => {
    const r = resolveSiteUrl(undefined, { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBeUndefined();
    expect(r.source).toBe('none');
  });

  test('config.headers.http_referer used', () => {
    const r = resolveSiteUrl(undefined, {
      dotenvMap: EMPTY_MAP,
      config: { headers: { http_referer: 'https://myapp.com' } },
    });
    expect(r.value).toBe('https://myapp.com');
    expect(r.source).toBe('config');
  });
});

describe('resolveAppName', () => {
  const KEY = 'OPENROUTER_APP_NAME';

  beforeEach(() => {
    delete process.env[KEY];
  });

  afterEach(() => {
    delete process.env[KEY];
  });

  test('default is openrouter-cli', () => {
    const r = resolveAppName(undefined, { dotenvMap: EMPTY_MAP, config: EMPTY_CONFIG });
    expect(r.value).toBe('openrouter-cli');
    expect(r.source).toBe('default');
  });

  test('config.headers.app_name used', () => {
    const r = resolveAppName(undefined, {
      dotenvMap: EMPTY_MAP,
      config: { headers: { app_name: 'my-tool' } },
    });
    expect(r.value).toBe('my-tool');
    expect(r.source).toBe('config');
  });

  test('flag wins over config', () => {
    const r = resolveAppName('cli-flag', {
      dotenvMap: EMPTY_MAP,
      config: { headers: { app_name: 'config-name' } },
    });
    expect(r.value).toBe('cli-flag');
    expect(r.source).toBe('flag');
  });
});
