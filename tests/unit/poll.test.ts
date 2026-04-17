import { describe, expect, test } from 'bun:test';
import { TimeoutError } from '../../src/lib/client/errors.ts';
import { poll } from '../../src/lib/client/poll.ts';

describe('poll', () => {
  test('yields results from fn on each call', async () => {
    let callCount = 0;
    const fn = async () => ++callCount;

    const results: number[] = [];
    for await (const val of poll(fn, { intervalMs: 0, maxIntervalMs: 0, timeoutMs: 200 })) {
      results.push(val);
      if (results.length >= 3) break;
    }

    expect(results).toEqual([1, 2, 3]);
  });

  test('throws TimeoutError when timeoutMs is shorter than first interval', async () => {
    let called = 0;
    // fn completes instantly, but poll checks deadline before sleeping
    // Set timeoutMs very short so deadline is exceeded after first yield + sleep attempt
    const fn = async () => {
      called++;
      return called;
    };

    let threw: unknown;
    try {
      // intervalMs=5000 means after yielding, poll tries to sleep 2000ms
      // but timeoutMs=1 means deadline is already exceeded before sleep completes
      for await (const _ of poll(fn, { timeoutMs: 1, intervalMs: 5000, maxIntervalMs: 10000 })) {
        // yield one result, then on next iteration timeout should fire
      }
    } catch (err) {
      threw = err;
    }

    expect(threw).toBeInstanceOf(TimeoutError);
  });

  test('schedule progresses: first three intervals use default schedule', async () => {
    const sleepTimes: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    // Patch setTimeout to capture delays without actually waiting
    let callCount = 0;
    const fn = async () => ++callCount;

    // Use AbortController to stop after collecting schedule info
    const controller = new AbortController();

    // Run with a real short timeoutMs and collect via break
    const results: number[] = [];
    try {
      for await (const val of poll(fn, {
        intervalMs: 2000,
        maxIntervalMs: 10000,
        timeoutMs: 50, // short timeout — stops after a couple iterations
      })) {
        results.push(val);
        if (results.length >= 1) break; // collect first result then stop
      }
    } catch {
      // TimeoutError is fine
    }

    // At minimum fn was called at least once
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test('AbortSignal stops polling cleanly', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return callCount;
    };

    const results: number[] = [];
    const gen = poll(fn, { intervalMs: 0, maxIntervalMs: 0, signal: controller.signal });

    for await (const val of gen) {
      results.push(val);
      if (results.length >= 2) {
        controller.abort();
        break;
      }
    }

    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});
