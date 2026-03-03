/**
 * Response curve functions for utility AI considerations.
 * ALL functions return values clamped to [0..1] — this is a hard contract.
 */

/** Clamps a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Logistic (sigmoid) curve.
 *
 * @param x - Input value
 * @param steepness - How steep the S-curve is (higher = steeper)
 * @param midpoint - The x value at which output is 0.5
 * @returns Value in [0, 1]
 */
export function sigmoid(x: number, steepness: number, midpoint: number): number {
  return clamp01(1 / (1 + Math.exp(-steepness * (x - midpoint))));
}

/**
 * Exponential decay curve. Returns 1 at x=0, approaches 0 as x increases.
 *
 * @param x - Input value (non-negative expected)
 * @param k - Decay rate (higher = faster decay)
 * @returns Value in [0, 1]
 */
export function exponentialDecay(x: number, k: number): number {
  return clamp01(Math.exp(-k * x));
}

/**
 * Logarithmic curve. Normalized so that output is 0 at x=0 and 1 at x=max.
 * Returns 0 when max is 0.
 *
 * @param x - Input value
 * @param max - Maximum expected input value
 * @returns Value in [0, 1]
 */
export function logarithmic(x: number, max: number): number {
  if (max === 0) return 0;
  return clamp01(Math.log(1 + x) / Math.log(1 + max));
}

/**
 * Step function. Returns 0 below threshold, 1 at or above.
 *
 * @param x - Input value
 * @param threshold - The threshold at which output switches from 0 to 1
 * @returns 0 or 1
 */
export function step(x: number, threshold: number): number {
  return x >= threshold ? 1 : 0;
}

/**
 * Linear function with clamping: clamp(slope * x + intercept, 0, 1).
 *
 * @param x - Input value
 * @param slope - Linear slope (m)
 * @param intercept - Y-intercept (c)
 * @returns Value in [0, 1]
 */
export function linear(x: number, slope: number, intercept: number): number {
  return clamp01(slope * x + intercept);
}
