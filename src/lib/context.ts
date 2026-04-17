/**
 * CLI invocation context — built once in main.ts and passed to every subcommand.
 * Carries resolved flags, the resolver context (dotenv + config), and output helpers.
 */

import type { ResolverContext } from './config/resolve.ts';
import { type RenderResult, render, renderError } from './output/renderer.ts';
import type { ColumnDef } from './output/table.ts';
import { resolveOutputMode } from './output/tty.ts';

export type GlobalFlags = {
  apiKey?: string;
  managementKey?: string;
  baseUrl?: string;
  output?: string;
  json?: boolean;
  noColor?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  config?: string;
  timeout?: number;
  nonInteractive?: boolean;
  httpReferer?: string;
  appName?: string;
};

export type Context = {
  /** Raw CLI flags before resolution. */
  flags: GlobalFlags;
  /** Pre-loaded resolver context (dotenv + TOML config). */
  resolverCtx: ResolverContext;
  /** True when --verbose was passed. */
  verbose: boolean;
  /** True when --quiet was passed. */
  quiet: boolean;
  /** True when --non-interactive was passed or environment is non-interactive. */
  nonInteractive: boolean;
  /**
   * Render a successful result to stdout in the resolved output format.
   * Pass `columns` when the format may be 'table'.
   */
  render(result: RenderResult, columns?: ColumnDef[]): void;
  /** Emit a structured error. Writes to stdout when --json, else stderr. */
  emitError(err: Error): void;
};

/** Build the invocation context from resolved flags and a pre-loaded resolver context. */
export function buildContext(flags: GlobalFlags, resolverCtx: ResolverContext): Context {
  // Resolve effective output mode: --json is shorthand for --output json
  const outputFlag = flags.json ? 'json' : flags.output;
  const format = resolveOutputMode(outputFlag);
  const noColor = flags.noColor ?? false;
  const isJson = format === 'json' || format === 'ndjson';

  return {
    flags,
    resolverCtx,
    verbose: flags.verbose ?? false,
    quiet: flags.quiet ?? false,
    nonInteractive: flags.nonInteractive ?? false,

    render(result: RenderResult, columns?: ColumnDef[]): void {
      render(result, { format, noColor, columns });
    },

    emitError(err: Error): void {
      const detail: import('./output/json.ts').ErrorDetail = {
        code: 'generic',
        message: err.message,
      };
      renderError(detail, {}, { json: isJson });
    },
  };
}
