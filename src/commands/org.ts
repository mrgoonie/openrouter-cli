/**
 * `openrouter org` sub-command group — organization management.
 * Verbs: members
 * All verbs require a management key (exit 64 with hint if missing).
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

const ORG_MEMBER_COLUMNS = [
  { key: 'id', header: 'ID', width: 20 },
  { key: 'email', header: 'Email', width: 28 },
  { key: 'name', header: 'Name', width: 20 },
  { key: 'role', header: 'Role', width: 12 },
  { key: 'joined_at', header: 'Joined At', width: 22 },
];

const membersCommand = defineCommand({
  meta: { description: 'List organization members (requires management key)' },
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
  },
  async run({ args }) {
    const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
    const mgmtKey = resolveManagementKey(args['management-key'] as string | undefined, deps).value;
    if (!mgmtKey) {
      throw new CliError(
        'no_key',
        'Management key required for org operations',
        'Set OPENROUTER_MANAGEMENT_KEY or pass --management-key <key>',
      );
    }
    const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;
    const format = resolveOutputMode(
      (args.json as boolean) ? 'json' : (args.output as string | undefined),
    );

    const result = await request<{ data: Array<Record<string, unknown>> }>({
      path: '/organization/members',
      method: 'GET',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
    });

    const rows = Array.isArray(result.data?.data) ? result.data.data : [];

    if (format === 'json' || format === 'ndjson') {
      render({ data: rows, meta: {} }, { format });
      return;
    }

    // Normalize null/undefined to '-' for pretty table display
    const normalized = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of ORG_MEMBER_COLUMNS) {
        const v = row[col.key];
        out[col.key] = v === null || v === undefined ? '-' : v;
      }
      return out;
    });

    render({ data: normalized, meta: {} }, { format: 'table', columns: ORG_MEMBER_COLUMNS });
  },
});

export default defineCommand({
  meta: { description: 'Manage organization settings and members' },
  subCommands: {
    members: membersCommand,
  },
});
