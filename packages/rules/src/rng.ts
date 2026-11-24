import type { RngState } from './types.js';

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/**
 * xoshiro128** — returns the next unsigned 32-bit value and advances `rng` IN PLACE.
 * Callers that need purity must clone the state first (the game engine always does).
 */
export function nextU32(rng: RngState): number {
  const s = rng.s;
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return result;
}

/** Uniform integer in [0, n). */
export function randInt(rng: RngState, n: number): number {
  return Math.floor((nextU32(rng) / 4294967296) * n);
}

/** Fisher–Yates shuffle, in place. */
export function shuffleInPlace<T>(rng: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/** Builds a valid xoshiro state from 4 words; an all-zero state (degenerate) is replaced. */
export function createRng(seed: readonly [number, number, number, number]): RngState {
  const s = seed.map((x) => x >>> 0) as [number, number, number, number];
  if (s[0] === 0 && s[1] === 0 && s[2] === 0 && s[3] === 0) s[0] = 1;
  return { s };
}

/** Expands a single 32-bit seed into a 4-word state with splitmix32. */
export function seedFromNumber(seed: number): [number, number, number, number] {
  let x = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    out.push(z);
  }
  return out as [number, number, number, number];
}
