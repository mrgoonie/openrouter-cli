/** cli-table3 wrapper with NO_COLOR support. */

import Table from 'cli-table3';
import { shouldColor } from './tty.ts';

export type ColumnDef = {
  key: string;
  header: string;
  width?: number;
};

/**
 * Render an array of records as a formatted table string.
 *
 * Respects NO_COLOR / non-TTY: disables head/border styles when color is off.
 */
export function renderTable(rows: Array<Record<string, unknown>>, columns: ColumnDef[]): string {
  const color = shouldColor();

  const tableOpts: ConstructorParameters<typeof Table>[0] = {
    head: columns.map((c) => c.header),
    colWidths: columns.map((c) => c.width ?? null),
    style: {
      head: color ? ['cyan'] : [],
      border: color ? ['grey'] : [],
    },
  };

  const table = new Table(tableOpts);

  for (const row of rows) {
    const cells = columns.map((c) => {
      const val = row[c.key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });
    table.push(cells);
  }

  return table.toString();
}
