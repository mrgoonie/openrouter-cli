/**
 * E2E: video command tests — create, status, wait with mock state machine.
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

describe('video smoke (always runs)', () => {
  it('video --help exits 0', async () => {
    const { exitCode } = await spawnCli(['video', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });

  it('video create --help exits 0', async () => {
    const { exitCode } = await spawnCli(['video', 'create', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });

  it('video status --help exits 0', async () => {
    const { exitCode } = await spawnCli(['video', 'status', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });

  it('video wait --help exits 0', async () => {
    const { exitCode } = await spawnCli(['video', 'wait', '--help'], { mockUrl: mock.url });
    expect(exitCode).toBe(0);
  });
});

describe.skipIf(!process.env.E2E)('video lifecycle', () => {
  it('video create returns JSON envelope with job ID', async () => {
    const { stdout, exitCode } = await spawnCli(
      [
        'video',
        'create',
        '--prompt',
        'A sunset over the ocean',
        '--model',
        'sora/mock-v1',
        '--json',
      ],
      { mockUrl: mock.url },
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.schema_version).toBe('1');
    expect(parsed.success).toBe(true);
    expect(parsed.data.id).toBe('vid_mock_1');
    expect(parsed.data.status).toBe('pending');
  });

  it('video status shows current job state as JSON', async () => {
    // First create to initialize state machine
    await spawnCli(['video', 'create', '--prompt', 'test', '--model', 'sora/mock-v1'], {
      mockUrl: mock.url,
    });

    const { stdout, exitCode } = await spawnCli(['video', 'status', 'vid_mock_1', '--json'], {
      mockUrl: mock.url,
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.schema_version).toBe('1');
    expect(parsed.success).toBe(true);
    expect(parsed.data.id).toBe('vid_mock_1');
    expect(['pending', 'in_progress', 'completed']).toContain(parsed.data.status);
  });

  it('video wait polls until completed (3 polls via mock state machine)', async () => {
    // Initialize state machine via create
    await spawnCli(['video', 'create', '--prompt', 'test', '--model', 'sora/mock-v1'], {
      mockUrl: mock.url,
    });

    const { stdout, exitCode } = await spawnCli(
      ['video', 'wait', 'vid_mock_1', '--json', '--interval', '100ms', '--timeout', '30s'],
      { mockUrl: mock.url, timeoutMs: 20_000 },
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBe('completed');
    expect(parsed.data.unsigned_urls).toBeDefined();
    expect(parsed.data.unsigned_urls.length).toBeGreaterThan(0);
  });
});
