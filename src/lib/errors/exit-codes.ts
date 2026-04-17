export enum ExitCode {
  OK = 0,
  GENERIC = 1,
  USAGE = 2,
  NO_KEY = 64,
  UNAUTHORIZED = 65,
  FORBIDDEN = 66,
  NOT_FOUND = 67,
  INSUFFICIENT_CREDITS = 68,
  RATE_LIMITED = 69,
  SERVER_ERROR = 70,
  TIMEOUT = 71,
  INVALID_RESPONSE = 72,
  ASYNC_JOB_FAILED = 73,
}

export type ErrorCode =
  | 'generic'
  | 'usage'
  | 'no_key'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'insufficient_credits'
  | 'rate_limited'
  | 'server_error'
  | 'timeout'
  | 'invalid_response'
  | 'async_job_failed';

export function codeToExit(code: ErrorCode): ExitCode {
  switch (code) {
    case 'usage':
      return ExitCode.USAGE;
    case 'no_key':
      return ExitCode.NO_KEY;
    case 'unauthorized':
      return ExitCode.UNAUTHORIZED;
    case 'forbidden':
      return ExitCode.FORBIDDEN;
    case 'not_found':
      return ExitCode.NOT_FOUND;
    case 'insufficient_credits':
      return ExitCode.INSUFFICIENT_CREDITS;
    case 'rate_limited':
      return ExitCode.RATE_LIMITED;
    case 'server_error':
      return ExitCode.SERVER_ERROR;
    case 'timeout':
      return ExitCode.TIMEOUT;
    case 'invalid_response':
      return ExitCode.INVALID_RESPONSE;
    case 'async_job_failed':
      return ExitCode.ASYNC_JOB_FAILED;
    default:
      return ExitCode.GENERIC;
  }
}

export class CliError extends Error {
  public readonly code: ErrorCode;
  public readonly hint?: string;
  // `cause` is declared on Error in ES2022; use override to satisfy tsc strict checks
  public override readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, hint?: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'CliError';
    this.code = code;
    this.hint = hint;
    this.cause = cause;
  }

  get exit(): ExitCode {
    return codeToExit(this.code);
  }
}
