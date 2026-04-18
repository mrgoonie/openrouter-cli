/**
 * TOML config file I/O — read, write (atomic), and path resolution.
 * Config location: $OPENROUTER_CONFIG > $XDG_CONFIG_HOME/openrouter/config.toml
 *                > ~/.config/openrouter/config.toml
 * Writes are atomic: write .tmp then rename to avoid partial-write corruption.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';
import { type Config, ConfigSchema } from '../types/config.ts';

/** Resolve the absolute path to the config file. */
export function configPath(): string {
  if (process.env.OPENROUTER_CONFIG) {
    return process.env.OPENROUTER_CONFIG;
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(xdg, 'openrouter', 'config.toml');
}

/**
 * Read and zod-validate the config file.
 * Returns `{}` (empty Config) when the file does not exist.
 * Throws `CliError`-style Error with a clear message on parse/validation failure.
 */
export function readConfigFile(): Config {
  const p = configPath();
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (err) {
    // Missing file is normal — return empty config
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`Cannot read config file at ${p}: ${String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = tomlParse(raw);
  } catch (err) {
    throw new Error(`Config file at ${p} is not valid TOML: ${String(err)}`);
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Config file at ${p} failed validation:\n${issues}`);
  }

  return result.data;
}

/** Deep-merge `b` into `a` (mutates `a`). Plain objects only — arrays are replaced. */
function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  for (const [k, v] of Object.entries(b)) {
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof a[k] === 'object' &&
      a[k] !== null &&
      !Array.isArray(a[k])
    ) {
      deepMerge(a[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      a[k] = v;
    }
  }
  return a;
}

/**
 * Write a partial config patch, deep-merged with the existing config.
 * Uses an atomic write (tmp file + rename) to avoid corruption.
 */
export function writeConfigFile(patch: Partial<Config>): void {
  const p = configPath();
  const dir = path.dirname(p);

  // Ensure directory exists
  fs.mkdirSync(dir, { recursive: true });

  // Load existing config (as plain object for merge)
  let existing: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = tomlParse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Cannot read existing config at ${p}: ${String(err)}`);
    }
    // File not found — start fresh
  }

  const merged = deepMerge(existing, patch as Record<string, unknown>);
  atomicWriteToml(p, merged);
}

/**
 * Rewrite the entire config file verbatim (no deep-merge).
 * Required for deletions to propagate — `writeConfigFile` would preserve
 * keys whose containing object becomes empty after an `unset`.
 */
export function rewriteConfigFile(config: Config): void {
  const p = configPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteToml(p, config as Record<string, unknown>);
}

/** Write `obj` as TOML to `p` atomically via tmp file + rename. */
function atomicWriteToml(p: string, obj: Record<string, unknown>): void {
  const tomlStr = tomlStringify(obj);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, tomlStr, 'utf8');
  fs.renameSync(tmp, p);
}

/** Remove the config file — used in tests for cleanup. */
export function deleteConfigFile(): void {
  const p = configPath();
  try {
    fs.unlinkSync(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
