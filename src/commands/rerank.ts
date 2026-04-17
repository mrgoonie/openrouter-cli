/**
 * `openrouter rerank` sub-command group.
 * Verbs: run
 *
 * run — POST /rerank (auth: user)
 *   --docs accepts a file path or '-' for stdin; one document per line
 *   Pretty: ranked table sorted by relevance_score desc
 *   JSON: full API response passthrough
 *   Exit 2 if fewer than 2 documents provided
 */

import { defineCommand } from 'citty';
import { request } from '../lib/client/client.ts';
import { buildResolverContext, resolveApiKey, resolveBaseUrl } from '../lib/config/resolve.ts';
import { CliError } from '../lib/errors/exit-codes.ts';
import { readInputArg, readLinesFromSource } from '../lib/io/input-reader.ts';
import { render } from '../lib/output/renderer.ts';
import { renderTable } from '../lib/output/table.ts';
import { resolveOutputMode } from '../lib/output/tty.ts';
import { RerankResponseSchema } from '../lib/types/openrouter.ts';

const runCommand = defineCommand({
  meta: { description: 'Rerank documents by relevance to a query' },
  args: {
    query: {
      type: 'string' as const,
      description: 'Query string to rank documents against',
      required: true,
    },
    docs: {
      type: 'string' as const,
      description: 'File path or "-" for stdin; one document per line',
      required: true,
    },
    model: { type: 'string' as const, description: 'Rerank model ID', required: true },
    'top-n': { type: 'string' as const, description: 'Return only the top N results' },
    provider: { type: 'string' as const, description: 'Path to provider JSON config' },
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

    // Read and parse documents — one per line
    const docsArg = args.docs as string;
    const docText = await readInputArg(docsArg, true);
    const docs = readLinesFromSource(docText);

    if (docs.length < 2) {
      throw new CliError(
        'usage',
        'At least 2 documents required for reranking',
        'Provide one document per line in the --docs file or stdin',
      );
    }

    // Optional provider config passthrough
    let providerConfig: unknown;
    if (args.provider) {
      providerConfig = await Bun.file(args.provider as string).json();
    }

    const topN = args['top-n'] !== undefined ? Number(args['top-n']) : undefined;

    const body: Record<string, unknown> = {
      model: args.model as string,
      query: args.query as string,
      documents: docs,
    };
    if (topN !== undefined) body.top_n = topN;
    if (providerConfig !== undefined) body.provider = providerConfig;

    const result = await request<unknown>({
      path: '/rerank',
      method: 'POST',
      auth: 'user',
      apiKey,
      baseUrl,
      body,
    });

    const parsed = RerankResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new CliError('invalid_response', 'Unexpected /rerank response', parsed.error.message);
    }

    const format = resolveOutputMode(
      (args.json as boolean) ? 'json' : (args.output as string | undefined),
    );
    const noColor = (args['no-color'] as boolean) ?? false;

    if (format === 'json' || format === 'ndjson') {
      render({ data: parsed.data, meta: {} }, { format, noColor });
      return;
    }

    // Pretty: sorted table by relevance_score descending
    const sorted = [...parsed.data.results].sort((a, b) => b.relevance_score - a.relevance_score);

    const rows = sorted.map((item, idx) => {
      const docText = item.document?.text ?? docs[item.index] ?? '';
      const truncated = docText.length > 80 ? `${docText.slice(0, 79)}\u2026` : docText;
      return {
        rank: String(idx + 1),
        score: item.relevance_score.toFixed(3),
        document: truncated,
      };
    });

    process.stdout.write(
      `${renderTable(rows, [
        { key: 'rank', header: 'Rank', width: 6 },
        { key: 'score', header: 'Score', width: 10 },
        { key: 'document', header: 'Document', width: 84 },
      ])}\n`,
    );
  },
});

export default defineCommand({
  meta: { description: 'Rerank documents by semantic relevance' },
  subCommands: {
    run: runCommand,
  },
});
