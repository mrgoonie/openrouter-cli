import { describe, expect, test } from 'bun:test';
import { streamSSE } from '../../src/lib/client/sse.ts';

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function makeResponse(body: string): Response {
  return new Response(makeStream([body]), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('streamSSE', () => {
  test('yields parsed data event and skips [DONE]', async () => {
    const body = 'data: {"x":1}\n\ndata: [DONE]\n\n';
    const response = makeResponse(body);

    const events: unknown[] = [];
    for await (const evt of streamSSE(response)) {
      events.push(evt);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: undefined, data: { x: 1 } });
  });

  test('skips keepalive comment lines', async () => {
    const body = ': keepalive\n\ndata: {"msg":"hello"}\n\ndata: [DONE]\n\n';
    const response = makeResponse(body);

    const events: unknown[] = [];
    for await (const evt of streamSSE(response)) {
      events.push(evt);
    }

    expect(events).toHaveLength(1);
    expect((events[0] as { data: { msg: string } }).data.msg).toBe('hello');
  });

  test('handles multiple data events before [DONE]', async () => {
    const body = 'data: {"i":0}\n\ndata: {"i":1}\n\ndata: {"i":2}\n\ndata: [DONE]\n\n';
    const response = makeResponse(body);

    const events: unknown[] = [];
    for await (const evt of streamSSE(response)) {
      events.push(evt);
    }

    expect(events).toHaveLength(3);
  });

  test('handles named event type', async () => {
    const body = 'event: delta\ndata: {"token":"hi"}\n\ndata: [DONE]\n\n';
    const response = makeResponse(body);

    const events: Array<{ event?: string; data: unknown }> = [];
    for await (const evt of streamSSE(response)) {
      events.push(evt);
    }

    expect(events[0]?.event).toBe('delta');
    expect(events[0]?.data).toEqual({ token: 'hi' });
  });

  test('stream with no events (only [DONE]) yields nothing', async () => {
    const body = 'data: [DONE]\n\n';
    const response = makeResponse(body);

    const events: unknown[] = [];
    for await (const evt of streamSSE(response)) {
      events.push(evt);
    }

    expect(events).toHaveLength(0);
  });
});
