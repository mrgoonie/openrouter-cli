/**
 * `openrouter analytics` sub-command group — usage analytics.
 * Verbs: activity
 * Requires a management key (exit 64 with hint if missing).
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

const ACTIVITY_COLUMNS = [
  { key: 'endpoint', header: 'Endpoint', width: 30 },
  { key: 'requests', header: 'Requests', width: 12 },
  { key: 'tokens', header: 'Tokens', width: 14 },
  { key: 'cost', header: 'Cost ($)', width: 12 },
];

const activityCommand = defineCommand({
  meta: { description: 'View API activity analytics (requires management key)' },
  args: {
    output: {
      type: 'string' as const,
      description: 'Output format: pretty|json|ndjson|table',
      alias: 'o',
    },
    json: { type: 'boolean' as const, description: 'Alias for --output json', default: false },
    'no-color': { type: 'boolean' as const, description: 'Disable ANSI color', default: false },
    'management-key': { type: 'string' as const, description: 'OpenRouter management key' },
    'base-url': { type: 'string' as const, description: 'API base URL' },
    config: { type: 'string' as const, description: 'Path to TOML config file', alias: 'c' },
    date: { type: 'string' as const, description: 'Filter by date (YYYY-MM-DD)' },
    'key-hash': { type: 'string' as const, description: 'Filter by API key hash' },
    user: { type: 'string' as const, description: 'Filter by user ID' },
  },
  async run({ args }) {
    const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
    const mgmtKey = resolveManagementKey(args['management-key'] as string | undefined, deps).value;
    if (!mgmtKey) {
      throw new CliError(
        'no_key',
        'Management key required for analytics',
        'Set OPENROUTER_MANAGEMENT_KEY or pass --management-key <key>',
      );
    }
    const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;
    const format = resolveOutputMode(
      (args.json as boolean) ? 'json' : (args.output as string | undefined),
    );

    // Build query params — only include defined values
    const query: Record<string, string> = {};
    if (args.date) query.date = args.date as string;
    if (args['key-hash']) query.key_hash = args['key-hash'] as string;
    if (args.user) query.user = args.user as string;

    const result = await request<{ data: Array<Record<string, unknown>> }>({
      path: '/activity',
      method: 'GET',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
      query,
    });

    const rows = Array.isArray(result.data?.data) ? result.data.data : [];

    if (format === 'json' || format === 'ndjson') {
      render({ data: rows, meta: {} }, { format });
      return;
    }

    // Group by endpoint: aggregate requests, tokens, cost
    const grouped = new Map<string, { requests: number; tokens: number; cost: number }>();
    for (const row of rows) {
      const endpoint = typeof row.endpoint === 'string' ? row.endpoint : 'unknown';
      const existing = grouped.get(endpoint) ?? { requests: 0, tokens: 0, cost: 0 };
      existing.requests += typeof row.requests === 'number' ? row.requests : 0;
      existing.tokens += typeof row.tokens === 'number' ? row.tokens : 0;
      existing.cost += typeof row.cost === 'number' ? row.cost : 0;
      grouped.set(endpoint, existing);
    }

    const tableRows = Array.from(grouped.entries()).map(([endpoint, agg]) => ({
      endpoint,
      requests: agg.requests,
      tokens: agg.tokens,
      cost: agg.cost.toFixed(6),
    }));

    if (tableRows.length === 0) {
      process.stdout.write('No activity data found.\n');
      return;
    }

    render({ data: tableRows, meta: {} }, { format: 'table', columns: ACTIVITY_COLUMNS });
  },
});

export default defineCommand({
  meta: { description: 'View usage analytics (requires management key)' },
  subCommands: {
    activity: activityCommand,
  },
});
