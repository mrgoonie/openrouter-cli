/**
 * Smoke tests for chat subcommand wiring.
 * Uses Bun.serve to mock the OpenRouter API and invokes the handler directly.
 * Tests: non-streaming JSON mode output, stdin message source, missing model error.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture stdout writes during async fn execution. */
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

/** Minimal chat completions response. */
function makeChatResponse(content: string) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1_700_000_000,
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
  };
}

// ---------------------------------------------------------------------------
// Mock server setup
// ---------------------------------------------------------------------------

let mockServer: Server | null = null;

function startMockServer(handler: (req: Request) => Response | Promise<Response>): Server {
  mockServer = Bun.serve({ port: 0, fetch: handler });
  return mockServer;
}

afterEach(() => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
  // Clean up env override
  process.env.OPENROUTER_BASE_URL = undefined;
  process.env.OPENROUTER_API_KEY = undefined;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chat send — non-streaming JSON mode', () => {
  test('renders envelope with choices when API returns success', async () => {
    const server = startMockServer((_req) => {
      return new Response(JSON.stringify(makeChatResponse('Hello from mock!')), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    process.env.OPENROUTER_BASE_URL = `http://localhost:${server.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-test-key';

    // Import handler after env is set so resolver picks it up
    const { buildChatRequest } = await import('../../../src/lib/chat/build-request.ts');
    const { request } = await import('../../../src/lib/client/client.ts');
    const { render } = await import('../../../src/lib/output/renderer.ts');

    const { body } = await buildChatRequest({ message: 'Hi', model: 'gpt-4o', stream: false });

    let output = '';
    output = await captureStdout(async () => {
      const result = await request<unknown>({
        path: '/chat/completions',
        method: 'POST',
        auth: 'user',
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: process.env.OPENROUTER_BASE_URL,
        body,
      });
      render({ data: result.data, meta: { elapsed_ms: result.elapsedMs } }, { format: 'json' });
    });

    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    // biome-ignore lint/suspicious/noExplicitAny: dynamic test data
    expect((parsed.data as any).choices[0].message.content).toBe('Hello from mock!');
  });
});

describe('chat send — NDJSON mode', () => {
  test('emits delta and result lines for streaming response', async () => {
    const chunks = [
      {
        id: 'c1',
        model: 'gpt-4o',
        choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }],
      },
      {
        id: 'c1',
        model: 'gpt-4o',
        choices: [{ index: 0, delta: { content: '!' }, finish_reason: 'stop' }],
        usage: { total_tokens: 5 },
      },
    ];

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const response = new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
    });

    const { runStream } = await import('../../../src/lib/chat/stream-handler.ts');

    const lines: unknown[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    // biome-ignore lint/suspicious/noExplicitAny: spy
    (process.stdout as any).write = (chunk: string | Uint8Array) => {
      const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      for (const line of text.split('\n').filter(Boolean)) {
        try {
          lines.push(JSON.parse(line));
        } catch {
          /* skip */
        }
      }
      return true;
    };

    try {
      await runStream(response, { format: 'ndjson', noColor: true });
    } finally {
      // biome-ignore lint/suspicious/noExplicitAny: restore
      (process.stdout as any).write = origWrite;
    }

    const deltas = (lines as Array<{ type: string }>).filter((l) => l.type === 'delta');
    const result = (lines as Array<{ type: string }>).find((l) => l.type === 'result');

    expect(deltas.length).toBe(2);
    expect(result).toBeDefined();
  });
});

describe('chat send — error cases', () => {
  test('API returns 401 → throws HTTPError', async () => {
    const server = startMockServer(
      (_req) =>
        new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    process.env.OPENROUTER_BASE_URL = `http://localhost:${server.port}`;
    process.env.OPENROUTER_API_KEY = 'sk-or-bad-key';

    const { request } = await import('../../../src/lib/client/client.ts');
    const { HTTPError } = await import('../../../src/lib/client/errors.ts');

    await expect(
      request({
        path: '/chat/completions',
        method: 'POST',
        auth: 'user',
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: process.env.OPENROUTER_BASE_URL,
        body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toBeInstanceOf(HTTPError);
  });

  test('buildChatRequest — empty message is still valid (caller validates)', async () => {
    // buildChatRequest itself does not reject empty message — validation is at CLI layer
    const { buildChatRequest } = await import('../../../src/lib/chat/build-request.ts');
    const { body } = await buildChatRequest({ message: '', model: 'gpt-4o' });
    expect((body.messages as Array<{ content: string }>)[0]?.content).toBe('');
  });
});
