/**
 * Integration test harness — spawns the CLI as a subprocess against the REAL
 * OpenRouter API. Loads keys from `.env` (locally) or CI secrets (GitHub Actions).
 *
 * Run: `bun --env-file=.env test tests/integration/`
 *
 * Keys expected in env:
 *   - OPENROUTER_API_KEY           (user key, sk-or-v1-...) — inference
 *   - OPENROUTER_MANAGEMENT_KEY    (management key)         — admin endpoints
 *
 * If a required key is missing, tests for that auth class are skipped via
 * `skipIfNoKey()` so the suite still exits green in partial-credential envs.
 */

import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpawnOpts {
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
  /** Which auth key to inject. Default: 'user'. */
  auth?: 'user' | 'management' | 'none';
}

export const USER_KEY = process.env.OPENROUTER_API_KEY ?? '';
export const MGMT_KEY = process.env.OPENROUTER_MANAGEMENT_KEY ?? '';
export const BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';

/** Low-cost / free models used across tests. */
export const FREE_CHAT_MODEL = 'meta-llama/llama-3.2-1b-instruct:free';
export const CHEAP_CHAT_MODEL = 'google/gemini-2.0-flash-lite-001';
export const EMBED_MODEL = 'openai/text-embedding-3-small';
export const RERANK_MODEL = 'cohere/rerank-english-v3.0';

export function hasUserKey(): boolean {
  return Boolean(USER_KEY && USER_KEY.startsWith('sk-or-'));
}

export function hasMgmtKey(): boolean {
  return Boolean(MGMT_KEY);
}

/** Returns a `describe.skipIf` predicate gated on key availability. */
export function skipIfNoKey(kind: 'user' | 'management'): boolean {
  return kind === 'user' ? !hasUserKey() : !hasMgmtKey();
}

/**
 * Spawn CLI with isolated config and the requested key injected.
 * Uses `bun src/main.ts` for speed (no rebuild).
 */
export async function spawnCli(args: string[], opts: SpawnOpts = {}): Promise<SpawnResult> {
  const cmd = ['bun', join(ROOT, 'src', 'main.ts'), ...args];
  const tmpConfig = `/tmp/or-cli-int-${Date.now()}-${Math.random().toString(36).slice(2)}.toml`;

  const auth = opts.auth ?? 'user';
  const keyEnv: Record<string, string> = {};
  if (auth === 'user' && USER_KEY) keyEnv.OPENROUTER_API_KEY = USER_KEY;
  if (auth === 'management' && MGMT_KEY) keyEnv.OPENROUTER_MANAGEMENT_KEY = MGMT_KEY;

  const childEnv: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    BUN_INSTALL: process.env.BUN_INSTALL ?? '',
    OPENROUTER_CONFIG: tmpConfig,
    OPENROUTER_BASE_URL: BASE_URL,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    ...keyEnv,
    ...(opts.env ?? {}),
  };

  const proc = Bun.spawn(cmd, {
    env: childEnv,
    cwd: ROOT,
    stdin: opts.stdin ? new TextEncoder().encode(opts.stdin) : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const timeoutMs = opts.timeoutMs ?? 60_000;
  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already exited */
    }
  }, timeoutMs);

  const exitCode = await proc.exited;
  clearTimeout(timer);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { stdout, stderr, exitCode };
}

/** Parse a line of JSON output, returning `null` on failure. */
export function tryParseJson<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
