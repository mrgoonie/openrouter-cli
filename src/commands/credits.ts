/**
 * `openrouter credits` sub-command group.
 * Verbs: show
 *
 * show — GET /credits (auth: mgmt key required)
 *        Prints purchased / used / remaining in pretty mode; JSON envelope otherwise.
 *        Exits 64 with a helpful hint when the management key is absent.
 */

import { defineCommand } from 'citty';
import { request } from '../lib/client/client.ts';
import {
  buildResolverContext,
  resolveBaseUrl,
  resolveManagementKey,
} from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { render } from '../lib/output/renderer.ts';
import { resolveOutputMode } from '../lib/output/tty.ts';
import { CreditsResponseSchema } from '../lib/types/openrouter.ts';

const showCommand = defineCommand({
  meta: { description: 'Show account credit balance (requires management key)' },
  args: {
    output: {
      type: 'string' as const,
      description: 'Output format: pretty | json | ndjson',
      alias: 'o',
    },
    json: { type: 'boolean' as const, description: 'Alias for --output json', default: false },
    'no-color': { type: 'boolean' as const, description: 'Disable ANSI color', default: false },
    'management-key': { type: 'string' as const, description: 'OpenRouter management key' },
    'base-url': { type: 'string' as const, description: 'API base URL' },
    config: { type: 'string' as const, description: 'Path to TOML config file', alias: 'c' },
  },
  async run({ args }) {
    const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };

    const mgmtKey = resolveManagementKey(args['management-key'] as string | undefined, deps).value;

    if (!mgmtKey) {
      throw new CliError(
        'no_key',
        'Management key required to view credits',
        'Set OPENROUTER_MANAGEMENT_KEY or run: openrouter auth set-key <key> --management',
      );
    }

    const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;

    const result = await request<unknown>({
      path: '/credits',
      method: 'GET',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
    });

    const parsed = CreditsResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new CliError('invalid_response', 'Unexpected /credits response', parsed.error.message);
    }

    const { total_credits, total_usage } = parsed.data.data;
    const remaining = total_credits - total_usage;

    const format = resolveOutputMode(
      (args.json as boolean) ? 'json' : (args.output as string | undefined),
    );
    const noColor = (args['no-color'] as boolean) ?? false;

    if (format === 'json' || format === 'ndjson') {
      render({ data: { total_credits, total_usage, remaining }, meta: {} }, { format, noColor });
      return;
    }

    // Pretty: single-line summary
    const fmt = (n: number) => `$${n.toFixed(4)}`;
    process.stdout.write(
      `purchased: ${fmt(total_credits)}  used: ${fmt(total_usage)}  remaining: ${fmt(remaining)}\n`,
    );
  },
});

export default defineCommand({
  meta: { description: 'View account credit balance' },
  subCommands: {
    show: showCommand,
  },
});
