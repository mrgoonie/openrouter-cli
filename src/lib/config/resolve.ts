/**
 * Config resolution precedence engine.
 *
 * Priority (highest → lowest):
 *   flag → process.env → dotenv cascade → TOML config → keychain (opt-in) → default
 *
 * Every resolver returns {value, source} so `config doctor` can show provenance.
 */

import type { Config } from '../types/config.ts';
import type { DotenvMap } from './dotenv-cascade.ts';
import { loadDotenvCascade } from './dotenv-cascade.ts';
import { readConfigFile } from './file.ts';
import { getKeychainValue } from './keychain.ts';
import { resolveMode } from './mode.ts';

export type Resolved<T> = {
  value: T | undefined;
  /** One of: 'flag' | 'env' | '<dotenv file path>' | 'config' | 'keychain' | 'default' | 'none' */
  source: string;
};

export type ResolverContext = {
  mode: string;
  dotenvMap: DotenvMap;
  config: Config;
  cwd: string;
};

// ---------- core engine ----------

type ResolveStringInput = {
  /** Value passed directly via CLI flag. */
  flag?: string;
  /** Name of the env var to check in process.env and dotenvMap. */
  envName: string;
  dotenvMap: DotenvMap;
  /** Value from the TOML config (already extracted by caller). */
  configValue?: string;
  /** Keychain account name — only consulted when configUseKeychain is true. */
  keychainAccount?: 'api_key' | 'management_key' | 'refresh_token';
  /** Whether keychain lookup is enabled (from config.auth.use_keychain). */
  configUseKeychain?: boolean;
  default?: string;
};

/**
 * Core resolver — returns the first defined value found across all sources,
 * tagged with its provenance string.
 */
export function resolveString(input: ResolveStringInput): Resolved<string> {
  // 1. CLI flag
  if (input.flag !== undefined && input.flag !== '') {
    return { value: input.flag, source: 'flag' };
  }

  // 2. process.env
  const envVal = process.env[input.envName];
  if (envVal !== undefined && envVal !== '') {
    return { value: envVal, source: 'env' };
  }

  // 3. dotenv cascade
  const dotenvEntry = input.dotenvMap[input.envName];
  if (dotenvEntry !== undefined && dotenvEntry.value !== '') {
    return { value: dotenvEntry.value, source: dotenvEntry.path };
  }

  // 4. TOML config
  if (input.configValue !== undefined && input.configValue !== '') {
    return { value: input.configValue, source: 'config' };
  }

  // 5. Keychain (opt-in)
  if (input.configUseKeychain && input.keychainAccount) {
    const keyVal = getKeychainValue(input.keychainAccount);
    if (keyVal !== null && keyVal !== '') {
      return { value: keyVal, source: 'keychain' };
    }
  }

  // 6. Default
  if (input.default !== undefined) {
    return { value: input.default, source: 'default' };
  }

  return { value: undefined, source: 'none' };
}

// ---------- public helpers ----------

type HelperDeps = {
  dotenvMap: DotenvMap;
  config: Config;
};

/** Resolve OPENROUTER_API_KEY → config.auth.api_key → keychain api_key */
export function resolveApiKey(flag: string | undefined, deps: HelperDeps): Resolved<string> {
  return resolveString({
    flag,
    envName: 'OPENROUTER_API_KEY',
    dotenvMap: deps.dotenvMap,
    configValue: deps.config.auth?.api_key,
    keychainAccount: 'api_key',
    configUseKeychain: deps.config.auth?.use_keychain,
  });
}

/** Resolve OPENROUTER_MANAGEMENT_KEY → config.auth.management_key → keychain management_key */
export function resolveManagementKey(flag: string | undefined, deps: HelperDeps): Resolved<string> {
  return resolveString({
    flag,
    envName: 'OPENROUTER_MANAGEMENT_KEY',
    dotenvMap: deps.dotenvMap,
    configValue: deps.config.auth?.management_key,
    keychainAccount: 'management_key',
    configUseKeychain: deps.config.auth?.use_keychain,
  });
}

/** Resolve OPENROUTER_BASE_URL → config.defaults.base_url → hardcoded default */
export function resolveBaseUrl(flag: string | undefined, deps: HelperDeps): Resolved<string> {
  return resolveString({
    flag,
    envName: 'OPENROUTER_BASE_URL',
    dotenvMap: deps.dotenvMap,
    configValue: deps.config.defaults?.base_url,
    default: 'https://openrouter.ai/api/v1',
  });
}

/** Resolve OPENROUTER_OUTPUT → config.defaults.output → 'auto' */
export function resolveOutputMode(flag: string | undefined, deps: HelperDeps): Resolved<string> {
  return resolveString({
    flag,
    envName: 'OPENROUTER_OUTPUT',
    dotenvMap: deps.dotenvMap,
    configValue: deps.config.defaults?.output,
    default: 'auto',
  });
}

/** Resolve OPENROUTER_TIMEOUT (ms) → config.defaults.timeout → 60000 */
export function resolveTimeout(flag: string | undefined, deps: HelperDeps): Resolved<number> {
  const raw = resolveString({
    flag,
    envName: 'OPENROUTER_TIMEOUT',
    dotenvMap: deps.dotenvMap,
    configValue:
      deps.config.defaults?.timeout !== undefined
        ? String(deps.config.defaults.timeout)
        : undefined,
    default: '60000',
  });

  const num = raw.value !== undefined ? Number(raw.value) : undefined;
  return {
    value: num !== undefined && Number.isFinite(num) ? num : 60_000,
    source: raw.source,
  };
}

/** Resolve OPENROUTER_SITE_URL → config.headers.http_referer */
export function resolveSiteUrl(flag: string | undefined, deps: HelperDeps): Resolved<string> {
  return resolveString({
    flag,
    envName: 'OPENROUTER_SITE_URL',
    dotenvMap: deps.dotenvMap,
    configValue: deps.config.headers?.http_referer,
  });
}

/** Resolve OPENROUTER_APP_NAME → config.headers.app_name → 'openrouter-cli' */
export function resolveAppName(flag: string | undefined, deps: HelperDeps): Resolved<string> {
  return resolveString({
    flag,
    envName: 'OPENROUTER_APP_NAME',
    dotenvMap: deps.dotenvMap,
    configValue: deps.config.headers?.app_name,
    default: 'openrouter-cli',
  });
}

// ---------- context bootstrap ----------

/**
 * Load everything once per CLI invocation.
 * Pass `flags.config` to override the config file path via OPENROUTER_CONFIG env var.
 */
export function buildResolverContext(flags: { config?: string }): ResolverContext {
  // Allow flag to override config path via env var slot
  if (flags.config) {
    process.env.OPENROUTER_CONFIG = flags.config;
  }

  const mode = resolveMode();
  const cwd = process.cwd();
  const dotenvMap = loadDotenvCascade(cwd, mode);
  const config = readConfigFile();

  return { mode, dotenvMap, config, cwd };
}
