// Seeded PRNG. Never call Math.random() anywhere in the project — go through this.
// Contract: makeRng(seed) -> { next, int, pick }  (see docs/CONTRACTS.md §6)

/** mulberry32 — small, fast, good enough for a game. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** integer in [0, n) */
    int: (n) => Math.floor(next() * n),
    /** random element of arr */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** true with probability p */
    chance: (p) => next() < p,
  };
}
