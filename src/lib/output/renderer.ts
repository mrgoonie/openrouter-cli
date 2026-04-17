/**
 * Output renderer — dispatches to the appropriate format handler based on
 * the resolved output mode. Stdout = data only; stderr = diagnostics.
 */

import { CliError } from '../errors/exit-codes.ts';
import { type ErrorDetail, type Meta, emitNdjson, envelope, errorEnvelope } from './json.ts';
import { type ColumnDef, renderTable } from './table.ts';
import type { OutputMode } from './tty.ts';

export type RenderResult = {
  data: unknown;
  meta: Meta;
};

export type RenderOpts = {
  format: OutputMode;
  noColor?: boolean;
  /** Required when format === 'table'. */
  columns?: ColumnDef[];
};

/** Render a successful result to stdout in the requested format. */
export function render(result: RenderResult, opts: RenderOpts): void {
  const { format, columns } = opts;
  const env = envelope(result.data, result.meta);

  switch (format) {
    case 'json':
      process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
      break;

    case 'ndjson':
      emitNdjson(env);
      break;

    case 'table': {
      if (!columns || columns.length === 0) {
        throw new CliError('usage', "format 'table' requires columns to be specified");
      }
      const rows = Array.isArray(result.data)
        ? (result.data as Array<Record<string, unknown>>)
        : [result.data as Record<string, unknown>];
      process.stdout.write(`${renderTable(rows, columns)}\n`);
      break;
    }

    case 'text':
    case 'pretty':
      // Pretty/text mode: commands render their own human output.
      // Fallback: emit compact JSON data when no custom renderer is provided.
      process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
      break;

    case 'yaml':
      throw new CliError('usage', 'yaml output not supported in v1');

    default: {
      // Exhaustiveness guard — TypeScript should catch this at compile time.
      const _never: never = format;
      throw new CliError('usage', `unknown output format: ${String(_never)}`);
    }
  }
}

/** Render an error envelope to stdout (used when --json) or stderr (pretty). */
export function renderError(err: ErrorDetail, meta: Meta, opts: { json: boolean }): void {
  const env = errorEnvelope(err, meta);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
  } else {
    process.stderr.write(`${JSON.stringify(env, null, 2)}\n`);
  }
}
