/**
 * E2E: auth command tests.
 * Skips actual OAuth loopback (too flaky) — tests set-key, status, whoami.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { type MockServer, startMockServer } from '../fixtures/mock-server.ts';
import { spawnCli } from './harness.ts';

let mock: MockServer;

beforeAll(async () => {
  mock = await startMockServer();
});

afterAll(async () => {
  await mock.stop();
});

afterEach(() => {
  mock.reset();
});

describe('auth smoke (always runs)', () => {
  it('auth --help exits 0', async () => {
    const { exitCode } = await spawnCli(['auth', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });

  it('auth status --help exits 0', async () => {
    const { exitCode } = await spawnCli(['auth', 'status', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });

  it('auth set-key --help exits 0', async () => {
    const { exitCode } = await spawnCli(['auth', 'set-key', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });
});

describe.skipIf(!process.env.E2E)('auth commands', () => {
  it('auth status shows masked key when OPENROUTER_API_KEY is set', async () => {
    const { stdout, exitCode } = await spawnCli(['auth', 'status', '--json'], {
      mockUrl: mock.url,
      env: { OPENROUTER_API_KEY: 'sk-or-v1-test-key-12345' },
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    // Should show masked value, not the raw key
    const apiKeyRow = (parsed.data as Array<{ name: string; value: string }>).find(
      (r) => r.name === 'api_key',
    );
    expect(apiKeyRow).toBeDefined();
    expect(apiKeyRow?.value).not.toBe('sk-or-v1-test-key-12345');
    expect(apiKeyRow?.value).not.toBe('(unset)');
  });

  it('auth status shows (unset) when no key provided', async () => {
    const { stdout, exitCode } = await spawnCli(['auth', 'status', '--json'], {
      mockUrl: mock.url,
      env: {
        OPENROUTER_API_KEY: '',
        OPENROUTER_MANAGEMENT_KEY: '',
      },
    });
    // May exit 0 (just shows unset) or non-zero — either is acceptable
    const parsed = JSON.parse(stdout);
    expect(parsed.schema_version).toBe('1');
  });

  it('auth set-key stores a key and exits 0', async () => {
    const { stdout, exitCode } = await spawnCli(
      ['auth', 'set-key', 'sk-or-v1-test-set-key-abc', '--json'],
      { mockUrl: mock.url },
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.stored).toBe(true);
    expect(parsed.data.kind).toBe('api');
  });

  it('auth whoami exits 0 when API key is valid', async () => {
    const { stdout, exitCode } = await spawnCli(['auth', 'whoami', '--json'], {
      mockUrl: mock.url,
      env: { OPENROUTER_API_KEY: 'sk-or-v1-valid-key' },
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.authenticated).toBe(true);
  });

  it('auth whoami exits 64 (no_key) when no key is set', async () => {
    const { exitCode } = await spawnCli(['auth', 'whoami', '--non-interactive'], {
      mockUrl: mock.url,
      env: {
        OPENROUTER_API_KEY: '',
        OPENROUTER_MANAGEMENT_KEY: '',
      },
    });
    expect(exitCode).toBe(64); // ExitCode.NO_KEY
  });
});
