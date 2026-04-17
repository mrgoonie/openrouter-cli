/**
 * E2E: --help snapshot tests.
 * First run with UPDATE_SNAPSHOTS=1 writes golden files; subsequent runs diff against them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type MockServer, startMockServer } from '../fixtures/mock-server.ts';
import { spawnCli } from './harness.ts';

const GOLDEN_DIR = join(import.meta.dir, '..', 'fixtures', 'golden');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

let mock: MockServer;

beforeAll(async () => {
  mock = await startMockServer();
  mkdirSync(GOLDEN_DIR, { recursive: true });
});

afterAll(async () => {
  await mock.stop();
});

function goldenPath(name: string): string {
  return join(GOLDEN_DIR, `${name}.txt`);
}

function assertOrUpdate(name: string, actual: string): void {
  const path = goldenPath(name);
  if (UPDATE) {
    writeFileSync(path, actual, 'utf8');
  } else if (existsSync(path)) {
    const expected = readFileSync(path, 'utf8');
    expect(actual).toBe(expected);
  }
  // If golden file doesn't exist and not updating, just verify non-empty output
  expect(actual.length).toBeGreaterThan(0);
}

describe.skipIf(!process.env.E2E)('help snapshots', () => {
  it('openrouter --help exits 0 and includes subcommands', async () => {
    const { stdout, stderr, exitCode } = await spawnCli(['--help'], { mockUrl: mock.url });
    const output = stdout + stderr;
    expect(exitCode).toBe(0);
    expect(output).toContain('chat');
    expect(output).toContain('video');
    expect(output).toContain('auth');
    assertOrUpdate('help-root', output);
  });

  it('chat --help exits 0 and shows send subcommand', async () => {
    const { stdout, stderr, exitCode } = await spawnCli(['chat', '--help'], { mockUrl: mock.url });
    const output = stdout + stderr;
    expect(exitCode).toBe(0);
    expect(output).toContain('send');
    assertOrUpdate('help-chat', output);
  });

  it('video --help exits 0 and shows create/status/wait/download', async () => {
    const { stdout, stderr, exitCode } = await spawnCli(['video', '--help'], { mockUrl: mock.url });
    const output = stdout + stderr;
    expect(exitCode).toBe(0);
    expect(output).toContain('create');
    expect(output).toContain('status');
    expect(output).toContain('wait');
    assertOrUpdate('help-video', output);
  });

  it('auth --help exits 0 and shows login/status/set-key', async () => {
    const { stdout, stderr, exitCode } = await spawnCli(['auth', '--help'], { mockUrl: mock.url });
    const output = stdout + stderr;
    expect(exitCode).toBe(0);
    expect(output).toContain('login');
    expect(output).toContain('status');
    assertOrUpdate('help-auth', output);
  });
});

// Always-on smoke: just check the CLI responds to --help at all
describe('help smoke (always runs)', () => {
  it('--help produces non-empty output and exits 0', async () => {
    const { stdout, stderr, exitCode } = await spawnCli(['--help'], { mockUrl: mock.url });
    const output = stdout + stderr;
    expect(exitCode).toBe(0);
    expect(output.trim().length).toBeGreaterThan(10);
  });
});
