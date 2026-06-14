// src/lib/utils/debounce.test.js
// debounce delays fn until `wait` ms after the last call; successive calls
// reset the timer; .cancel() drops a pending call.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce.js';

beforeEach(() => vi.useFakeTimers());
afterEach(()  => vi.useRealTimers());

describe('debounce', () => {
  it('fires once after the wait, with the latest args', () => {
    const fn = vi.fn();
    const d  = debounce(fn, 250);
    d('a'); d('b'); d('c');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('resets the timer on each call', () => {
    const fn = vi.fn();
    const d  = debounce(fn, 250);
    d();
    vi.advanceTimersByTime(200);
    d();                       // resets — still 250ms to go
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel() drops a pending invocation', () => {
    const fn = vi.fn();
    const d  = debounce(fn, 250);
    d();
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});
