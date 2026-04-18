/**
 * Integration tests for `openrouter config` — exercises local TOML only.
 * Each spawn already gets an isolated `OPENROUTER_CONFIG` tempfile from the
 * harness, so roundtrips can't clobber the user's real config.
 *
 * No network / no auth required.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { spawnCli } from './harness.ts';

describe('config (integration)', () => {
  test('path prints config file path', async () => {
    const res = await spawnCli(['config', 'path'], { auth: 'none', timeoutMs: 10_000 });
    expect(res.exitCode).toBe(0);
    expect(res.stdout.length).toBeGreaterThan(0);
  });

  test('doctor returns JSON', async () => {
    const res = await spawnCli(['config', 'doctor', '-o', 'json'], {
      auth: 'none',
      timeoutMs: 10_000,
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout.length).toBeGreaterThan(0);
  });

  test('list on empty config returns something', async () => {
    const res = await spawnCli(['config', 'list'], { auth: 'none', timeoutMs: 10_000 });
    expect(res.exitCode).toBe(0);
  });

  test('set / get / unset roundtrip on shared config path', async () => {
    const tmp = join(
      process.env.TMPDIR ?? '/tmp',
      `or-cli-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}.toml`,
    );
    const env = { OPENROUTER_CONFIG: tmp };

    const set = await spawnCli(['config', 'set', 'defaults.output', 'json'], {
      auth: 'none',
      env,
      timeoutMs: 10_000,
    });
    expect(set.exitCode).toBe(0);

    const get = await spawnCli(['config', 'get', 'defaults.output'], {
      auth: 'none',
      env,
      timeoutMs: 10_000,
    });
    expect(get.exitCode).toBe(0);
    expect(get.stdout).toContain('json');

    const unset = await spawnCli(['config', 'unset', 'defaults.output'], {
      auth: 'none',
      env,
      timeoutMs: 10_000,
    });
    expect(unset.exitCode).toBe(0);
  });
});
