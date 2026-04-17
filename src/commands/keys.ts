/**
 * `openrouter keys` sub-command group — management key CRUD.
 * Verbs: list | create | get | update | delete
 * All verbs require a management key (exit 64 with hint if missing).
 * `delete` is gated behind TTY confirmation or --force.
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
import { confirmDestructive } from '../lib/ui/confirm.ts';

// Shared args across all key sub-commands
const sharedArgs = {
  output: { type: 'string' as const, description: 'Output format: pretty|json|ndjson', alias: 'o' },
  json: { type: 'boolean' as const, description: 'Alias for --output json', default: false },
  'no-color': { type: 'boolean' as const, description: 'Disable ANSI color', default: false },
  'management-key': { type: 'string' as const, description: 'OpenRouter management key' },
  'base-url': { type: 'string' as const, description: 'API base URL' },
  config: { type: 'string' as const, description: 'Path to TOML config file', alias: 'c' },
} as const;

function resolveMgmtDeps(args: Record<string, unknown>) {
  const resolverCtx = buildResolverContext({ config: args.config as string | undefined });
  const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
  const mgmtKey = resolveManagementKey(args['management-key'] as string | undefined, deps).value;
  if (!mgmtKey) {
    throw new CliError(
      'no_key',
      'Management key required for key operations',
      'Set OPENROUTER_MANAGEMENT_KEY or pass --management-key <key>',
    );
  }
  const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;
  const format = resolveOutputMode(
    (args.json as boolean) ? 'json' : (args.output as string | undefined),
  );
  return { mgmtKey, baseUrl, format };
}

// Column defs for the keys table
const KEY_COLUMNS = [
  { key: 'id', header: 'ID', width: 16 },
  { key: 'name', header: 'Name', width: 20 },
  { key: 'usage', header: 'Usage', width: 10 },
  { key: 'limit', header: 'Limit', width: 10 },
  { key: 'expires_at', header: 'Expires At', width: 22 },
  { key: 'created_at', header: 'Created At', width: 22 },
];

/** Normalize a row for table display — replace null/undefined with '-'. */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of KEY_COLUMNS) {
    const v = row[col.key];
    out[col.key] = v === null || v === undefined ? '-' : v;
  }
  return out;
}

// ---- list ----------------------------------------------------------------

const listCommand = defineCommand({
  meta: { description: 'List all API keys (requires management key)' },
  args: { ...sharedArgs },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const result = await request<{ data: Array<Record<string, unknown>> }>({
      path: '/keys',
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
    render({ data: rows.map(normalizeRow), meta: {} }, { format: 'table', columns: KEY_COLUMNS });
  },
});

// ---- create --------------------------------------------------------------

const createCommand = defineCommand({
  meta: { description: 'Create a new API key (shows secret once)' },
  args: {
    ...sharedArgs,
    name: { type: 'string' as const, description: 'Key name', required: true },
    'expires-at': { type: 'string' as const, description: 'ISO expiry timestamp' },
    limit: { type: 'string' as const, description: 'Credit limit (number)' },
    'limit-reset': { type: 'string' as const, description: 'Reset period: daily|weekly|monthly' },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const body: Record<string, unknown> = { name: args.name };
    if (args['expires-at']) body.expires_at = args['expires-at'];
    if (args.limit) body.limit = Number(args.limit);
    if (args['limit-reset']) body.limit_reset = args['limit-reset'];

    const result = await request<Record<string, unknown>>({
      path: '/keys',
      method: 'POST',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
      body,
    });

    // Warn user to save key — only shown once
    process.stderr.write('\u26A0  Store this key now \u2014 it will not be shown again.\n');

    if (format === 'json' || format === 'ndjson') {
      render({ data: result.data, meta: {} }, { format });
      return;
    }
    process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
  },
});

// ---- get -----------------------------------------------------------------

const getCommand = defineCommand({
  meta: { description: 'Get details for a specific API key' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Key ID', required: true },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const result = await request<Record<string, unknown>>({
      path: `/keys/${args.id}`,
      method: 'GET',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
    });
    if (format === 'json' || format === 'ndjson') {
      render({ data: result.data, meta: {} }, { format });
      return;
    }
    process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
  },
});

// ---- update --------------------------------------------------------------

const updateCommand = defineCommand({
  meta: { description: 'Update an API key (only provided fields are changed)' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Key ID', required: true },
    name: { type: 'string' as const, description: 'New key name' },
    limit: { type: 'string' as const, description: 'New credit limit' },
    'expires-at': { type: 'string' as const, description: 'New ISO expiry timestamp' },
    'limit-reset': { type: 'string' as const, description: 'Reset period: daily|weekly|monthly' },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const body: Record<string, unknown> = {};
    if (args.name !== undefined) body.name = args.name;
    if (args.limit !== undefined) body.limit = Number(args.limit);
    if (args['expires-at'] !== undefined) body.expires_at = args['expires-at'];
    if (args['limit-reset'] !== undefined) body.limit_reset = args['limit-reset'];

    const result = await request<Record<string, unknown>>({
      path: `/keys/${args.id}`,
      method: 'PATCH',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
      body,
    });
    if (format === 'json' || format === 'ndjson') {
      render({ data: result.data, meta: {} }, { format });
      return;
    }
    process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
  },
});

// ---- delete --------------------------------------------------------------

const deleteCommand = defineCommand({
  meta: { description: 'Delete an API key (prompts for confirmation unless --force)' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Key ID', required: true },
    force: { type: 'boolean' as const, description: 'Skip confirmation prompt', default: false },
    'non-interactive': {
      type: 'boolean' as const,
      description: 'Non-interactive mode',
      default: false,
    },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl } = resolveMgmtDeps(args as Record<string, unknown>);
    const confirmed = await confirmDestructive(`Delete key ${args.id}?`, {
      force: args.force as boolean,
      nonInteractive: args['non-interactive'] as boolean,
    });
    if (!confirmed) {
      process.stderr.write('Aborted.\n');
      return;
    }
    await request<unknown>({
      path: `/keys/${args.id}`,
      method: 'DELETE',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
    });
    process.stdout.write(`Key ${args.id} deleted.\n`);
  },
});

// ---- export --------------------------------------------------------------

export default defineCommand({
  meta: { description: 'Manage API keys (requires management key)' },
  subCommands: {
    list: listCommand,
    create: createCommand,
    get: getCommand,
    update: updateCommand,
    delete: deleteCommand,
  },
});
