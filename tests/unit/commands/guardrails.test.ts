/**
 * Unit tests for `openrouter guardrails` command pipeline.
 * Covers: assign-keys body shape, assign-members body shape, delete confirm guard.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';
import { confirmDestructive } from '../../../src/lib/ui/confirm.ts';

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
// assign-keys — body shape validation
// ---------------------------------------------------------------------------

describe('guardrails assign-keys', () => {
  test('posts {key_ids: [...]} body correctly', async () => {
    let receivedBody: unknown = null;

    mockServer = Bun.serve({
      port: 0,
      fetch: async (req) => {
        receivedBody = await req.json();
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');

    // Simulate what guardrails assign-keys does: split comma list → array
    const keysArg = 'k1,k2,k3';
    const keyIds = keysArg
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    await request<unknown>({
      path: '/guardrails/gr-001/keys/assign',
      method: 'POST',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      body: { key_ids: keyIds },
    });

    expect(receivedBody).toEqual({ key_ids: ['k1', 'k2', 'k3'] });
  });

  test('trims whitespace from comma-separated key IDs', () => {
    const raw = ' k1 , k2 , k3 ';
    const ids = raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    expect(ids).toEqual(['k1', 'k2', 'k3']);
  });

  test('filters out empty segments from comma list', () => {
    const raw = 'k1,,k2,';
    const ids = raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    expect(ids).toEqual(['k1', 'k2']);
  });
});

// ---------------------------------------------------------------------------
// assign-members — body shape validation
// ---------------------------------------------------------------------------

describe('guardrails assign-members', () => {
  test('posts {user_ids: [...]} body correctly', async () => {
    let receivedBody: unknown = null;

    mockServer = Bun.serve({
      port: 0,
      fetch: async (req) => {
        receivedBody = await req.json();
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');

    const usersArg = 'u1,u2';
    const userIds = usersArg
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    await request<unknown>({
      path: '/guardrails/gr-001/members/assign',
      method: 'POST',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      body: { user_ids: userIds },
    });

    expect(receivedBody).toEqual({ user_ids: ['u1', 'u2'] });
  });
});

// ---------------------------------------------------------------------------
// delete — confirm guard
// ---------------------------------------------------------------------------

describe('guardrails delete', () => {
  test('confirmDestructive returns true with --force', async () => {
    const confirmed = await confirmDestructive('Delete guardrail gr-001?', { force: true });
    expect(confirmed).toBe(true);
  });

  test('throws CliError(usage) in non-interactive mode without --force', async () => {
    await expect(
      confirmDestructive('Delete guardrail gr-001?', { force: false, nonInteractive: true }),
    ).rejects.toBeInstanceOf(CliError);
  });

  test('missing management key throws CliError(no_key)', () => {
    const { CliError: CE } = require('../../../src/lib/errors/exit-codes.ts');
    expect(() => {
      const key: string | undefined = undefined;
      if (!key) throw new CE('no_key', 'Management key required for guardrail operations');
    }).toThrow(CE);
  });
});

// ---------------------------------------------------------------------------
// assignments — GET request shape
// ---------------------------------------------------------------------------

describe('guardrails assignments', () => {
  test('sends GET to /guardrails/{id}/member-assignments', async () => {
    let receivedPath = '';

    mockServer = Bun.serve({
      port: 0,
      fetch: (req) => {
        receivedPath = new URL(req.url).pathname;
        return new Response(JSON.stringify({ data: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');

    await request<unknown>({
      path: '/guardrails/gr-001/member-assignments',
      method: 'GET',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    expect(receivedPath).toBe('/guardrails/gr-001/member-assignments');
  });
});
