/**
 * E2E: config command tests — get, set, unset, doctor round-trips.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type MockServer, startMockServer } from '../fixtures/mock-server.ts';
import { spawnCli } from './harness.ts';

let mock: MockServer;

beforeAll(async () => {
  mock = await startMockServer();
  mkdirSync('/tmp/or-cli-e2e-config', { recursive: true });
});

afterAll(async () => {
  await mock.stop();
  rmSync('/tmp/or-cli-e2e-config', { recursive: true, force: true });
});

afterEach(() => {
  mock.reset();
});

/** Unique temp config file path per test run. */
function tmpCfg(): string {
  return `/tmp/or-cli-e2e-config/cfg-${Date.now()}-${Math.random().toString(36).slice(2)}.toml`;
}

describe('config smoke (always runs)', () => {
  it('config --help exits 0', async () => {
    const { exitCode } = await spawnCli(['config', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });

  it('config doctor --help exits 0', async () => {
    const { exitCode } = await spawnCli(['config', 'doctor', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });

  it('config path --help exits 0', async () => {
    const { exitCode } = await spawnCli(['config', 'path', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });
});

describe.skipIf(!process.env.E2E)('config set/get/unset round-trip', () => {
  it('config set then get returns the same value', async () => {
    const cfg = tmpCfg();

    const setResult = await spawnCli(
      ['config', 'set', 'defaults.model', 'openai/gpt-4o', '--config', cfg],
      { mockUrl: mock.url, env: { OPENROUTER_CONFIG: cfg } },
    );
    expect(setResult.exitCode).toBe(0);

    const getResult = await spawnCli(['config', 'get', 'defaults.model', '--config', cfg], {
      mockUrl: mock.url,
      env: { OPENROUTER_CONFIG: cfg },
    });
    expect(getResult.exitCode).toBe(0);
    expect(getResult.stdout.trim()).toBe('openai/gpt-4o');
  });

  it('config unset removes a key', async () => {
    const cfg = tmpCfg();

    await spawnCli(['config', 'set', 'defaults.model', 'openai/gpt-4o', '--config', cfg], {
      mockUrl: mock.url,
      env: { OPENROUTER_CONFIG: cfg },
    });

    const unsetResult = await spawnCli(['config', 'unset', 'defaults.model', '--config', cfg], {
      mockUrl: mock.url,
      env: { OPENROUTER_CONFIG: cfg },
    });
    expect(unsetResult.exitCode).toBe(0);

    const getResult = await spawnCli(['config', 'get', 'defaults.model', '--config', cfg], {
      mockUrl: mock.url,
      env: { OPENROUTER_CONFIG: cfg },
    });
    // After unset, key not found → exit non-zero
    expect(getResult.exitCode).not.toBe(0);
  });

  it('config path prints a file path', async () => {
    const cfg = tmpCfg();
    const { stdout, exitCode } = await spawnCli(['config', 'path', '--config', cfg], {
      mockUrl: mock.url,
      env: { OPENROUTER_CONFIG: cfg },
    });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(cfg);
  });

  it('config doctor exits 0 and shows resolved sources', async () => {
    const cfg = tmpCfg();
    const { stdout, exitCode } = await spawnCli(['config', 'doctor', '--json', '--config', cfg], {
      mockUrl: mock.url,
      env: {
        OPENROUTER_CONFIG: cfg,
        OPENROUTER_API_KEY: 'sk-or-v1-doctor-test',
      },
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    // Should include api_key entry
    const rows = parsed.data as Array<{ name: string; source: string }>;
    const apiKeyRow = rows.find((r) => r.name === 'api_key');
    expect(apiKeyRow).toBeDefined();
    expect(apiKeyRow?.source).toContain('env');
  });
});
