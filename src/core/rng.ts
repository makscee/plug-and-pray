// Seeded randomness: the same seed and chunk always give the same chunk.

/** a 32-bit hash of integers */
export function hash(...ns: number[]): number {
  let h = 0x811c9dc5;
  for (const n of ns) {
    h ^= n | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}

export type Rng = {
  /** [0, 1) */
  (): number;
  /** integer in [a, b] */
  int(a: number, b: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
};

export function rng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  const r = (() => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = (xs) => xs[Math.floor(r() * xs.length)];
  r.chance = (p) => r() < p;
  return r;
}
