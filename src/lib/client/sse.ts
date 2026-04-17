/**
 * SSE stream reader — wraps eventsource-parser over a fetch Response body.
 * Skips keep-alive comments and terminates on the [DONE] sentinel.
 */

import { createParser } from 'eventsource-parser';

export type SSEEvent = {
  event?: string;
  data: unknown;
};

/**
 * Async generator that yields parsed SSE events from a streaming Response.
 *
 * - Skips comment lines (`: ...`) via the parser's onComment path
 * - Stops iteration on `data: [DONE]`
 * - Forwards AbortSignal — throws if aborted mid-stream
 */
export async function* streamSSE(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  if (!response.body) throw new Error('Response has no body');

  // Queue events emitted by the sync parser callback so the async generator
  // can yield them one at a time without data races.
  const queue: SSEEvent[] = [];
  let done = false;

  const parser = createParser({
    onEvent(msg) {
      if (msg.data === '[DONE]') {
        done = true;
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.data);
      } catch {
        parsed = msg.data;
      }
      queue.push({ event: msg.event, data: parsed });
    },
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (!done) {
      if (signal?.aborted) break;

      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;

      parser.feed(decoder.decode(value, { stream: true }));

      // Drain the queue — yield buffered events before reading next chunk
      while (queue.length > 0) {
        const evt = queue.shift();
        if (evt) yield evt;
      }

      if (done) break;
    }

    // Yield any remaining events after stream closes
    while (queue.length > 0) {
      const evt = queue.shift();
      if (evt) yield evt;
    }
  } finally {
    reader.releaseLock();
  }
}
