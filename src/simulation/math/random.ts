import seedrandom from 'seedrandom';

/**
 * Creates a seeded pseudo-random number generator.
 * Returns a function that produces [0, 1) values deterministically from the seed.
 *
 * @param seed - String seed for the PRNG
 * @returns A function that returns a new random number in [0, 1) on each call
 */
export function createRng(seed: string): () => number {
  const rng = seedrandom(seed);
  return () => rng();
}

/**
 * Generates a normally distributed random value using the Box-Muller transform.
 *
 * @param mean - Mean of the distribution
 * @param stdDev - Standard deviation. If 0, returns mean immediately.
 * @param rng - A uniform [0, 1) random number generator (from createRng)
 * @returns A sample from N(mean, stdDev^2)
 */
export function gaussianNoise(mean: number, stdDev: number, rng: () => number): number {
  if (stdDev === 0) {
    return mean;
  }

  // Box-Muller transform
  // Use Math.max to avoid log(0) which would produce -Infinity
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();

  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}
