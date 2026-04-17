/**
 * `openrouter chat` sub-command group.
 * Verbs: send (+ completion alias)
 *
 * send — flagship streaming chat completion command
 *   Message source precedence: positional > stdin (-/non-TTY) > interactive prompt
 *   Streaming default: true for pretty/ndjson, false for json (overrideable)
 *   Model: --model flag, or interactive picker (-i), or error
 */

import { text } from '@clack/prompts';
import { defineCommand } from 'citty';
import { buildChatRequest } from '../lib/chat/build-request.ts';
import { runStream } from '../lib/chat/stream-handler.ts';
import { request } from '../lib/client/client.ts';
import { streamRequest } from '../lib/client/stream-request.ts';
import { buildResolverContext, resolveApiKey, resolveBaseUrl } from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { envelope } from '../lib/output/json.ts';
import { render } from '../lib/output/renderer.ts';
import { isNonInteractive, resolveOutputMode } from '../lib/output/tty.ts';
import { pickModel } from '../lib/tui/model-picker.ts';
import type { ChatCompletionResponse } from '../lib/types/openrouter.ts';

// ---------------------------------------------------------------------------
// Shared args definition
// ---------------------------------------------------------------------------

const sendArgs = {
  message: {
    type: 'positional' as const,
    description: 'Message to send (use - to read from stdin)',
    required: false,
  },
  model: { type: 'string' as const, description: 'Model ID', alias: 'm' },
  system: { type: 'string' as const, description: 'System prompt', alias: 's' },
  temperature: { type: 'string' as const, description: 'Sampling temperature (0–2)' },
  'max-tokens': { type: 'string' as const, description: 'Maximum tokens to generate' },
  'top-p': { type: 'string' as const, description: 'Top-p nucleus sampling' },
  'frequency-penalty': { type: 'string' as const, description: 'Frequency penalty (-2 to 2)' },
  'presence-penalty': { type: 'string' as const, description: 'Presence penalty (-2 to 2)' },
  stop: { type: 'string' as const, description: 'Stop sequence (repeatable)', array: true },
  tools: { type: 'string' as const, description: 'Path to JSON file with tool definitions' },
  'response-format': {
    type: 'string' as const,
    description: 'Path to JSON file with response_format',
  },
  provider: { type: 'string' as const, description: 'Path to JSON file with provider preferences' },
  plugins: { type: 'string' as const, description: 'Path to JSON file with plugins config' },
  stream: { type: 'boolean' as const, description: 'Force streaming on', default: undefined },
  'no-stream': { type: 'boolean' as const, description: 'Force streaming off', default: false },
  interactive: {
    type: 'boolean' as const,
    description: 'Interactive model picker',
    alias: 'i',
    default: false,
  },
  // Global flags (duplicated here so citty parses them at subcommand level)
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
};

// ---------------------------------------------------------------------------
// Core send handler (shared between send + completion alias)
// ---------------------------------------------------------------------------

async function handleSend(args: Record<string, unknown>): Promise<void> {
  const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
  const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };

  const apiKey = resolveApiKey(args['api-key'] as string | undefined, deps).value;
  const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;
  const timeoutMs = args.timeout ? Number(args.timeout) : undefined;
  const noColor = (args['no-color'] as boolean) ?? false;

  // --- Resolve output format ---
  const outputFlag = (args.json as boolean) ? 'json' : (args.output as string | undefined);
  const format = resolveOutputMode(outputFlag);
  // Normalize to pretty/json/ndjson for stream-handler (strip table/text/yaml)
  const streamFormat: 'pretty' | 'json' | 'ndjson' =
    format === 'ndjson' ? 'ndjson' : format === 'json' ? 'json' : 'pretty';

  // --- Resolve message ---
  let message = args.message as string | undefined;

  // stdin: either explicit '-' or piped stdin
  if (message === '-' || (!message && isNonInteractive())) {
    message = await Bun.stdin.text();
    message = message.trim();
    if (!message) {
      throw new CliError('usage', 'No message provided via stdin');
    }
  } else if (!message) {
    // TTY interactive prompt
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
      throw new CliError(
        'usage',
        '--model is required',
        'pass --model <id> or use -i for interactive model picker',
      );
    }
  }

  // --- Resolve streaming ---
  const noStream = args['no-stream'] as boolean;
  const forceStream = args.stream as boolean | undefined;
  let shouldStream: boolean;
  if (noStream) {
    shouldStream = false;
  } else if (forceStream !== undefined) {
    shouldStream = forceStream;
  } else {
    // Default: stream for pretty/ndjson, not for json
    shouldStream = streamFormat !== 'json';
  }

  // --- Build request body ---
  const { body } = await buildChatRequest({
    message,
    system: args.system as string | undefined,
    model,
    stream: shouldStream,
    temperature: args.temperature ? Number(args.temperature) : undefined,
    maxTokens: args['max-tokens'] ? Number(args['max-tokens']) : undefined,
    topP: args['top-p'] ? Number(args['top-p']) : undefined,
    frequencyPenalty: args['frequency-penalty'] ? Number(args['frequency-penalty']) : undefined,
    presencePenalty: args['presence-penalty'] ? Number(args['presence-penalty']) : undefined,
    stop: args.stop as string[] | undefined,
    tools: args.tools as string | undefined,
    responseFormat: args['response-format'] as string | undefined,
    provider: args.provider as string | undefined,
    plugins: args.plugins as string | undefined,
  });

  const clientOpts = {
    path: '/chat/completions',
    method: 'POST' as const,
    auth: 'user' as const,
    apiKey,
    baseUrl,
    body,
    timeoutMs,
  };

  if (shouldStream) {
    // SIGINT: abort the stream gracefully
    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.once('SIGINT', onSigint);

    try {
      const response = await streamRequest({ ...clientOpts, signal: controller.signal });
      await runStream(response, { format: streamFormat, noColor, signal: controller.signal });
    } finally {
      process.removeListener('SIGINT', onSigint);
    }
  } else {
    const result = await request<ChatCompletionResponse>(clientOpts);
    render(
      {
        data: result.data,
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

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

const sendCommand = defineCommand({
  meta: { description: 'Send a chat message and stream the response' },
  args: sendArgs,
  async run({ args }) {
    await handleSend(args as Record<string, unknown>);
  },
});

// `completion` is an alias for `send` — same handler, same args
const completionCommand = defineCommand({
  meta: { description: 'Alias for `chat send`' },
  args: sendArgs,
  async run({ args }) {
    await handleSend(args as Record<string, unknown>);
  },
});

export default defineCommand({
  meta: { description: 'Chat with AI models via OpenRouter' },
  subCommands: {
    send: sendCommand,
    completion: completionCommand,
  },
});
