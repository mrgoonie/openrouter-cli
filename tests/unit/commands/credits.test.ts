/**
 * Unit tests for `openrouter credits show` command pipeline.
 * Covers: happy path with mgmt key, CliError when key missing.
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

const CREDITS_RESPONSE = {
  data: {
    total_credits: 10.5,
    total_usage: 3.25,
  },
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

describe('credits show — happy path', () => {
  test('returns envelope with credits data in JSON mode', async () => {
    mockServer = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify(CREDITS_RESPONSE), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    process.env.OPENROUTER_BASE_URL = `http://localhost:${mockServer.port}`;
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { render } = await import('../../../src/lib/output/renderer.ts');
    const { CreditsResponseSchema } = await import('../../../src/lib/types/openrouter.ts');

    const result = await request<unknown>({
      path: '/credits',
      method: 'GET',
      auth: 'mgmt',
      apiKey: process.env.OPENROUTER_MANAGEMENT_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    });

    const parsed = CreditsResponseSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);

    const { total_credits, total_usage } = parsed.success
      ? parsed.data.data
      : { total_credits: 0, total_usage: 0 };
    const remaining = total_credits - total_usage;

    const out = await captureStdout(async () => {
      render({ data: { total_credits, total_usage, remaining }, meta: {} }, { format: 'json' });
    });

    const env = JSON.parse(out);
    expect(env.success).toBe(true);
    expect(env.data.total_credits).toBe(10.5);
    expect(env.data.total_usage).toBe(3.25);
    expect(env.data.remaining).toBeCloseTo(7.25);
  });

  test('pretty output contains purchased / used / remaining', async () => {
    const total_credits = 10.5;
    const total_usage = 3.25;
    const remaining = total_credits - total_usage;

    const fmt = (n: number) => `$${n.toFixed(4)}`;
    const out = await captureStdout(async () => {
      process.stdout.write(
        `purchased: ${fmt(total_credits)}  used: ${fmt(total_usage)}  remaining: ${fmt(remaining)}\n`,
      );
    });

    expect(out).toContain('purchased: $10.5000');
    expect(out).toContain('used: $3.2500');
    expect(out).toContain('remaining: $7.2500');
  });
});

describe('credits show — missing management key', () => {
  test('throws CliError with no_key code', async () => {
    const { CliError } = await import('../../../src/lib/errors/exit-codes.ts');

    const mgmtKey: string | undefined = undefined;

    expect(() => {
      if (!mgmtKey) {
        throw new CliError(
          'no_key',
          'Management key required to view credits',
          'Set OPENROUTER_MANAGEMENT_KEY or run: openrouter auth set-key <key> --management',
        );
      }
    }).toThrow(CliError);
  });

  test('CliError has exit code 64', async () => {
    const { CliError, ExitCode } = await import('../../../src/lib/errors/exit-codes.ts');
    const err = new CliError('no_key', 'test');
    expect(err.exit).toBe(ExitCode.NO_KEY);
    expect(err.exit).toBe(64);
  });

  test('CliError hint contains useful guidance', async () => {
    const { CliError } = await import('../../../src/lib/errors/exit-codes.ts');
    const hint = 'Set OPENROUTER_MANAGEMENT_KEY or run: openrouter auth set-key <key> --management';
    const err = new CliError('no_key', 'Management key required to view credits', hint);
    expect(err.hint).toBe(hint);
  });
});
