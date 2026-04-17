/**
 * Dotenv cascade loader — walks upward from cwd, collecting .env files in
 * priority order. Closer directories override outer directories. Within each
 * directory the load order is:
 *   .env → .env.<mode> → .env.local → .env.<mode>.local
 * Stops when a .git marker (file or directory) is found or fs root is reached.
 * Caps walk at MAX_LEVELS to prevent runaway traversal in monorepos without .git.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as dotenvParse } from 'dotenv';

const MAX_LEVELS = 8;

export type DotenvEntry = {
  value: string;
  /** Absolute path of the .env file that set this key. */
  path: string;
};

export type DotenvMap = Record<string, DotenvEntry>;

/**
 * Walk upward from `cwd`, collecting directory paths.
 * Returns paths ordered **outside → inside** (parent first, cwd last)
 * so that inner (closer) directories can override outer ones during merge.
 */
export function findRoots(cwd: string): string[] {
  const dirs: string[] = [];
  let current = path.resolve(cwd);
  let levels = 0;

  while (levels < MAX_LEVELS) {
    dirs.unshift(current); // prepend — outer dirs end up first

    // Stop if this dir contains a .git marker (file or directory)
    const gitMarker = path.join(current, '.git');
    if (fs.existsSync(gitMarker)) break;

    const parent = path.dirname(current);
    if (parent === current) break; // fs root reached

    current = parent;
    levels++;
  }

  return dirs;
}

/**
 * Expand `${VAR}` references in a dotenv value using already-resolved entries
 * plus the current process.env. Unresolved references are left as-is.
 */
function expandValue(value: string, merged: DotenvMap): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    // process.env wins over merged dotenv entries
    return process.env[name] ?? merged[name]?.value ?? `\${${name}}`;
  });
}

/**
 * Load all applicable dotenv files for the given cwd + mode.
 *
 * - Skips files that don't exist (silent).
 * - Never overwrites keys already set in `process.env`.
 * - Returns a map of key → {value, path} indicating which file sourced each key.
 */
export function loadDotenvCascade(cwd: string, mode: string): DotenvMap {
  const roots = findRoots(cwd);
  const merged: DotenvMap = {};

  for (const dir of roots) {
    // Load in ascending priority order within a directory
    const candidates = [
      path.join(dir, '.env'),
      path.join(dir, `.env.${mode}`),
      path.join(dir, '.env.local'),
      path.join(dir, `.env.${mode}.local`),
    ];

    for (const filePath of candidates) {
      let raw: Buffer;
      try {
        raw = fs.readFileSync(filePath);
      } catch {
        continue; // file not present — skip silently
      }

      const parsed = dotenvParse(raw);

      for (const [key, rawValue] of Object.entries(parsed)) {
        // process.env always wins — never overwrite
        if (key in process.env) continue;

        const expanded = expandValue(rawValue, merged);
        merged[key] = { value: expanded, path: filePath };
      }
    }
  }

  return merged;
}
