/** JSON envelope helpers and NDJSON emitter for agent-friendly output. */

export const SCHEMA_VERSION = '1' as const;

export type Meta = {
  request_id?: string;
  elapsed_ms?: number;
  generation_id?: string;
  [key: string]: unknown;
};

export type ErrorDetail = {
  code: string;
  message: string;
  hint?: string;
  status?: number;
  request_id?: string;
};

export type Envelope<T> = {
  schema_version: '1';
  success: true;
  data: T;
  error: null;
  meta: Meta;
};

export type ErrorEnvelope = {
  schema_version: '1';
  success: false;
  data: null;
  error: ErrorDetail;
  meta: Meta;
};

/** Wrap successful data in the stable JSON envelope. */
export function envelope<T>(data: T, meta: Meta = {}): Envelope<T> {
  return { schema_version: SCHEMA_VERSION, success: true, data, error: null, meta };
}

/** Wrap an error in the stable JSON envelope. */
export function errorEnvelope(err: ErrorDetail, meta: Meta = {}): ErrorEnvelope {
  return { schema_version: SCHEMA_VERSION, success: false, data: null, error: err, meta };
}

/** Write a single NDJSON line to stdout. */
export function emitNdjson(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}
