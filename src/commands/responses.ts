/**
 * `openrouter responses` sub-command group.
 * Verbs: create
 *
 * create — Beta Responses API (OpenAI-compatible)
 *   Mirrors chat send flags; adds --reasoning <effort> and --web-search.
 *   Pretty mode: renders reasoning_details dimmed before main content.
 */

import { text } from '@clack/prompts';
import { defineCommand } from 'citty';
import pc from 'picocolors';
import { request } from '../lib/client/client.ts';
import { streamSSE } from '../lib/client/sse.ts';
import { streamRequest } from '../lib/client/stream-request.ts';
import { buildResolverContext, resolveApiKey, resolveBaseUrl } from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { emitNdjson, envelope } from '../lib/output/json.ts';
import { render } from '../lib/output/renderer.ts';
import { isNonInteractive, resolveOutputMode } from '../lib/output/tty.ts';
import { pickModel } from '../lib/tui/model-picker.ts';
import { ResponsesResponseSchema, ResponsesStreamChunkSchema } from '../lib/types/openrouter.ts';

// ---------------------------------------------------------------------------
// create verb
// ---------------------------------------------------------------------------

const createCommand = defineCommand({
  meta: { description: 'Create a response using the Beta Responses API' },
  args: {
    message: {
      type: 'positional' as const,
      description: 'Input message (use - to read from stdin)',
      required: false,
    },
    model: { type: 'string' as const, description: 'Model ID', alias: 'm' },
    system: { type: 'string' as const, description: 'System prompt', alias: 's' },
    reasoning: {
      type: 'string' as const,
      description: 'Reasoning effort: low | medium | high',
    },
    'web-search': {
      type: 'boolean' as const,
      description: 'Enable web search tool',
      default: false,
    },
    temperature: { type: 'string' as const, description: 'Sampling temperature' },
    'max-tokens': { type: 'string' as const, description: 'Maximum tokens' },
    stream: { type: 'boolean' as const, description: 'Force streaming on', default: undefined },
    'no-stream': { type: 'boolean' as const, description: 'Force streaming off', default: false },
    interactive: {
      type: 'boolean' as const,
      description: 'Interactive model picker',
      alias: 'i',
      default: false,
    },
    output: {
      type: 'string' as const,
      description: 'Output format: pretty | json | ndjson',
      alias: 'o',
    },
    json: { type: 'boolean' as const, description: 'Alias for --output json', default: false },
    'no-color': { type: 'boolean' as const, description: 'Disable ANSI color', default: false },
    'api-key': { type: 'string' as const, description: 'OpenRouter API key', alias: 'k' },
    'base-url': { type: 'string' as const, description: 'API base URL' },
    config: { type: 'string' as const, description: 'Path to TOML config file', alias: 'c' },
    timeout: { type: 'string' as const, description: 'Request timeout in ms' },
  },
  async run({ args }) {
    const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };

    const apiKey = resolveApiKey(args['api-key'] as string | undefined, deps).value;
    const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;
    const timeoutMs = args.timeout ? Number(args.timeout) : undefined;
    const noColor = (args['no-color'] as boolean) ?? false;

    // --- Output format ---
    const outputFlag = (args.json as boolean) ? 'json' : (args.output as string | undefined);
    const format = resolveOutputMode(outputFlag);
    const streamFormat: 'pretty' | 'json' | 'ndjson' =
      format === 'ndjson' ? 'ndjson' : format === 'json' ? 'json' : 'pretty';

    // --- Resolve message ---
    let message = args.message as string | undefined;
    if (message === '-' || (!message && isNonInteractive())) {
      message = (await Bun.stdin.text()).trim();
      if (!message) throw new CliError('usage', 'No message provided via stdin');
    } else if (!message) {
      if (isNonInteractive()) {
        throw new CliError('usage', 'No message provided', 'pass a message or pipe via stdin');
      }
      const input = await text({ message: 'Your prompt:' });
      if (typeof input === 'symbol') process.exit(0);
      message = (input as string).trim();
      if (!message) throw new CliError('usage', 'Message must not be empty');
    }

    // --- Resolve model ---
    let model = args.model as string | undefined;
    if (!model) {
      if ((args.interactive as boolean) && !isNonInteractive()) {
        model = await pickModel({ apiKey, baseUrl });
      } else {
        throw new CliError('usage', '--model is required', 'pass --model <id> or use -i');
      }
    }

    // --- Streaming ---
    const noStream = args['no-stream'] as boolean;
    const forceStream = args.stream as boolean | undefined;
    let shouldStream: boolean;
    if (noStream) {
      shouldStream = false;
    } else if (forceStream !== undefined) {
      shouldStream = forceStream;
    } else {
      shouldStream = streamFormat !== 'json';
    }

    // --- Build Responses API body ---
    const input: Array<{ role: string; content: string }> = [];
    if (args.system) input.push({ role: 'system', content: args.system as string });
    input.push({ role: 'user', content: message });

    const body: Record<string, unknown> = { model, input, stream: shouldStream };

    if (args.reasoning) {
      body.reasoning = { effort: args.reasoning as string };
    }

    const tools: Array<Record<string, unknown>> = [];
    if (args['web-search']) {
      tools.push({ type: 'web_search' });
    }
    if (tools.length > 0) body.tools = tools;

    if (args.temperature) body.temperature = Number(args.temperature);
    if (args['max-tokens']) body.max_tokens = Number(args['max-tokens']);

    const clientOpts = {
      path: '/responses',
      method: 'POST' as const,
      auth: 'user' as const,
      apiKey,
      baseUrl,
      body,
      timeoutMs,
    };

    if (shouldStream) {
      const controller = new AbortController();
      const onSigint = () => controller.abort();
      process.once('SIGINT', onSigint);

      try {
        const response = await streamRequest({ ...clientOpts, signal: controller.signal });
        await runResponsesStream(response, {
          format: streamFormat,
          noColor,
          signal: controller.signal,
        });
      } finally {
        process.removeListener('SIGINT', onSigint);
      }
    } else {
      const result = await request<unknown>(clientOpts);
      const parsed = ResponsesResponseSchema.safeParse(result.data);
      const data = parsed.success ? parsed.data : result.data;

      if (streamFormat === 'pretty') {
        renderResponsesPretty(data as Record<string, unknown>, noColor);
      } else {
        render(
          {
            data,
            meta: {
              request_id: result.requestId,
              elapsed_ms: result.elapsedMs,
              generation_id: result.generationId,
            },
          },
          { format, noColor },
        );
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Pretty renderer for non-streaming responses (handles reasoning_details)
// ---------------------------------------------------------------------------

function renderResponsesPretty(data: Record<string, unknown>, noColor: boolean): void {
  const dim = noColor ? (s: string) => s : pc.dim;

  if (data.reasoning_details) {
    process.stdout.write(`${dim(JSON.stringify(data.reasoning_details))}\n\n`);
  }

  // Extract text content from output array
  const output = Array.isArray(data.output) ? data.output : [];
  let textContent = '';
  for (const item of output) {
    if (typeof item === 'object' && item !== null) {
      const o = item as Record<string, unknown>;
      if (typeof o.content === 'string') textContent += o.content;
      else if (Array.isArray(o.content)) {
        for (const part of o.content) {
          if (typeof part === 'object' && part !== null) {
            const p = part as Record<string, unknown>;
            if (p.type === 'text' && typeof p.text === 'string') textContent += p.text;
          }
        }
      }
    }
  }

  if (textContent) process.stdout.write(`${textContent}\n`);
  if (data.usage) process.stderr.write(`${dim(`[usage: ${JSON.stringify(data.usage)}]`)}\n`);
}

// ---------------------------------------------------------------------------
// Streaming handler for /responses
// ---------------------------------------------------------------------------

async function runResponsesStream(
  response: Response,
  opts: { format: 'pretty' | 'json' | 'ndjson'; noColor: boolean; signal?: AbortSignal },
): Promise<void> {
  const { format, noColor, signal } = opts;
  const dim = noColor ? (s: string) => s : pc.dim;
  let accumulated = '';
  let usage: unknown;
  let finishReason: string | undefined;

  try {
    for await (const event of streamSSE(response, signal)) {
      const parsed = ResponsesStreamChunkSchema.safeParse(event.data);
      if (!parsed.success) continue;

      const chunk = parsed.data;
      if (chunk.usage) usage = chunk.usage;

      const delta = chunk.delta;
      let content: string | null = null;
      if (typeof delta === 'string') content = delta;
      else if (typeof delta === 'object' && delta !== null) {
        const d = delta as Record<string, unknown>;
        if (typeof d.content === 'string') content = d.content;
      }

      if (typeof chunk.type === 'string' && chunk.type.includes('done')) {
        finishReason = 'stop';
      }

      if (content) {
        accumulated += content;
        if (format === 'pretty') process.stdout.write(content);
        else if (format === 'ndjson') emitNdjson({ type: 'delta', content });
      }

      if (signal?.aborted) break;
    }
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') throw err;
  }

  if (format === 'pretty') {
    process.stdout.write('\n');
    if (usage) process.stderr.write(`${dim(`[usage: ${JSON.stringify(usage)}]`)}\n`);
  } else if (format === 'json') {
    const env = envelope({ content: accumulated, finish_reason: finishReason, usage }, {});
    process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
  } else if (format === 'ndjson') {
    emitNdjson({ type: 'result', usage, finish_reason: finishReason });
  }
}

// ---------------------------------------------------------------------------
// Sub-router export
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: { description: 'Beta Responses API — create and stream responses' },
  subCommands: {
    create: createCommand,
  },
});
