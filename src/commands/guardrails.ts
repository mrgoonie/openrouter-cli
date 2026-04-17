/**
 * `openrouter guardrails` sub-command group — guardrail CRUD + assignment.
 * Verbs: list | create | get | update | delete | assign-keys | assign-members | assignments
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
      'Management key required for guardrail operations',
      'Set OPENROUTER_MANAGEMENT_KEY or pass --management-key <key>',
    );
  }
  const baseUrl = resolveBaseUrl(args['base-url'] as string | undefined, deps).value;
  const format = resolveOutputMode(
    (args.json as boolean) ? 'json' : (args.output as string | undefined),
  );
  return { mgmtKey, baseUrl, format };
}

function printResult(data: unknown, format: ReturnType<typeof resolveOutputMode>) {
  if (format === 'json' || format === 'ndjson') {
    render({ data, meta: {} }, { format });
    return;
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

// ---- list ----------------------------------------------------------------

const listCommand = defineCommand({
  meta: { description: 'List all guardrails' },
  args: { ...sharedArgs },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const result = await request<unknown>({
      path: '/guardrails',
      method: 'GET',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
    });
    printResult(result.data, format);
  },
});

// ---- create --------------------------------------------------------------

const createCommand = defineCommand({
  meta: { description: 'Create a guardrail from a JSON file' },
  args: {
    ...sharedArgs,
    'from-file': {
      type: 'string' as const,
      description: 'Path to JSON file with guardrail definition',
      required: true,
    },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const filePath = args['from-file'] as string;
    let body: unknown;
    try {
      body = await Bun.file(filePath).json();
    } catch (err) {
      throw new CliError(
        'usage',
        `Failed to read guardrail file: ${filePath}`,
        err instanceof Error ? err.message : String(err),
      );
    }
    const result = await request<unknown>({
      path: '/guardrails',
      method: 'POST',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
      body,
    });
    printResult(result.data, format);
  },
});

// ---- get -----------------------------------------------------------------

const getCommand = defineCommand({
  meta: { description: 'Get a guardrail by ID' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Guardrail ID', required: true },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const result = await request<unknown>({
      path: `/guardrails/${args.id}`,
      method: 'GET',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
    });
    printResult(result.data, format);
  },
});

// ---- update --------------------------------------------------------------

const updateCommand = defineCommand({
  meta: { description: 'Update a guardrail from a JSON file' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Guardrail ID', required: true },
    'from-file': {
      type: 'string' as const,
      description: 'Path to JSON file with updated guardrail definition',
      required: true,
    },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const filePath = args['from-file'] as string;
    let body: unknown;
    try {
      body = await Bun.file(filePath).json();
    } catch (err) {
      throw new CliError(
        'usage',
        `Failed to read guardrail file: ${filePath}`,
        err instanceof Error ? err.message : String(err),
      );
    }
    const result = await request<unknown>({
      path: `/guardrails/${args.id}`,
      method: 'PUT',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
      body,
    });
    printResult(result.data, format);
  },
});

// ---- delete --------------------------------------------------------------

const deleteCommand = defineCommand({
  meta: { description: 'Delete a guardrail (prompts for confirmation unless --force)' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Guardrail ID', required: true },
    force: { type: 'boolean' as const, description: 'Skip confirmation prompt', default: false },
    'non-interactive': {
      type: 'boolean' as const,
      description: 'Non-interactive mode',
      default: false,
    },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl } = resolveMgmtDeps(args as Record<string, unknown>);
    const confirmed = await confirmDestructive(`Delete guardrail ${args.id}?`, {
      force: args.force as boolean,
      nonInteractive: args['non-interactive'] as boolean,
    });
    if (!confirmed) {
      process.stderr.write('Aborted.\n');
      return;
    }
    await request<unknown>({
      path: `/guardrails/${args.id}`,
      method: 'DELETE',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
    });
    process.stdout.write(`Guardrail ${args.id} deleted.\n`);
  },
});

// ---- assign-keys ---------------------------------------------------------

const assignKeysCommand = defineCommand({
  meta: { description: 'Assign API keys to a guardrail' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Guardrail ID', required: true },
    keys: {
      type: 'string' as const,
      description: 'Comma-separated list of key IDs to assign',
      required: true,
    },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const keyIds = (args.keys as string)
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const result = await request<unknown>({
      path: `/guardrails/${args.id}/keys/assign`,
      method: 'POST',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
      body: { key_ids: keyIds },
    });
    printResult(result.data, format);
  },
});

// ---- assign-members ------------------------------------------------------

const assignMembersCommand = defineCommand({
  meta: { description: 'Assign org members to a guardrail' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Guardrail ID', required: true },
    users: {
      type: 'string' as const,
      description: 'Comma-separated list of user IDs to assign',
      required: true,
    },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const userIds = (args.users as string)
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const result = await request<unknown>({
      path: `/guardrails/${args.id}/members/assign`,
      method: 'POST',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
      body: { user_ids: userIds },
    });
    printResult(result.data, format);
  },
});

// ---- assignments ---------------------------------------------------------

const assignmentsCommand = defineCommand({
  meta: { description: 'List member assignments for a guardrail' },
  args: {
    ...sharedArgs,
    id: { type: 'positional' as const, description: 'Guardrail ID', required: true },
  },
  async run({ args }) {
    const { mgmtKey, baseUrl, format } = resolveMgmtDeps(args as Record<string, unknown>);
    const result = await request<unknown>({
      path: `/guardrails/${args.id}/member-assignments`,
      method: 'GET',
      auth: 'mgmt',
      apiKey: mgmtKey,
      baseUrl,
    });
    printResult(result.data, format);
  },
});

// ---- export --------------------------------------------------------------

export default defineCommand({
  meta: { description: 'Manage guardrails (requires management key)' },
  subCommands: {
    list: listCommand,
    create: createCommand,
    get: getCommand,
    update: updateCommand,
    delete: deleteCommand,
    'assign-keys': assignKeysCommand,
    'assign-members': assignMembersCommand,
    assignments: assignmentsCommand,
  },
});
