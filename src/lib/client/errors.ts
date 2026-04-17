import type { ErrorCode } from '../errors/exit-codes.ts';

export class HTTPError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly requestId?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'HTTPError';
  }
}

export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function mapStatusToCode(status: number): ErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 402) return 'insufficient_credits';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500 && status < 600) return 'server_error';
  if (status >= 400 && status < 500) return 'generic';
  return 'generic';
}

export function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.error === 'object' && b.error !== null) {
      const err = b.error as Record<string, unknown>;
      if (typeof err.message === 'string') return err.message;
    }
    if (typeof b.message === 'string') return b.message;
  }
  return fallback;
}
