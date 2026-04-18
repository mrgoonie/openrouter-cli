/**
 * `openrouter config` sub-command group.
 * Verbs: get, set, unset, list, path, doctor
 *
 * get    — print a single TOML value by dotted key (pipe-safe)
 * set    — write a key/value into TOML after zod validation; blocks auth.* without --unsafe
 * unset  — remove a key from TOML
 * list   — pretty table or JSON of all TOML keys
 * path   — print resolved config file path
 * doctor — diagnostics: every resolver var + source + masked value; keychain status; file status
 */

import * as fs from 'node:fs';
import { defineCommand } from 'citty';
import { maskKey } from '../lib/auth/mask-key.ts';
import {
  configPath,
  readConfigFile,
  rewriteConfigFile,
  writeConfigFile,
} from '../lib/config/file.ts';
import { isKeychainAvailable } from '../lib/config/keychain.ts';
import { getByPath, parseValue, setByPath, unsetByPath } from '../lib/config/kv-path.ts';
import {
  buildResolverContext,
  resolveApiKey,
  resolveAppName,
  resolveBaseUrl,
  resolveManagementKey,
  resolveOutputMode,
  resolveSiteUrl,
  resolveTimeout,
} from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { render } from '../lib/output/renderer.ts';
import { resolveOutputMode as resolveDisplayMode } from '../lib/output/tty.ts';
import { ConfigSchema } from '../lib/types/config.ts';

// ---------------------------------------------------------------------------
// Shared args
// ---------------------------------------------------------------------------

const commonArgs = {
  output: {
    type: 'string' as const,
    description: 'Output format: pretty | json | table',
    alias: 'o',
  },
  json: { type: 'boolean' as const, description: 'Alias for --output json', default: false },
  'no-color': { type: 'boolean' as const, description: 'Disable ANSI color', default: false },
  config: { type: 'string' as const, description: 'Path to TOML config file', alias: 'c' },
};

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

const getCommand = defineCommand({
  meta: { description: 'Get a config value by dotted key (e.g. defaults.model)' },
  args: {
    ...commonArgs,
    key: { type: 'positional' as const, description: 'Dotted config key', required: true },
  },
  run({ args }) {
    const ctx = buildResolverContext({ config: args.config });
    void ctx; // ensure env override applied
    const cfg = readConfigFile();
    const val = getByPath(cfg as Record<string, unknown>, args.key);
    if (val === undefined) {
      throw new CliError('not_found', `Key '${args.key}' not found in config`);
    }
    // Pipe-safe: strings printed raw; everything else as JSON
    process.stdout.write(`${typeof val === 'string' ? val : JSON.stringify(val)}\n`);
  },
});

// ---------------------------------------------------------------------------
// set
// ---------------------------------------------------------------------------

const setCommand = defineCommand({
  meta: { description: 'Set a config key to a value' },
  args: {
    ...commonArgs,
    key: { type: 'positional' as const, description: 'Dotted config key', required: true },
    value: { type: 'positional' as const, description: 'Value to set', required: true },
    unsafe: {
      type: 'boolean' as const,
      description: 'Allow writing auth.* keys (not recommended)',
      default: false,
    },
  },
  run({ args }) {
    const ctx = buildResolverContext({ config: args.config });
    void ctx;

    // Guard: refuse auth.* writes without --unsafe
    if (args.key.startsWith('auth.') && !args.unsafe) {
      throw new CliError(
        'usage',
        `Writing auth keys via 'config set' is discouraged — use env vars or keychain instead.\nPass --unsafe to override.`,
        'Use OPENROUTER_API_KEY env var or `openrouter auth set-key` instead',
      );
    }

    const parsed = readConfigFile() as Record<string, unknown>;
    const typed = parseValue(args.value);
    const next = setByPath(parsed, args.key, typed);

    // Validate merged config before writing
    const validation = ConfigSchema.safeParse(next);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new CliError('usage', `Config validation failed:\n${issues}`);
    }

    writeConfigFile(validation.data);
    process.stderr.write(`Set ${args.key} = ${JSON.stringify(typed)}\n`);
  },
});

// ---------------------------------------------------------------------------
// unset
// ---------------------------------------------------------------------------

const unsetCommand = defineCommand({
  meta: { description: 'Remove a key from the config file' },
  args: {
    ...commonArgs,
    key: {
      type: 'positional' as const,
      description: 'Dotted config key to remove',
      required: true,
    },
  },
  run({ args }) {
    const ctx = buildResolverContext({ config: args.config });
    void ctx;
    const parsed = readConfigFile() as Record<string, unknown>;
    const next = unsetByPath(parsed, args.key);
    // Rewrite (not merge) — deletions must replace the file verbatim,
    // otherwise deep-merge would resurrect the removed key from disk.
    const validation = ConfigSchema.safeParse(next);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new CliError('usage', `Config validation failed:\n${issues}`);
    }
    rewriteConfigFile(validation.data);
    process.stderr.write(`Unset ${args.key}\n`);
  },
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

const listCommand = defineCommand({
  meta: { description: 'List all config values from the TOML file' },
  args: { ...commonArgs },
  run({ args }) {
    const ctx = buildResolverContext({ config: args.config });
    void ctx;
    const cfg = readConfigFile();
    const outputMode = resolveDisplayMode(args.output ?? (args.json ? 'json' : undefined));

    // Flatten nested config into dotted kv pairs for table display
    function flatten(
      obj: Record<string, unknown>,
      prefix = '',
    ): Array<{ key: string; value: string }> {
      const rows: Array<{ key: string; value: string }> = [];
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          rows.push(...flatten(v as Record<string, unknown>, fullKey));
        } else {
          rows.push({ key: fullKey, value: typeof v === 'string' ? v : JSON.stringify(v) });
        }
      }
      return rows;
    }

    const rows = flatten(cfg as Record<string, unknown>);

    render(
      { data: rows, meta: {} },
      {
        format: outputMode,
        columns: [
          { key: 'key', header: 'Key', width: 30 },
          { key: 'value', header: 'Value', width: 50 },
        ],
      },
    );
  },
});

// ---------------------------------------------------------------------------
// path
// ---------------------------------------------------------------------------

const pathCommand = defineCommand({
  meta: { description: 'Print the resolved config file path' },
  args: {
    config: { type: 'string' as const, description: 'Override config path', alias: 'c' },
  },
  run({ args }) {
    buildResolverContext({ config: args.config });
    process.stdout.write(`${configPath()}\n`);
  },
});

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

const doctorCommand = defineCommand({
  meta: { description: 'Diagnose config and credential resolution — always exits 0' },
  args: { ...commonArgs },
  run({ args }) {
    const ctx = buildResolverContext({ config: args.config });
    const deps = { dotenvMap: ctx.dotenvMap, config: ctx.config };

    const resolvedApiKey = resolveApiKey(undefined, deps);
    const resolvedMgmtKey = resolveManagementKey(undefined, deps);
    const resolvedBaseUrl = resolveBaseUrl(undefined, deps);
    const resolvedOutput = resolveOutputMode(undefined, deps);
    const resolvedTimeout = resolveTimeout(undefined, deps);
    const resolvedSiteUrl = resolveSiteUrl(undefined, deps);
    const resolvedAppName = resolveAppName(undefined, deps);

    type DoctorRow = { name: string; source: string; value: string; valid: boolean };

    const rows: DoctorRow[] = [
      {
        name: 'api_key',
        source: resolvedApiKey.source,
        value: resolvedApiKey.value ? maskKey(resolvedApiKey.value) : '(unset)',
        valid: resolvedApiKey.value !== undefined,
      },
      {
        name: 'management_key',
        source: resolvedMgmtKey.source,
        value: resolvedMgmtKey.value ? maskKey(resolvedMgmtKey.value) : '(unset)',
        valid: resolvedMgmtKey.value !== undefined,
      },
      {
        name: 'base_url',
        source: resolvedBaseUrl.source,
        value: resolvedBaseUrl.value ?? '(unset)',
        valid: resolvedBaseUrl.value !== undefined,
      },
      {
        name: 'output',
        source: resolvedOutput.source,
        value: resolvedOutput.value ?? '(unset)',
        valid: resolvedOutput.value !== undefined,
      },
      {
        name: 'timeout',
        source: resolvedTimeout.source,
        value: String(resolvedTimeout.value ?? '(unset)'),
        valid: resolvedTimeout.value !== undefined,
      },
      {
        name: 'site_url',
        source: resolvedSiteUrl.source,
        value: resolvedSiteUrl.value ?? '(unset)',
        valid: true, // optional field — always valid whether set or not
      },
      {
        name: 'app_name',
        source: resolvedAppName.source,
        value: resolvedAppName.value ?? '(unset)',
        valid: resolvedAppName.value !== undefined,
      },
    ];

    // Config file diagnostics
    const cfgPath = configPath();
    const cfgExists = fs.existsSync(cfgPath);
    let cfgValid = false;
    if (cfgExists) {
      try {
        readConfigFile();
        cfgValid = true;
      } catch {
        cfgValid = false;
      }
    }

    const keychainAvailable = isKeychainAvailable();

    const outputMode = resolveDisplayMode(args.output ?? (args.json ? 'json' : undefined));

    render(
      {
        data: rows,
        meta: {
          config_file: { path: cfgPath, exists: cfgExists, valid: cfgValid },
          keychain: { available: keychainAvailable },
        },
      },
      {
        format: outputMode,
        columns: [
          { key: 'name', header: 'Variable', width: 18 },
          { key: 'source', header: 'Source', width: 14 },
          { key: 'value', header: 'Value', width: 36 },
          { key: 'valid', header: 'OK', width: 5 },
        ],
      },
    );
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: { description: 'Inspect and edit the CLI configuration file' },
  subCommands: {
    get: getCommand,
    set: setCommand,
    unset: unsetCommand,
    list: listCommand,
    path: pathCommand,
    doctor: doctorCommand,
  },
});
