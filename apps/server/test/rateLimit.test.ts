import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter, TokenBucket } from '../src/rateLimit.js';

describe('rate limiters', () => {
  it('token bucket allows a burst then refills', () => {
    let t = 0;
    const b = new TokenBucket(10, 20, () => t);
    for (let i = 0; i < 20; i++) expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    t += 100;
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });
  it('sliding window', () => {
    let t = 0;
    const l = new SlidingWindowLimiter(2, 1000, () => t);
    expect(l.take('a')).toBe(true);
    expect(l.take('a')).toBe(true);
    expect(l.take('a')).toBe(false);
    expect(l.take('b')).toBe(true);
    t = 1500;
    l.sweep();
    expect(l.take('a')).toBe(true);
  });
});
