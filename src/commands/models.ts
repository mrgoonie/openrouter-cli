/**
 * `openrouter models` sub-command group.
 * Verbs: list, get, endpoints
 *
 * list      — GET /models with optional filter flags; results cached 60 s per session
 * get <id>  — fetch model list and find by id; pretty detail card or JSON envelope
 * endpoints — GET /models/{author}/{slug}/endpoints; table of provider endpoints
 */

import { defineCommand } from 'citty';
import { MemoryCache } from '../lib/cache/memory-cache.ts';
import { request } from '../lib/client/client.ts';
import { buildResolverContext, resolveApiKey, resolveBaseUrl } from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { render } from '../lib/output/renderer.ts';
import { renderTable } from '../lib/output/table.ts';
import { resolveOutputMode } from '../lib/output/tty.ts';
import {
  type Model,
  ModelEndpointsResponseSchema,
  ModelListResponseSchema,
} from '../lib/types/openrouter.ts';

// One cache instance per process (reset when CLI exits).
const modelsCache = new MemoryCache();
const MODELS_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Shared args
// ---------------------------------------------------------------------------

const commonArgs = {
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
};

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

const listCommand = defineCommand({
  meta: { description: 'List available models' },
  args: {
    ...commonArgs,
    category: { type: 'string' as const, description: 'Filter by category' },
    'supported-parameters': {
      type: 'string' as const,
      description: 'Comma-separated list of supported parameters to filter by',
    },
    'output-modalities': {
      type: 'string' as const,
      description: 'Comma-separated list of output modalities to filter by',
    },
  },
  async run({ args }) {
    const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
    const apiKey = resolveApiKey(args['api-key'] as string | undefined, deps).value;
    const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;

    const query: Record<string, string | undefined> = {
      category: args.category as string | undefined,
      supported_parameters: args['supported-parameters'] as string | undefined,
      output_modalities: args['output-modalities'] as string | undefined,
    };
    // Build a stable cache key from non-undefined query params
    const cacheKey = `models:${JSON.stringify(query)}`;

    const raw = await modelsCache.getOrSet(cacheKey, MODELS_TTL_MS, () =>
      request<unknown>({
        path: '/models',
        method: 'GET',
        auth: 'user',
        apiKey,
        baseUrl,
        query: query as Record<string, string | undefined>,
      }).then((r) => r.data),
    );

    const parsed = ModelListResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new CliError('invalid_response', 'Unexpected /models response', parsed.error.message);
    }

    const format = resolveOutputMode(
      (args.json as boolean) ? 'json' : (args.output as string | undefined),
    );
    const noColor = (args['no-color'] as boolean) ?? false;

    if (format === 'json' || format === 'ndjson') {
      render({ data: parsed.data, meta: {} }, { format, noColor });
      return;
    }

    // Pretty: table
    const rows = parsed.data.data.map((m) => ({
      id: m.id,
      context_length: m.context_length ?? '-',
      prompt_price: m.pricing?.prompt ?? '-',
      completion_price: m.pricing?.completion ?? '-',
      top_provider: (m.top_provider as Record<string, unknown> & { name?: string })?.name ?? '-',
    }));

    process.stdout.write(
      `${renderTable(rows, [
        { key: 'id', header: 'ID', width: 42 },
        { key: 'context_length', header: 'Context', width: 10 },
        { key: 'prompt_price', header: 'Input $/1k', width: 12 },
        { key: 'completion_price', header: 'Output $/1k', width: 13 },
        { key: 'top_provider', header: 'Top Provider', width: 18 },
      ])}\n`,
    );
  },
});

// ---------------------------------------------------------------------------
// get <id>
// ---------------------------------------------------------------------------

const getCommand = defineCommand({
  meta: { description: 'Get details for a single model by ID' },
  args: {
    ...commonArgs,
    id: { type: 'positional' as const, description: 'Model ID', required: true },
  },
  async run({ args }) {
    const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
    const apiKey = resolveApiKey(args['api-key'] as string | undefined, deps).value;
    const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;

    const raw = await modelsCache.getOrSet('models:{}', MODELS_TTL_MS, () =>
      request<unknown>({
        path: '/models',
        method: 'GET',
        auth: 'user',
        apiKey,
        baseUrl,
      }).then((r) => r.data),
    );

    const parsed = ModelListResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new CliError('invalid_response', 'Unexpected /models response', parsed.error.message);
    }

    const model: Model | undefined = parsed.data.data.find((m) => m.id === args.id);
    if (!model) {
      throw new CliError(
        'not_found',
        `Model '${args.id}' not found`,
        'Run `openrouter models list` to see available models',
      );
    }

    const format = resolveOutputMode(
      (args.json as boolean) ? 'json' : (args.output as string | undefined),
    );
    const noColor = (args['no-color'] as boolean) ?? false;

    if (format === 'json' || format === 'ndjson') {
      render({ data: model, meta: {} }, { format, noColor });
      return;
    }

    // Pretty: detail card
    const lines = [
      `id:               ${model.id}`,
      `name:             ${model.name ?? '-'}`,
      `context_length:   ${model.context_length ?? '-'}`,
      `prompt_price:     ${model.pricing?.prompt ?? '-'}`,
      `completion_price: ${model.pricing?.completion ?? '-'}`,
      `modality:         ${model.architecture?.modality ?? '-'}`,
      `tokenizer:        ${model.architecture?.tokenizer ?? '-'}`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
  },
});

// ---------------------------------------------------------------------------
// endpoints <author/slug>
// ---------------------------------------------------------------------------

const SLUG_RE = /^[\w.-]+\/[\w.-]+$/;

const endpointsCommand = defineCommand({
  meta: { description: 'List provider endpoints for a model (format: author/slug)' },
  args: {
    ...commonArgs,
    slug: {
      type: 'positional' as const,
      description: 'Model slug in author/slug format',
      required: true,
    },
  },
  async run({ args }) {
    const slug = args.slug as string;
    if (!SLUG_RE.test(slug)) {
      throw new CliError(
        'usage',
        `Invalid model slug '${slug}'`,
        'Expected format: author/slug (e.g. anthropic/claude-opus-4)',
      );
    }

    const [author, name] = slug.split('/');
    const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
    const apiKey = resolveApiKey(args['api-key'] as string | undefined, deps).value;
    const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;

    const result = await request<unknown>({
      path: `/models/${author}/${name}/endpoints`,
      method: 'GET',
      auth: 'user',
      apiKey,
      baseUrl,
    });

    const parsed = ModelEndpointsResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new CliError(
        'invalid_response',
        'Unexpected /models/.../endpoints response',
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

    const endpoints = parsed.data.data.endpoints ?? [];
    if (endpoints.length === 0) {
      process.stdout.write('No endpoints found.\n');
      return;
    }

    const rows = endpoints.map((ep) => ({
      provider: ep.name ?? '-',
      context_length: ep.context_length ?? '-',
      prompt_price: ep.pricing?.prompt ?? '-',
      completion_price: ep.pricing?.completion ?? '-',
      uptime: ep.uptime_last_30d != null ? `${(ep.uptime_last_30d * 100).toFixed(1)}%` : '-',
    }));

    process.stdout.write(
      `${renderTable(rows, [
        { key: 'provider', header: 'Provider', width: 30 },
        { key: 'context_length', header: 'Context', width: 10 },
        { key: 'prompt_price', header: 'Input $/1k', width: 12 },
        { key: 'completion_price', header: 'Output $/1k', width: 13 },
        { key: 'uptime', header: 'Uptime 30d', width: 12 },
      ])}\n`,
    );
  },
});

// ---------------------------------------------------------------------------
// Sub-router export
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: { description: 'Browse and inspect OpenRouter models' },
  subCommands: {
    list: listCommand,
    get: getCommand,
    endpoints: endpointsCommand,
  },
});
