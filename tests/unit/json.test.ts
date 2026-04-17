import { describe, expect, test } from 'bun:test';
import { SCHEMA_VERSION, envelope, errorEnvelope } from '../../src/lib/output/json.ts';

describe('SCHEMA_VERSION', () => {
  test('is "1"', () => expect(SCHEMA_VERSION).toBe('1'));
});

describe('envelope', () => {
  test('returns correct shape for success', () => {
    const meta = { elapsed_ms: 42, request_id: 'req_abc' };
    const result = envelope({ foo: 'bar' }, meta);

    expect(result.schema_version).toBe('1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.error).toBeNull();
    expect(result.meta).toEqual(meta);
  });

  test('defaults meta to empty object', () => {
    const result = envelope([1, 2, 3]);
    expect(result.meta).toEqual({});
  });

  test('data passes through unchanged for primitives', () => {
    expect(envelope(42).data).toBe(42);
    expect(envelope(null).data).toBeNull();
    expect(envelope('hello').data).toBe('hello');
  });
});

describe('errorEnvelope', () => {
  test('returns correct shape for error', () => {
    const err = { code: 'unauthorized', message: 'bad key', status: 401 };
    const meta = { elapsed_ms: 10 };
    const result = errorEnvelope(err, meta);

    expect(result.schema_version).toBe('1');
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toEqual(err);
    expect(result.meta).toEqual(meta);
  });

  test('includes optional hint and request_id when provided', () => {
    const err = {
      code: 'rate_limited',
      message: 'slow down',
      hint: 'retry after 5s',
      request_id: 'req_xyz',
    };
    const result = errorEnvelope(err);
    expect(result.error.hint).toBe('retry after 5s');
    expect(result.error.request_id).toBe('req_xyz');
  });
});
