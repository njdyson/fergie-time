import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { generatePlayerName } from './nameGen.ts';

describe('generatePlayerName', () => {
  it('returns a string matching "Firstname Lastname" pattern', () => {
    const rng = seedrandom('test-seed');
    const name = generatePlayerName(rng);
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('repeated calls produce different names', () => {
    const rng = seedrandom('variety-seed');
    const names = new Set<string>();
    for (let i = 0; i < 20; i++) {
      names.add(generatePlayerName(rng));
    }
    // With 20 calls from pools of 20+ names each, we should get at least 5 unique names
    expect(names.size).toBeGreaterThanOrEqual(5);
  });

  it('produces reproducible output with a seeded rng', () => {
    const rng1 = seedrandom('deterministic');
    const rng2 = seedrandom('deterministic');
    const names1 = Array.from({ length: 10 }, () => generatePlayerName(rng1));
    const names2 = Array.from({ length: 10 }, () => generatePlayerName(rng2));
    expect(names1).toEqual(names2);
  });

  it('returns a non-empty string', () => {
    const rng = seedrandom('non-empty');
    const name = generatePlayerName(rng);
    expect(name.length).toBeGreaterThan(0);
    expect(name.trim()).toBe(name);
  });
});
