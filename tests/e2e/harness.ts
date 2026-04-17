/**
 * E2E test harness — spawns the CLI as a subprocess and captures output.
 * Uses `bun run src/main.ts` by default (fast, no rebuild needed).
 * Set E2E_TARGET=bin to run against the compiled binary instead.
 */

import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpawnOpts {
  /** Env vars to merge into child process env. Replaces only the keys provided. */
  env?: Record<string, string>;
  /** Stdin to pipe to the child process (as string). */
  stdin?: string;
  /** Mock server URL — sets OPENROUTER_BASE_URL automatically. */
  mockUrl?: string;
  /** Timeout in ms before killing the child process (default: 15000). */
  timeoutMs?: number;
}

/**
 * Spawn the CLI with given args and return {stdout, stderr, exitCode}.
 * Isolated config per call via OPENROUTER_CONFIG pointing to a temp file.
 */
export async function spawnCli(args: string[], opts: SpawnOpts = {}): Promise<SpawnResult> {
  const target = process.env.E2E_TARGET === 'bin' ? join(ROOT, 'bin', 'openrouter') : null;

  // Use `bun <script>` (not `bun run`) so positional args aren't ambiguous with script flags.
  const cmd: string[] = target ? [target, ...args] : ['bun', join(ROOT, 'src', 'main.ts'), ...args];

  // Isolated config file per invocation to avoid state bleed
  const tmpConfig = `/tmp/or-cli-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.toml`;

  // Use a minimal, controlled env for the child process.
  // Spreading full process.env can inject runner-specific hooks (NODE_OPTIONS --require, etc.)
  // that break the child Bun process. Pass only what's needed.
  const childEnv: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    // Bun install path (needed to find bun itself)
    BUN_INSTALL: process.env.BUN_INSTALL ?? '',
    // API key + config isolation
    OPENROUTER_API_KEY: 'sk-or-v1-test-abc123',
    OPENROUTER_CONFIG: tmpConfig,
    // Disable color for deterministic output
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    ...(opts.mockUrl ? { OPENROUTER_BASE_URL: opts.mockUrl } : {}),
    ...(opts.env ?? {}),
  };

  const proc = Bun.spawn(cmd, {
    env: childEnv,
    cwd: ROOT,
    stdin: opts.stdin ? new TextEncoder().encode(opts.stdin) : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const timeoutMs = opts.timeoutMs ?? 15_000;
  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already exited */
    }
  }, timeoutMs);

  // Must await exited BEFORE reading the piped streams — otherwise the ReadableStream
  // from Bun.spawn closes before we can consume it when the process exits too fast.
  const exitCode = await proc.exited;
  clearTimeout(timer);

  const [stdoutBuf, stderrBuf] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return {
    stdout: stdoutBuf,
    stderr: stderrBuf,
    exitCode,
  };
}
