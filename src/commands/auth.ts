/**
 * `openrouter auth` sub-command group.
 * Verbs: login, logout, status, whoami, set-key
 *
 * login  — OAuth PKCE flow → persists API key
 * logout — removes stored keys from config + keychain
 * status — shows resolved config values + sources (masked)
 * whoami — verifies credentials via a live API call
 * set-key — manually write a key without OAuth
 */

import { confirm } from '@clack/prompts';
import { defineCommand } from 'citty';
import { z } from 'zod';
import { maskKey } from '../lib/auth/mask-key.ts';
import { clearKey, loadPersistedKey, persistKey } from '../lib/auth/persist-key.ts';
import {
  buildResolverContext,
  resolveApiKey,
  resolveAppName,
  resolveBaseUrl,
  resolveManagementKey,
  resolveOutputMode,
  resolveSiteUrl,
  resolveTimeout,
} from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { startLoopback } from '../lib/oauth/loopback-server.ts';
import { openBrowser } from '../lib/oauth/open-browser.ts';
import { codeChallenge, generateCodeVerifier } from '../lib/oauth/pkce.ts';
import { render } from '../lib/output/renderer.ts';
import {
  isNonInteractive,
  resolveOutputMode as resolveOutputModeDisplay,
} from '../lib/output/tty.ts';

// ---------------------------------------------------------------------------
// Shared helper — resolve deps for commands that need API access
// ---------------------------------------------------------------------------

function getResolverDeps(configFlag?: string) {
  return buildResolverContext({ config: configFlag });
}

// ---------------------------------------------------------------------------
// Zod schema for POST /auth/keys response
// ---------------------------------------------------------------------------

const AuthKeysResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string().optional(),
    created_at: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

const loginCommand = defineCommand({
  meta: { description: 'Authenticate via OpenRouter OAuth (PKCE flow)' },
  args: {
    port: { type: 'string', description: 'Preferred loopback port (default: auto 8976–8999)' },
    'no-browser': {
      type: 'boolean',
      description: 'Print URL only, do not open browser',
      default: false,
    },
    'use-keychain': { type: 'boolean', description: 'Store key in OS keychain', default: false },
    force: {
      type: 'boolean',
      description: 'Overwrite existing key without prompting',
      default: false,
    },
  },
  async run({ args }) {
    const verifier = generateCodeVerifier();
    const challenge = await codeChallenge(verifier);

    const preferredPort = args.port ? Number(args.port) : undefined;
    const server = await startLoopback({ preferredPort });

    // Always register SIGINT handler to clean up server
    const onSigint = () => {
      server.stop();
      process.exit(130);
    };
    process.once('SIGINT', onSigint);

    const callbackUrl = `http://localhost:${server.port}`;
    const authUrl =
      `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}` +
      `&code_challenge=${challenge}&code_challenge_method=S256`;

    // Always print the URL to stderr so user can copy it
    console.error('\nOpenRouter authorization URL:');
    console.error(`  ${authUrl}\n`);

    if (!args['no-browser']) {
      await openBrowser(authUrl);
    }

    let code: string;

    if (isNonInteractive() || args['no-browser']) {
      // Non-interactive: read the full callback URL (with ?code=…) from stdin
      console.error('Paste the full callback URL (http://localhost:…?code=…):');
      const line = (await Bun.stdin.text()).trim();
      try {
        const parsed = new URL(line);
        const c = parsed.searchParams.get('code');
        if (!c) throw new Error('no code param');
        code = c;
      } catch {
        server.stop();
        process.removeListener('SIGINT', onSigint);
        throw new CliError(
          'usage',
          'Could not parse code from callback URL',
          'Ensure you pasted the full redirect URL including ?code=…',
        );
      }
    } else {
      try {
        code = await server.waitForCode(120_000);
      } catch (err) {
        server.stop();
        process.removeListener('SIGINT', onSigint);
        throw err;
      }
    }

    server.stop();
    process.removeListener('SIGINT', onSigint);

    // Exchange code for API key
    const resolverCtx = getResolverDeps();
    const baseUrlResolved = resolveBaseUrl(undefined, {
      dotenvMap: resolverCtx.dotenvMap,
      config: resolverCtx.config,
    });
    const baseUrl = baseUrlResolved.value ?? 'https://openrouter.ai/api/v1';

    const res = await fetch(`${baseUrl}/auth/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new CliError(
        'unauthorized',
        `Key exchange failed (HTTP ${res.status}): ${body}`,
        'Try running `openrouter auth login` again',
      );
    }

    const raw = await res.json();
    const parsed = AuthKeysResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new CliError(
        'invalid_response',
        'Unexpected response from /auth/keys',
        parsed.error.message,
      );
    }

    const { id: keyId, created_at } = parsed.data.data;
    const useKeychain = args['use-keychain'] || (resolverCtx.config.auth?.use_keychain ?? false);
    const { stored } = persistKey(keyId, { useKeychain, kind: 'api' });

    const outputMode = resolveOutputModeDisplay();
    render(
      {
        data: { key: maskKey(keyId), stored_in: stored, expires: created_at ?? null },
        meta: {},
      },
      { format: outputMode },
    );
  },
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

const logoutCommand = defineCommand({
  meta: { description: 'Remove stored API and management keys' },
  args: {
    force: { type: 'boolean', description: 'Skip confirmation prompt', default: false },
  },
  async run({ args }) {
    if (!args.force) {
      if (isNonInteractive()) {
        throw new CliError(
          'usage',
          'Cannot prompt in non-interactive mode',
          'Pass --force to skip confirmation',
        );
      }
      const confirmed = await confirm({ message: 'Remove all stored OpenRouter keys? [y/N]' });
      if (!confirmed || typeof confirmed !== 'boolean') {
        console.error('Aborted.');
        process.exit(0);
      }
    }

    clearKey({ kind: 'api' });
    clearKey({ kind: 'management' });

    const outputMode = resolveOutputModeDisplay();
    render({ data: { cleared: true }, meta: {} }, { format: outputMode });
  },
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

const statusCommand = defineCommand({
  meta: { description: 'Show resolved configuration values and their sources' },
  args: {},
  async run() {
    const resolverCtx = getResolverDeps();
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };

    const resolvedApiKey = resolveApiKey(undefined, deps);
    const resolvedMgmtKey = resolveManagementKey(undefined, deps);
    const resolvedBaseUrl = resolveBaseUrl(undefined, deps);
    const resolvedOutput = resolveOutputMode(undefined, deps);
    const resolvedSiteUrl = resolveSiteUrl(undefined, deps);
    const resolvedAppName = resolveAppName(undefined, deps);
    const resolvedTimeout = resolveTimeout(undefined, deps);

    const rows = [
      {
        name: 'api_key',
        source: resolvedApiKey.source,
        value: resolvedApiKey.value ? maskKey(resolvedApiKey.value) : '(unset)',
      },
      {
        name: 'management_key',
        source: resolvedMgmtKey.source,
        value: resolvedMgmtKey.value ? maskKey(resolvedMgmtKey.value) : '(unset)',
      },
      {
        name: 'base_url',
        source: resolvedBaseUrl.source,
        value: resolvedBaseUrl.value ?? '(unset)',
      },
      { name: 'output', source: resolvedOutput.source, value: resolvedOutput.value ?? '(unset)' },
      {
        name: 'site_url',
        source: resolvedSiteUrl.source,
        value: resolvedSiteUrl.value ?? '(unset)',
      },
      {
        name: 'app_name',
        source: resolvedAppName.source,
        value: resolvedAppName.value ?? '(unset)',
      },
      {
        name: 'timeout',
        source: resolvedTimeout.source,
        value: String(resolvedTimeout.value ?? '(unset)'),
      },
    ];

    const outputMode = resolveOutputModeDisplay();
    render({ data: rows, meta: {} }, { format: outputMode });
  },
});

// ---------------------------------------------------------------------------
// whoami
// ---------------------------------------------------------------------------

// Minimal zod schemas for the whoami API responses
const CreditsResponseSchema = z.object({
  data: z
    .object({
      total_credits: z.number().optional(),
      total_usage: z.number().optional(),
    })
    .passthrough(),
});

const whoamiCommand = defineCommand({
  meta: { description: 'Verify credentials with a live API call' },
  args: {},
  async run() {
    const resolverCtx = getResolverDeps();
    const deps = { dotenvMap: resolverCtx.dotenvMap, config: resolverCtx.config };
    const baseUrl = resolveBaseUrl(undefined, deps).value ?? 'https://openrouter.ai/api/v1';
    const mgmtKey = resolveManagementKey(undefined, deps).value;
    const userKey = resolveApiKey(undefined, deps).value;

    if (!mgmtKey && !userKey) {
      throw new CliError(
        'no_key',
        'Not authenticated',
        'Run `openrouter auth login` or set OPENROUTER_API_KEY',
      );
    }

    const outputMode = resolveOutputModeDisplay();

    // Try management key first → GET /credits
    if (mgmtKey) {
      try {
        const res = await fetch(`${baseUrl}/credits`, {
          headers: { Authorization: `Bearer ${mgmtKey}`, 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const raw = await res.json();
          const parsed = CreditsResponseSchema.safeParse(raw);
          const credits = parsed.success ? parsed.data.data : null;
          render(
            { data: { authenticated: true, auth_type: 'management', credits }, meta: {} },
            { format: outputMode },
          );
          return;
        }
        if (res.status !== 401) {
          throw new CliError('unauthorized', `GET /credits failed (HTTP ${res.status})`);
        }
        // 401 → fall through to user key
      } catch (err) {
        if (err instanceof CliError) throw err;
        // network error — fall through
      }
    }

    // Fallback: user key → GET /models (lightweight auth check)
    if (userKey) {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${userKey}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new CliError(
          'unauthorized',
          `Authentication failed (HTTP ${res.status})`,
          'Check your API key or run `openrouter auth login`',
        );
      }
      render(
        { data: { authenticated: true, auth_type: 'user', credits: null }, meta: {} },
        { format: outputMode },
      );
      return;
    }

    throw new CliError('no_key', 'Not authenticated', 'Run `openrouter auth login`');
  },
});

// ---------------------------------------------------------------------------
// set-key
// ---------------------------------------------------------------------------

const setKeyCommand = defineCommand({
  meta: { description: 'Manually store an API or management key without OAuth' },
  args: {
    key: { type: 'positional', description: 'The key to store', required: true },
    management: {
      type: 'boolean',
      description: 'Store as management key instead of API key',
      default: false,
    },
    'use-keychain': { type: 'boolean', description: 'Store in OS keychain', default: false },
  },
  async run({ args }) {
    const key = args.key;
    if (!key || key.trim() === '') {
      throw new CliError('usage', 'Key must not be empty');
    }

    if (!key.startsWith('sk-or-')) {
      console.error(
        '[warning] Key does not start with `sk-or-` — verify this is an OpenRouter key',
      );
    }

    const resolverCtx = getResolverDeps();
    const useKeychain = args['use-keychain'] || (resolverCtx.config.auth?.use_keychain ?? false);
    const kind = args.management ? 'management' : 'api';
    const { stored } = persistKey(key, { useKeychain, kind });

    const outputMode = resolveOutputModeDisplay();
    render(
      {
        data: { stored: true, kind, masked: maskKey(key), stored_in: stored },
        meta: {},
      },
      { format: outputMode },
    );
  },
});

// ---------------------------------------------------------------------------
// Sub-router export
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: { description: 'Manage authentication — login, logout, status, whoami, set-key' },
  subCommands: {
    login: loginCommand,
    logout: logoutCommand,
    status: statusCommand,
    whoami: whoamiCommand,
    'set-key': setKeyCommand,
  },
});
