/**
 * SSE stream handler for /chat/completions streaming responses.
 * Supports three output modes:
 *   - pretty: writes delta content to stdout, usage summary to stderr at end
 *   - ndjson: emits {type:"delta"} per token + {type:"result"} at end
 *   - json:   accumulates all content, emits single envelope at end
 */

import pc from 'picocolors';
import { streamSSE } from '../client/sse.ts';
import { emitNdjson, envelope } from '../output/json.ts';
import { ChatCompletionStreamChunkSchema } from '../types/openrouter.ts';

export type StreamHandlerOpts = {
  format: 'pretty' | 'json' | 'ndjson';
  noColor?: boolean;
  signal?: AbortSignal;
};

export type StreamResult = {
  finishReason?: string;
  usage?: unknown;
  generationId?: string;
  accumulated: string;
};

/**
 * Drain an SSE streaming Response and handle output per format mode.
 * Returns a summary of the stream result for callers that need it.
 */
export async function runStream(
  response: Response,
  opts: StreamHandlerOpts,
): Promise<StreamResult> {
  const { format, noColor, signal } = opts;

  let accumulated = '';
  let finishReason: string | undefined;
  let usage: unknown;
  // generationId comes from response header (captured before calling this fn),
  // but the final chunk may also include it — we track from chunks.
  let generationId: string | undefined;

  // Capture generationId from response header if available
  const headerGenId = response.headers.get('x-generation-id');
  if (headerGenId) generationId = headerGenId;

  try {
    for await (const event of streamSSE(response, signal)) {
      // Parse the chunk — soft-fail on malformed events
      const parsed = ChatCompletionStreamChunkSchema.safeParse(event.data);
      if (!parsed.success) continue;

      const chunk = parsed.data;

      // Capture usage from final chunk (OpenRouter sends it on last chunk)
      if (chunk.usage) usage = chunk.usage;

      for (const choice of chunk.choices) {
        const delta = choice.delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        // Capture finish_reason
        if (choice.finish_reason) finishReason = choice.finish_reason;

        const content = typeof delta.content === 'string' ? delta.content : null;
        const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : null;

        if (content) {
          accumulated += content;

          if (format === 'pretty') {
            process.stdout.write(content);
          } else if (format === 'ndjson') {
            emitNdjson({ type: 'delta', content });
          }
          // json mode: just accumulate, emit at end
        }

        if (toolCalls && toolCalls.length > 0) {
          if (format === 'pretty') {
            // Render tool calls dimmed so they don't interfere with content flow
            const dim = noColor ? (s: string) => s : pc.dim;
            process.stderr.write(`${dim(`[tool_calls: ${JSON.stringify(toolCalls)}]`)}\n`);
          } else if (format === 'ndjson') {
            emitNdjson({ type: 'tool_call', tool_calls: toolCalls });
          }
        }
      }

      // Check abort after processing each event
      if (signal?.aborted) break;
    }
  } catch (err) {
    // AbortError from SIGINT — fall through to emit partial results
    if (err instanceof Error && err.name !== 'AbortError') throw err;
  }

  // --- End of stream: emit summaries / final output ---

  if (format === 'pretty') {
    process.stdout.write('\n');
    if (usage) {
      const dim = noColor ? (s: string) => s : pc.dim;
      process.stderr.write(`${dim(`[usage: ${JSON.stringify(usage)}]`)}\n`);
    }
  } else if (format === 'json') {
    const env = envelope(
      { content: accumulated, finish_reason: finishReason, usage, generation_id: generationId },
      { generation_id: generationId },
    );
    process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
  } else if (format === 'ndjson') {
    emitNdjson({ type: 'result', usage, finish_reason: finishReason, generation_id: generationId });
  }

  return { finishReason, usage, generationId, accumulated };
}
