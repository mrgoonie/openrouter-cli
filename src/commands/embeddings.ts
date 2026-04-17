/**
 * `openrouter embeddings` sub-command group.
 * Verbs: create
 *
 * create — POST /embeddings (auth: user)
 *   Input: --input <text> | --input-file <path> | stdin (piped)
 *   --input-file: one embedding input per line (batch mode)
 *   Pretty: "N × D vectors · cost $X.XXXX" summary; --show-vectors to print raw
 *   JSON: full API response passthrough
 */

import { defineCommand } from 'citty';
import { request } from '../lib/client/client.ts';
import { buildResolverContext, resolveApiKey, resolveBaseUrl } from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { readInputArg, readLinesFromSource, refuseLarge } from '../lib/io/input-reader.ts';
import { render } from '../lib/output/renderer.ts';
import { resolveOutputMode } from '../lib/output/tty.ts';
import { EmbeddingResponseSchema } from '../lib/types/openrouter.ts';

const MAX_INPUT_BYTES = 10_000_000; // 10 MB

const createCommand = defineCommand({
  meta: { description: 'Create embeddings for one or more inputs' },
  args: {
    model: { type: 'string' as const, description: 'Embedding model ID', required: true },
    input: { type: 'string' as const, description: 'Inline text input' },
    'input-file': {
      type: 'string' as const,
      description: 'File path — one input per line for batch mode',
    },
    dimensions: { type: 'string' as const, description: 'Output vector dimensions' },
    'encoding-format': {
      type: 'string' as const,
      description: 'Encoding format: float | base64',
    },
    'input-type': { type: 'string' as const, description: 'Input type hint for the model' },
    provider: { type: 'string' as const, description: 'Path to provider JSON config' },
    'show-vectors': {
      type: 'boolean' as const,
      description: 'Print raw embedding vectors (may be large)',
      default: false,
    },
    'allow-large': {
      type: 'boolean' as const,
      description: 'Skip the 10 MB input size guard',
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
  },
  async run({ args }) {
    const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
    const apiKey = resolveApiKey(args['api-key'] as string | undefined, deps).value;
    const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;

    const inputFile = args['input-file'] as string | undefined;
    const inlineInput = args.input as string | undefined;
    const allowLarge = (args['allow-large'] as boolean) ?? false;

    // Collect input — batch (input-file) or single (inline/stdin)
    let embeddingInput: string | string[];

    if (inputFile !== undefined) {
      const fileText = await readInputArg(inputFile, false);
      const lines = readLinesFromSource(fileText);
      refuseLarge(fileText, MAX_INPUT_BYTES, allowLarge);
      embeddingInput = lines.length === 1 ? (lines[0] ?? '') : lines;
    } else if (inlineInput !== undefined) {
      refuseLarge(inlineInput, MAX_INPUT_BYTES, allowLarge);
      embeddingInput = inlineInput;
    } else if (!process.stdin.isTTY) {
      const stdinText = await readInputArg(undefined, true);
      refuseLarge(stdinText, MAX_INPUT_BYTES, allowLarge);
      embeddingInput = stdinText.trimEnd();
    } else {
      throw new CliError(
        'usage',
        'No input provided',
        'Pass --input <text>, --input-file <path>, or pipe text via stdin',
      );
    }

    // Optional provider config passthrough
    let providerConfig: unknown;
    if (args.provider) {
      providerConfig = await Bun.file(args.provider as string).json();
    }

    // Build request body
    const encodingFormat = args['encoding-format'] as 'float' | 'base64' | undefined;
    if (encodingFormat !== undefined && encodingFormat !== 'float' && encodingFormat !== 'base64') {
      throw new CliError(
        'usage',
        `Invalid --encoding-format: ${encodingFormat}`,
        'Use float or base64',
      );
    }

    const body: Record<string, unknown> = {
      model: args.model as string,
      input: embeddingInput,
    };
    const dims = args.dimensions !== undefined ? Number(args.dimensions) : undefined;
    if (dims !== undefined) body.dimensions = dims;
    if (encodingFormat !== undefined) body.encoding_format = encodingFormat;
    if (args['input-type']) body.input_type = args['input-type'] as string;
    if (providerConfig !== undefined) body.provider = providerConfig;

    const result = await request<unknown>({
      path: '/embeddings',
      method: 'POST',
      auth: 'user',
      apiKey,
      baseUrl,
      body,
    });

    const parsed = EmbeddingResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new CliError(
        'invalid_response',
        'Unexpected /embeddings response',
        parsed.error.message,
      );
    }

    const format = resolveOutputMode(
      (args.json as boolean) ? 'json' : (args.output as string | undefined),
    );
    const noColor = (args['no-color'] as boolean) ?? false;

    if (format === 'json' || format === 'ndjson') {
      render({ data: parsed.data, meta: {} }, { format, noColor });
      return;
    }

    // Pretty mode: compact summary
    const { data: vectors, usage, model: respModel } = parsed.data;
    const n = vectors.length;
    const firstEmbedding = vectors[0]?.embedding;
    const d = Array.isArray(firstEmbedding) ? firstEmbedding.length : null;
    const dimPart = d !== null ? ` × ${d}` : '';
    const costPart = usage.cost !== undefined ? ` · cost $${usage.cost.toFixed(4)}` : '';
    process.stdout.write(`${n}${dimPart} vectors · model ${respModel}${costPart}\n`);

    if (args['show-vectors'] as boolean) {
      process.stdout.write(`${JSON.stringify(vectors, null, 2)}\n`);
    }
  },
});

export default defineCommand({
  meta: { description: 'Generate vector embeddings' },
  subCommands: {
    create: createCommand,
  },
});
