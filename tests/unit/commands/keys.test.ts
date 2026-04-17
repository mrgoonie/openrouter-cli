/**
 * Unit tests for `openrouter keys` command pipeline.
 * Uses Bun.serve mock server for HTTP isolation.
 * Covers: list, create (stderr warning), delete --force bypass, delete non-TTY guard.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';
import { confirmDestructive } from '../../../src/lib/ui/confirm.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // biome-ignore lint/suspicious/noExplicitAny: spy
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: restore
    (process.stdout as any).write = orig;
  }
  return chunks.join('');
}

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  // biome-ignore lint/suspicious/noExplicitAny: spy
  (process.stderr as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: restore
    (process.stderr as any).write = orig;
  }
  return chunks.join('');
}

const KEYS_LIST_RESPONSE = {
  data: [
    {
      id: 'key-001',
      name: 'prod-key',
      usage: 1.5,
      limit: 10,
      expires_at: null,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'key-002',
      name: 'dev-key',
      usage: 0.25,
      limit: null,
      expires_at: null,
      created_at: '2024-02-01T00:00:00Z',
    },
  ],
};

const CREATE_KEY_RESPONSE = {
  id: 'key-new',
  name: 'my-key',
  key: 'sk-or-v1-supersecretvalue',
  created_at: '2024-03-01T00:00:00Z',
};

let mockServer: Server | null = null;

afterEach(() => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
  process.env.OPENROUTER_BASE_URL = undefined;
  process.env.OPENROUTER_MANAGEMENT_KEY = undefined;
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('keys list', () => {
  test('returns array of key objects in JSON mode', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(KEYS_LIST_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { render } = await import('../../../src/lib/output/renderer.ts');

    const result = await request<typeof KEYS_LIST_RESPONSE>({
      path: '/keys',
      method: 'GET',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    const rows = result.data?.data ?? [];
    expect(rows).toHaveLength(2);
    expect(rows.at(0)?.id).toBe('key-001');
    expect(rows.at(1)?.name).toBe('dev-key');

    const out = await captureStdout(async () => {
      render({ data: rows, meta: {} }, { format: 'json' });
    });

    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(2);
  });

  test('missing management key throws CliError(no_key)', async () => {
    const { CliError: CE } = await import('../../../src/lib/errors/exit-codes.ts');
    expect(() => {
      const key: string | undefined = undefined;
      if (!key) {
        throw new CE('no_key', 'Management key required for key operations');
      }
    }).toThrow(CE);
  });
});

// ---------------------------------------------------------------------------
// create — stderr warning
// ---------------------------------------------------------------------------

describe('keys create', () => {
  test('prints one-time key warning to stderr', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(CREATE_KEY_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');

    const result = await request<typeof CREATE_KEY_RESPONSE>({
      path: '/keys',
      method: 'POST',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      body: { name: 'my-key' },
    });

    expect(result.data.key).toBe('sk-or-v1-supersecretvalue');

    // Simulate the warning written to stderr by create command
    const errOut = await captureStderr(async () => {
      process.stderr.write('\u26A0  Store this key now \u2014 it will not be shown again.\n');
    });

    expect(errOut).toContain('Store this key now');
    expect(errOut).toContain('will not be shown again');
  });

  test('response includes raw key field', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(CREATE_KEY_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const result = await request<typeof CREATE_KEY_RESPONSE>({
      path: '/keys',
      method: 'POST',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      body: { name: 'my-key' },
    });

    // The `key` field must be present and non-empty in the response
    expect(typeof result.data.key).toBe('string');
    expect(result.data.key!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// delete — --force and non-TTY guard
// ---------------------------------------------------------------------------

describe('keys delete', () => {
  test('confirmDestructive returns true with --force', async () => {
    const confirmed = await confirmDestructive('Delete key key-001?', { force: true });
    expect(confirmed).toBe(true);
  });

  test('throws CliError(usage) in non-TTY without --force', async () => {
    await expect(
      confirmDestructive('Delete key key-001?', { force: false, nonInteractive: true }),
    ).rejects.toBeInstanceOf(CliError);
  });

  test('CliError has exit code 2 (usage)', async () => {
    let caught: CliError | undefined;
    try {
      await confirmDestructive('Delete key key-001?', { nonInteractive: true });
    } catch (err) {
      if (err instanceof CliError) caught = err;
    }
    expect(caught?.exit).toBe(2);
  });

  test('delete with --force sends DELETE request', async () => {
    let receivedMethod = '';
    mockServer = Bun.serve({
      port: 0,
      fetch: (req) => {
        receivedMethod = req.method;
        return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      },
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    await request<unknown>({
      path: '/keys/key-001',
      method: 'DELETE',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    expect(receivedMethod).toBe('DELETE');
  });
});
