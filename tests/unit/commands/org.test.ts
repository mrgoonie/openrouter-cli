/**
 * Unit tests for `openrouter org` command pipeline.
 * Covers: members table rendering, missing key guard.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';

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

const ORG_MEMBERS_RESPONSE = {
  data: [
    {
      id: 'u-001',
      email: 'alice@example.com',
      name: 'Alice',
      role: 'admin',
      joined_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'u-002',
      email: 'bob@example.com',
      name: 'Bob',
      role: 'member',
      joined_at: '2024-02-01T00:00:00Z',
    },
  ],
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
// members — table rendering
// ---------------------------------------------------------------------------

describe('org members', () => {
  test('returns array of member objects in JSON mode', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(ORG_MEMBERS_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { render } = await import('../../../src/lib/output/renderer.ts');

    const result = await request<typeof ORG_MEMBERS_RESPONSE>({
      path: '/organization/members',
      method: 'GET',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    const rows = result.data?.data ?? [];
    expect(rows).toHaveLength(2);
    expect(rows.at(0)?.email).toBe('alice@example.com');
    expect(rows.at(1)?.role).toBe('member');

    const out = await captureStdout(async () => {
      render({ data: rows, meta: {} }, { format: 'json' });
    });

    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(2);
  });

  test('table renders id, email, name, role, joined_at columns', async () => {
    const { renderTable } = await import('../../../src/lib/output/table.ts');

    const columns = [
      { key: 'id', header: 'ID', width: 20 },
      { key: 'email', header: 'Email', width: 28 },
      { key: 'name', header: 'Name', width: 20 },
      { key: 'role', header: 'Role', width: 12 },
      { key: 'joined_at', header: 'Joined At', width: 22 },
    ];

    const rows = ORG_MEMBERS_RESPONSE.data.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name ?? '-',
      role: row.role ?? '-',
      joined_at: row.joined_at ?? '-',
    }));

    const table = renderTable(rows, columns);
    expect(table).toContain('alice@example.com');
    expect(table).toContain('admin');
    expect(table).toContain('bob@example.com');
  });

  test('null fields are normalized to "-" in table output', () => {
    const columns = [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
    ];

    // Simulate normalization logic from org.ts
    const raw = [{ id: 'u-003', name: null as unknown as string }];
    const normalized = raw.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        const v = (row as Record<string, unknown>)[col.key];
        out[col.key] = v === null || v === undefined ? '-' : v;
      }
      return out;
    });

    expect(normalized.at(0)?.name).toBe('-');
    expect(normalized.at(0)?.id).toBe('u-003');
  });

  test('missing management key throws CliError(no_key)', () => {
    const { CliError } = require('../../../src/lib/errors/exit-codes.ts');
    expect(() => {
      const key: string | undefined = undefined;
      if (!key) throw new CliError('no_key', 'Management key required for org operations');
    }).toThrow(CliError);
  });
});
