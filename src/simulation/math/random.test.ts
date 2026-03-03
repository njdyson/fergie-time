import { describe, it, expect } from 'vitest';
import { createRng, gaussianNoise } from './random.ts';

describe('createRng', () => {
  it('produces deterministic sequence for the same seed', () => {
    const rng1 = createRng('seed1');
    const rng2 = createRng('seed1');
    const v1a = rng1();
    const v1b = rng1();
    const v2a = rng2();
    const v2b = rng2();
    expect(v1a).toBe(v2a);
    expect(v1b).toBe(v2b);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createRng('seed1');
    const rng2 = createRng('seed2');
    const values1 = Array.from({ length: 5 }, () => rng1());
    const values2 = Array.from({ length: 5 }, () => rng2());
    // At least one value should differ
    const allSame = values1.every((v, i) => v === values2[i]);
    expect(allSame).toBe(false);
  });

  it('returns values in [0, 1)', () => {
    const rng = createRng('test');
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('gaussianNoise', () => {
  it('returns a finite number', () => {
    const rng = createRng('gauss-test');
    const v = gaussianNoise(0, 1, rng);
    expect(Number.isFinite(v)).toBe(true);
  });

  it('returns mean when stdDev is 0', () => {
    const rng = createRng('gauss-zero');
    expect(gaussianNoise(5, 0, rng)).toBe(5);
    expect(gaussianNoise(0, 0, rng)).toBe(0);
    expect(gaussianNoise(-3.14, 0, rng)).toBe(-3.14);
  });

  it('has mean near 0 over 1000 samples (gaussianNoise(0, 1))', () => {
    const rng = createRng('gauss-mean');
    let sum = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      sum += gaussianNoise(0, 1, rng);
    }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });

  it('has stdDev near 1 over 1000 samples (gaussianNoise(0, 1))', () => {
    const rng = createRng('gauss-stddev');
    const samples: number[] = [];
    const n = 1000;
    for (let i = 0; i < n; i++) {
      samples.push(gaussianNoise(0, 1, rng));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    expect(stdDev).toBeGreaterThan(0.8);
    expect(stdDev).toBeLessThan(1.2);
  });

  it('respects the mean parameter', () => {
    const rng = createRng('gauss-shifted');
    let sum = 0;
    const n = 1000;
    const targetMean = 5;
    for (let i = 0; i < n; i++) {
      sum += gaussianNoise(targetMean, 1, rng);
    }
    const mean = sum / n;
    expect(Math.abs(mean - targetMean)).toBeLessThan(0.2);
  });
});
