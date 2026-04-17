/**
 * `openrouter generations` sub-command group.
 * Verbs: get, cost
 *
 * get <id>  — GET /generation?id=<id>; pretty detail card or JSON envelope
 * cost <id> — same call; prints only `data.total_cost` + newline (pipe-safe)
 */

import { defineCommand } from 'citty';
import { request } from '../lib/client/client.ts';
import { buildResolverContext, resolveApiKey, resolveBaseUrl } from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { render } from '../lib/output/renderer.ts';
import { resolveOutputMode } from '../lib/output/tty.ts';
import { GenerationDetailSchema } from '../lib/types/openrouter.ts';

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
// Shared fetch helper
// ---------------------------------------------------------------------------

async function fetchGeneration(id: string, args: Record<string, unknown>) {
  const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
  const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
  const apiKey = resolveApiKey(args['api-key'] as string | undefined, deps).value;
  const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;

  const result = await request<unknown>({
    path: '/generation',
    method: 'GET',
    auth: 'user',
    apiKey,
    baseUrl,
    query: { id },
  });

  const parsed = GenerationDetailSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new CliError('invalid_response', 'Unexpected /generation response', parsed.error.message);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// get <id>
// ---------------------------------------------------------------------------

const getCommand = defineCommand({
  meta: { description: 'Get full metadata for a generation by ID' },
  args: {
    ...commonArgs,
    id: { type: 'positional' as const, description: 'Generation ID', required: true },
  },
  async run({ args }) {
    const detail = await fetchGeneration(args.id as string, args as Record<string, unknown>);
    const format = resolveOutputMode(
      (args.json as boolean) ? 'json' : (args.output as string | undefined),
    );
    const noColor = (args['no-color'] as boolean) ?? false;

    if (format === 'json' || format === 'ndjson') {
      render({ data: detail, meta: {} }, { format, noColor });
      return;
    }

    // Pretty: detail card
    const g = detail.data;
    const lines = [
      `id:                       ${g.id ?? '-'}`,
      `model:                    ${g.model ?? '-'}`,
      `total_cost:               ${g.total_cost ?? '-'}`,
      `tokens_prompt:            ${g.tokens_prompt ?? '-'}`,
      `tokens_completion:        ${g.tokens_completion ?? '-'}`,
      `native_tokens_prompt:     ${g.native_tokens_prompt ?? '-'}`,
      `native_tokens_completion: ${g.native_tokens_completion ?? '-'}`,
      `created_at:               ${g.created_at ?? '-'}`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
  },
});

// ---------------------------------------------------------------------------
// cost <id>  — pipe-safe: prints only the number + newline
// ---------------------------------------------------------------------------

const costCommand = defineCommand({
  meta: { description: 'Print only the total_cost number for a generation (pipe-safe)' },
  args: {
    'api-key': commonArgs['api-key'],
    'base-url': commonArgs['base-url'],
    config: commonArgs.config,
    id: { type: 'positional' as const, description: 'Generation ID', required: true },
  },
  async run({ args }) {
    const detail = await fetchGeneration(args.id as string, args as Record<string, unknown>);
    const cost = detail.data.total_cost;
    // Emit just the number (or 0 when absent) followed by a newline — pipe-safe.
    process.stdout.write(`${cost ?? 0}\n`);
  },
});

// ---------------------------------------------------------------------------
// Sub-router export
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: { description: 'Look up generation metadata and costs' },
  subCommands: {
    get: getCommand,
    cost: costCommand,
  },
});
