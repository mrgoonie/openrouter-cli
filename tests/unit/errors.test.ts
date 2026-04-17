import { describe, expect, test } from 'bun:test';
import { mapStatusToCode } from '../../src/lib/client/errors.ts';
import { CliError, ExitCode, codeToExit } from '../../src/lib/errors/exit-codes.ts';

describe('mapStatusToCode', () => {
  test('401 → unauthorized', () => expect(mapStatusToCode(401)).toBe('unauthorized'));
  test('402 → insufficient_credits', () =>
    expect(mapStatusToCode(402)).toBe('insufficient_credits'));
  test('403 → forbidden', () => expect(mapStatusToCode(403)).toBe('forbidden'));
  test('404 → not_found', () => expect(mapStatusToCode(404)).toBe('not_found'));
  test('429 → rate_limited', () => expect(mapStatusToCode(429)).toBe('rate_limited'));
  test('500 → server_error', () => expect(mapStatusToCode(500)).toBe('server_error'));
  test('503 → server_error', () => expect(mapStatusToCode(503)).toBe('server_error'));
  test('200 → generic (non-error code passthrough)', () =>
    expect(mapStatusToCode(200)).toBe('generic'));
});

describe('codeToExit', () => {
  test('unauthorized → 65', () => expect(codeToExit('unauthorized')).toBe(ExitCode.UNAUTHORIZED));
  test('insufficient_credits → 68', () =>
    expect(codeToExit('insufficient_credits')).toBe(ExitCode.INSUFFICIENT_CREDITS));
  test('forbidden → 66', () => expect(codeToExit('forbidden')).toBe(ExitCode.FORBIDDEN));
  test('not_found → 67', () => expect(codeToExit('not_found')).toBe(ExitCode.NOT_FOUND));
  test('rate_limited → 69', () => expect(codeToExit('rate_limited')).toBe(ExitCode.RATE_LIMITED));
  test('server_error → 70', () => expect(codeToExit('server_error')).toBe(ExitCode.SERVER_ERROR));
  test('timeout → 71', () => expect(codeToExit('timeout')).toBe(ExitCode.TIMEOUT));
  test('invalid_response → 72', () =>
    expect(codeToExit('invalid_response')).toBe(ExitCode.INVALID_RESPONSE));
  test('async_job_failed → 73', () =>
    expect(codeToExit('async_job_failed')).toBe(ExitCode.ASYNC_JOB_FAILED));
  test('generic → 1', () => expect(codeToExit('generic')).toBe(ExitCode.GENERIC));
});

describe('CliError.exit', () => {
  test('maps code to exit number via getter', () => {
    const err = new CliError('rate_limited', 'slow down');
    expect(err.exit).toBe(ExitCode.RATE_LIMITED);
    expect(err.exit).toBe(69);
  });

  test('preserves message and hint', () => {
    const err = new CliError('no_key', 'no key found', 'set OPENROUTER_API_KEY');
    expect(err.message).toBe('no key found');
    expect(err.hint).toBe('set OPENROUTER_API_KEY');
    expect(err.name).toBe('CliError');
  });
});
