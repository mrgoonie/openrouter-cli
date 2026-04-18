/**
 * `openrouter providers` sub-command group.
 * Verbs: list
 *
 * list — GET /providers (auth: user); pretty table or JSON envelope
 */

import { defineCommand } from 'citty';
import { request } from '../lib/client/client.ts';
import { buildResolverContext, resolveApiKey, resolveBaseUrl } from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { render } from '../lib/output/renderer.ts';
import { renderTable } from '../lib/output/table.ts';
import { resolveOutputMode } from '../lib/output/tty.ts';
import { ProviderListSchema } from '../lib/types/openrouter.ts';

const listCommand = defineCommand({
  meta: { description: 'List all OpenRouter providers' },
  args: {
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

    const result = await request<unknown>({
      path: '/providers',
      method: 'GET',
      auth: 'user',
      apiKey,
      baseUrl,
    });

    const parsed = ProviderListSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new CliError(
        'invalid_response',
        'Unexpected /providers response',
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

    // Pretty: table
    const rows = parsed.data.data.map((p) => ({
      slug: p.slug ?? '-',
      name: p.name ?? '-',
      status: p.status ?? '-',
      models_count: p.models_count ?? '-',
    }));

    process.stdout.write(
      `${renderTable(rows, [
        { key: 'slug', header: 'Slug', width: 24 },
        { key: 'name', header: 'Name', width: 28 },
        { key: 'status', header: 'Status', width: 12 },
        { key: 'models_count', header: 'Models', width: 8 },
      ])}\n`,
    );
  },
});

export default defineCommand({
  meta: { description: 'Browse OpenRouter inference providers' },
  subCommands: {
    list: listCommand,
  },
});
