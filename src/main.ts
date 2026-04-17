import { defineCommand, runMain } from 'citty';
import analyticsCommand from './commands/analytics.ts';
import authCommand from './commands/auth.ts';
import chatCommand from './commands/chat.ts';
import completionCommand from './commands/completion.ts';
import configCommand from './commands/config.ts';
import creditsCommand from './commands/credits.ts';
import embeddingsCommand from './commands/embeddings.ts';
import generationsCommand from './commands/generations.ts';
import guardrailsCommand from './commands/guardrails.ts';
import keysCommand from './commands/keys.ts';
import modelsCommand from './commands/models.ts';
import orgCommand from './commands/org.ts';
import providersCommand from './commands/providers.ts';
import rerankCommand from './commands/rerank.ts';
import responsesCommand from './commands/responses.ts';
import videoCommand from './commands/video.ts';
import { buildResolverContext } from './lib/config/resolve.ts';
import { buildContext } from './lib/context.ts';
import { VERSION } from './version.ts';

const main = defineCommand({
  meta: {
    name: 'openrouter',
    version: VERSION,
    description: 'OpenRouter CLI — agent + human friendly wrapper for the full OpenRouter API',
  },
  args: {
    'api-key': {
      type: 'string',
      description: 'OpenRouter API key (overrides OPENROUTER_API_KEY)',
      alias: 'k',
    },
    'management-key': {
      type: 'string',
      description: 'OpenRouter management key (overrides OPENROUTER_MANAGEMENT_KEY)',
    },
    'base-url': {
      type: 'string',
      description: 'API base URL (overrides OPENROUTER_BASE_URL)',
    },
    output: {
      type: 'string',
      description: 'Output format: pretty | json | ndjson | table | text | yaml | auto',
      alias: 'o',
    },
    json: {
      type: 'boolean',
      description: 'Alias for --output json',
      default: false,
    },
    'no-color': {
      type: 'boolean',
      description: 'Disable ANSI color output',
      default: false,
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose/debug output to stderr',
      alias: 'v',
      default: false,
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress all non-error output',
      alias: 'q',
      default: false,
    },
    config: {
      type: 'string',
      description: 'Path to TOML config file (overrides OPENROUTER_CONFIG)',
      alias: 'c',
    },
    timeout: {
      type: 'string',
      description: 'Request timeout in milliseconds (overrides OPENROUTER_TIMEOUT)',
    },
    'non-interactive': {
      type: 'boolean',
      description: 'Disable all interactive prompts',
      default: false,
    },
    'http-referer': {
      type: 'string',
      description: 'HTTP-Referer header value (overrides OPENROUTER_SITE_URL)',
    },
    'app-name': {
      type: 'string',
      description: 'X-Title header value (overrides OPENROUTER_APP_NAME)',
    },
  },
  subCommands: {
    analytics: analyticsCommand,
    auth: authCommand,
    chat: chatCommand,
    completion: completionCommand,
    config: configCommand,
    credits: creditsCommand,
    embeddings: embeddingsCommand,
    generations: generationsCommand,
    guardrails: guardrailsCommand,
    keys: keysCommand,
    models: modelsCommand,
    org: orgCommand,
    providers: providersCommand,
    rerank: rerankCommand,
    responses: responsesCommand,
    video: videoCommand,
  },
  async run({ args }) {
    // Citty invokes this root handler before (not instead of) a matched
    // subcommand — so keep work here minimal and produce no stdout noise.
    // The banner only renders when no subcommand is present.
    const resolverCtx = buildResolverContext({ config: args.config });
    buildContext(
      {
        apiKey: args['api-key'],
        managementKey: args['management-key'],
        baseUrl: args['base-url'],
        output: args.output,
        json: args.json,
        noColor: args['no-color'],
        verbose: args.verbose,
        quiet: args.quiet,
        config: args.config,
        timeout: args.timeout !== undefined ? Number(args.timeout) : undefined,
        nonInteractive: args['non-interactive'],
        httpReferer: args['http-referer'],
        appName: args['app-name'],
      },
      resolverCtx,
    );

    const hasSubcommand = process.argv
      .slice(2)
      .some((a) =>
        [
          'analytics',
          'auth',
          'chat',
          'completion',
          'config',
          'credits',
          'embeddings',
          'generations',
          'guardrails',
          'keys',
          'models',
          'org',
          'providers',
          'rerank',
          'responses',
          'video',
        ].includes(a),
      );
    if (!hasSubcommand) {
      console.log(`openrouter v${VERSION}`);
      console.log('Run `openrouter --help` for usage.');
    }
  },
});

// ---------------------------------------------------------------------------
// Top-level runner — uses runCommand directly so we control exit codes.
// citty's runMain always exits 1 on error; we need codes 64-73 for agents.
// ---------------------------------------------------------------------------

import { runCommand } from 'citty';
import { HTTPError } from './lib/client/errors.ts';
import { CliError, codeToExit } from './lib/errors/exit-codes.ts';
import { errorEnvelope } from './lib/output/json.ts';

function isJsonMode(): boolean {
  const argv = process.argv.slice(2);
  return (
    argv.includes('--json') || (argv.includes('-o') && argv[argv.indexOf('-o') + 1] === 'json')
  );
}

function renderCliError(err: CliError | HTTPError, json: boolean): void {
  const isHttp = err instanceof HTTPError;
  const code = isHttp ? err.code : err.code;
  const detail = {
    code,
    message: err.message,
    ...(!isHttp && err.hint ? { hint: err.hint } : {}),
    ...(isHttp ? { status: err.status } : {}),
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(errorEnvelope(detail), null, 2)}\n`);
  } else {
    process.stderr.write(
      `\n ERROR  ${err.message}\n${!isHttp && err.hint ? `\n    Hint: ${err.hint}\n` : ''}\n`,
    );
  }
}

const rawArgs = process.argv.slice(2);

// Handle --help / -h (citty shows usage and exits 0)
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  runMain(main);
} else {
  (async () => {
    try {
      await runCommand(main, { rawArgs });
    } catch (err) {
      const json = isJsonMode();
      if (err instanceof CliError) {
        renderCliError(err, json);
        process.exit(err.exit);
      }
      if (err instanceof HTTPError) {
        renderCliError(err, json);
        process.exit(codeToExit(err.code));
      }
      // Unknown error — print and exit 1
      if (err instanceof Error) {
        process.stderr.write(`\n ERROR  ${err.message}\n`);
      } else {
        process.stderr.write('\n ERROR  Unknown error\n');
      }
      process.exit(1);
    }
  })();
}
