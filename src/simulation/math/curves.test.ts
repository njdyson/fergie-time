import { describe, it, expect } from 'vitest';
import { sigmoid, exponentialDecay, logarithmic, step, linear } from './curves.ts';

describe('sigmoid', () => {
  it('sigmoid(0.5, 10, 0.5) ~== 0.5 (midpoint)', () => {
    expect(sigmoid(0.5, 10, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('sigmoid(0, 10, 0.5) is close to 0', () => {
    expect(sigmoid(0, 10, 0.5)).toBeLessThan(0.1);
  });

  it('sigmoid(1, 10, 0.5) is close to 1', () => {
    expect(sigmoid(1, 10, 0.5)).toBeGreaterThan(0.9);
  });

  it('returns values in [0, 1]', () => {
    for (let x = -1; x <= 2; x += 0.1) {
      const v = sigmoid(x, 5, 0.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('exponentialDecay', () => {
  it('exponentialDecay(0, k) === 1 for any k', () => {
    expect(exponentialDecay(0, 1)).toBe(1);
    expect(exponentialDecay(0, 5)).toBe(1);
    expect(exponentialDecay(0, 0.1)).toBe(1);
  });

  it('exponentialDecay(large, k) approaches 0', () => {
    expect(exponentialDecay(100, 1)).toBeLessThan(0.001);
  });

  it('returns values in [0, 1]', () => {
    const ks = [0.1, 0.5, 1, 2, 5];
    const xs = [0, 0.5, 1, 2, 5, 10, 100];
    for (const k of ks) {
      for (const x of xs) {
        const v = exponentialDecay(x, k);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('logarithmic', () => {
  it('logarithmic(0, max) === 0', () => {
    expect(logarithmic(0, 10)).toBe(0);
    expect(logarithmic(0, 100)).toBe(0);
  });

  it('logarithmic(max, max) === 1', () => {
    expect(logarithmic(10, 10)).toBeCloseTo(1, 10);
    expect(logarithmic(100, 100)).toBeCloseTo(1, 10);
  });

  it('returns 0 when max is 0', () => {
    expect(logarithmic(0, 0)).toBe(0);
  });

  it('returns values in [0, 1]', () => {
    const max = 100;
    for (let x = 0; x <= max; x += 10) {
      const v = logarithmic(x, max);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('step', () => {
  it('step(below threshold) === 0', () => {
    expect(step(0.3, 0.5)).toBe(0);
    expect(step(0, 0.1)).toBe(0);
  });

  it('step(at threshold) === 1', () => {
    expect(step(0.5, 0.5)).toBe(1);
  });

  it('step(above threshold) === 1', () => {
    expect(step(0.7, 0.5)).toBe(1);
    expect(step(1, 0.5)).toBe(1);
  });

  it('returns values in [0, 1]', () => {
    const thresholds = [0, 0.25, 0.5, 0.75, 1];
    const xs = [0, 0.1, 0.5, 0.9, 1];
    for (const threshold of thresholds) {
      for (const x of xs) {
        const v = step(x, threshold);
        expect(v === 0 || v === 1).toBe(true);
      }
    }
  });
});

describe('linear', () => {
  it('linear(x, m, c) clamps output to [0, 1]', () => {
    // Large positive → clamped to 1
    expect(linear(100, 1, 0)).toBe(1);
    // Large negative → clamped to 0
    expect(linear(-100, 1, 0)).toBe(0);
  });

  it('returns correct unclamped values', () => {
    expect(linear(0.5, 1, 0)).toBeCloseTo(0.5);
    expect(linear(0.5, 0.5, 0.25)).toBeCloseTo(0.5);
    expect(linear(0, 1, 0.3)).toBeCloseTo(0.3);
  });

  it('returns values in [0, 1]', () => {
    const ms = [-2, -1, 0, 1, 2];
    const cs = [-1, 0, 0.5, 1, 2];
    const xs = [-1, 0, 0.5, 1, 2];
    for (const m of ms) {
      for (const c of cs) {
        for (const x of xs) {
          const v = linear(x, m, c);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('all curve functions return [0..1]', () => {
  it('no function returns a value outside [0, 1] range', () => {
    const rng_x = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    for (const x of rng_x) {
      expect(sigmoid(x, 5, 0.5)).toBeGreaterThanOrEqual(0);
      expect(sigmoid(x, 5, 0.5)).toBeLessThanOrEqual(1);
      expect(exponentialDecay(x, 2)).toBeGreaterThanOrEqual(0);
      expect(exponentialDecay(x, 2)).toBeLessThanOrEqual(1);
      expect(logarithmic(x, 1)).toBeGreaterThanOrEqual(0);
      expect(logarithmic(x, 1)).toBeLessThanOrEqual(1);
      expect(step(x, 0.5)).toBeGreaterThanOrEqual(0);
      expect(step(x, 0.5)).toBeLessThanOrEqual(1);
      expect(linear(x, 1, 0)).toBeGreaterThanOrEqual(0);
      expect(linear(x, 1, 0)).toBeLessThanOrEqual(1);
    }
  });
});
