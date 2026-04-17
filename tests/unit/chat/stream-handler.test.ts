/**
 * Unit tests for runStream() — verifies output for pretty, json, and ndjson modes
 * using a canned SSE ReadableStream as the Response body.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { runStream } from '../../../src/lib/chat/stream-handler.ts';

// ---------------------------------------------------------------------------
// Helpers to build fake SSE Response
// ---------------------------------------------------------------------------

function encodeSSE(chunks: object[], done = true): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      if (done) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function makeStreamResponse(chunks: object[], done = true): Response {
  return new Response(encodeSSE(chunks, done), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function makeChunk(content: string, finish?: string): object {
  return {
    id: 'chatcmpl-test',
    model: 'test-model',
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: finish ?? null,
      },
    ],
  };
}

function makeUsageChunk(usage: object): object {
  return {
    id: 'chatcmpl-test',
    model: 'test-model',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage,
  };
}

// ---------------------------------------------------------------------------
// Capture stdout/stderr writes
// ---------------------------------------------------------------------------

type WriteSpy = { calls: string[]; restore: () => void };

function spyWrite(stream: NodeJS.WriteStream): WriteSpy {
  const calls: string[] = [];
  const original = stream.write.bind(stream);
  // biome-ignore lint/suspicious/noExplicitAny: spy wrapper
  (stream as any).write = (chunk: string | Uint8Array) => {
    calls.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  return {
    calls,
    restore: () => {
      // biome-ignore lint/suspicious/noExplicitAny: spy restore
      (stream as any).write = original;
    },
  };
}

// ---------------------------------------------------------------------------
// pretty mode
// ---------------------------------------------------------------------------

describe('runStream — pretty mode', () => {
  let stdoutSpy: WriteSpy;
  let stderrSpy: WriteSpy;

  beforeEach(() => {
    stdoutSpy = spyWrite(process.stdout);
    stderrSpy = spyWrite(process.stderr);
  });

  afterEach(() => {
    stdoutSpy.restore();
    stderrSpy.restore();
  });

  test('writes delta content chunks to stdout', async () => {
    const response = makeStreamResponse([
      makeChunk('Hello'),
      makeChunk(', '),
      makeChunk('world'),
      makeUsageChunk({ prompt_tokens: 5, completion_tokens: 3 }),
    ]);

    const result = await runStream(response, { format: 'pretty', noColor: true });

    const stdout = stdoutSpy.calls.join('');
    expect(stdout).toContain('Hello');
    expect(stdout).toContain(', ');
    expect(stdout).toContain('world');
    expect(stdout).toContain('\n'); // trailing newline

    expect(result.accumulated).toBe('Hello, world');
  });

  test('writes usage summary to stderr', async () => {
    const usage = { prompt_tokens: 10, completion_tokens: 5 };
    const response = makeStreamResponse([makeChunk('Hi'), makeUsageChunk(usage)]);

    await runStream(response, { format: 'pretty', noColor: true });

    const stderr = stderrSpy.calls.join('');
    expect(stderr).toContain('usage');
    expect(stderr).toContain('10');
  });

  test('returns finishReason from chunk', async () => {
    const response = makeStreamResponse([makeChunk('Done', 'stop')]);
    const result = await runStream(response, { format: 'pretty', noColor: true });
    expect(result.finishReason).toBe('stop');
  });
});

// ---------------------------------------------------------------------------
// ndjson mode
// ---------------------------------------------------------------------------

describe('runStream — ndjson mode', () => {
  let stdoutSpy: WriteSpy;
  let stderrSpy: WriteSpy;

  beforeEach(() => {
    stdoutSpy = spyWrite(process.stdout);
    stderrSpy = spyWrite(process.stderr);
  });

  afterEach(() => {
    stdoutSpy.restore();
    stderrSpy.restore();
  });

  test('emits delta lines per content token', async () => {
    const response = makeStreamResponse([
      makeChunk('Foo'),
      makeChunk('Bar'),
      makeUsageChunk({ total_tokens: 10 }),
    ]);

    await runStream(response, { format: 'ndjson', noColor: true });

    const lines = stdoutSpy.calls
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const deltas = lines.filter((l) => l.type === 'delta');
    expect(deltas.length).toBe(2);
    expect(deltas[0]).toMatchObject({ type: 'delta', content: 'Foo' });
    expect(deltas[1]).toMatchObject({ type: 'delta', content: 'Bar' });
  });

  test('emits result line at end with usage', async () => {
    const usage = { total_tokens: 20 };
    const response = makeStreamResponse([makeChunk('Hi'), makeUsageChunk(usage)]);

    await runStream(response, { format: 'ndjson', noColor: true });

    const lines = stdoutSpy.calls
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const result = lines.find((l) => l.type === 'result');
    expect(result).toBeDefined();
    expect(result.usage).toEqual(usage);
  });
});

// ---------------------------------------------------------------------------
// json mode
// ---------------------------------------------------------------------------

describe('runStream — json mode', () => {
  let stdoutSpy: WriteSpy;
  let stderrSpy: WriteSpy;

  beforeEach(() => {
    stdoutSpy = spyWrite(process.stdout);
    stderrSpy = spyWrite(process.stderr);
  });

  afterEach(() => {
    stdoutSpy.restore();
    stderrSpy.restore();
  });

  test('accumulates all content and emits single JSON envelope', async () => {
    const response = makeStreamResponse([
      makeChunk('Part1'),
      makeChunk(' Part2'),
      makeUsageChunk({ total_tokens: 5 }),
    ]);

    const result = await runStream(response, { format: 'json', noColor: true });

    expect(result.accumulated).toBe('Part1 Part2');

    const stdout = stdoutSpy.calls.join('');
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.content).toBe('Part1 Part2');
  });

  test('emits nothing to stderr in json mode', async () => {
    const response = makeStreamResponse([makeChunk('X')]);
    await runStream(response, { format: 'json', noColor: true });
    expect(stderrSpy.calls.join('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Abort / empty stream
// ---------------------------------------------------------------------------

describe('runStream — edge cases', () => {
  let stdoutSpy: WriteSpy;
  let stderrSpy: WriteSpy;

  beforeEach(() => {
    stdoutSpy = spyWrite(process.stdout);
    stderrSpy = spyWrite(process.stderr);
  });

  afterEach(() => {
    stdoutSpy.restore();
    stderrSpy.restore();
  });

  test('empty stream returns empty accumulated string', async () => {
    const response = makeStreamResponse([]);
    const result = await runStream(response, { format: 'pretty', noColor: true });
    expect(result.accumulated).toBe('');
  });

  test('malformed SSE data is silently skipped', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // valid chunk
        controller.enqueue(
          encoder.encode(
            'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
          ),
        );
        // malformed chunk (not matching schema → silently skip)
        controller.enqueue(encoder.encode('data: {"bad":true}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const response = new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });

    const result = await runStream(response, { format: 'pretty', noColor: true });
    expect(result.accumulated).toBe('ok');
  });
});
