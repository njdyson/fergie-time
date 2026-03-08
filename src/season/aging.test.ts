/**
 * Age progression system tests.
 */

import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import {
  incrementAge,
  applyPhysicalDecay,
  applyMentalGrowth,
  shouldRetire,
  applyAITrainingBoosts,
  applySeasonProgression,
} from './aging.ts';
import type { PlayerState, PlayerAttributes, PersonalityVector } from '../simulation/types.ts';
import { Duty } from '../simulation/types.ts';
import { Vec2 } from '../simulation/math/vec2.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAttrs(overrides?: Partial<PlayerAttributes>): PlayerAttributes {
  return {
    pace: 0.50, strength: 0.50, stamina: 0.50, dribbling: 0.50,
    passing: 0.50, shooting: 0.50, tackling: 0.50, aerial: 0.50,
    positioning: 0.50, vision: 0.50, acceleration: 0.50, crossing: 0.50,
    finishing: 0.50, agility: 0.50, heading: 0.50, concentration: 0.50,
    reflexes: 0.40, handling: 0.40, oneOnOnes: 0.40, distribution: 0.50,
    ...overrides,
  };
}

function makePersonality(overrides?: Partial<PersonalityVector>): PersonalityVector {
  return {
    directness: 0.5, risk_appetite: 0.5, composure: 0.5, creativity: 0.5,
    work_rate: 0.5, aggression: 0.5, anticipation: 0.5, flair: 0.5,
    ...overrides,
  };
}

function makePlayer(overrides?: {
  attributes?: Partial<PlayerAttributes>;
  personality?: Partial<PersonalityVector>;
  age?: number;
  role?: string;
  id?: string;
}): PlayerState {
  return {
    id: overrides?.id ?? 'test-player',
    teamId: 'home',
    position: Vec2.zero(),
    velocity: Vec2.zero(),
    attributes: makeAttrs(overrides?.attributes),
    personality: makePersonality(overrides?.personality),
    fatigue: 0,
    role: overrides?.role ?? 'CM',
    duty: Duty.SUPPORT,
    formationAnchor: Vec2.zero(),
    name: 'Test Player',
    age: overrides?.age ?? 25,
  };
}

// ---------------------------------------------------------------------------
// incrementAge
// ---------------------------------------------------------------------------

describe('incrementAge', () => {
  it('increments age by 1', () => {
    const player = makePlayer({ age: 25 });
    const result = incrementAge(player);
    expect(result.age).toBe(26);
  });

  it('defaults undefined age to 25 then increments', () => {
    const player = { ...makePlayer() };
    delete (player as unknown as Record<string, unknown>).age;
    const result = incrementAge(player);
    expect(result.age).toBe(26);
  });

  it('does not mutate original', () => {
    const player = makePlayer({ age: 30 });
    incrementAge(player);
    expect(player.age).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// applyPhysicalDecay
// ---------------------------------------------------------------------------

describe('applyPhysicalDecay', () => {
  it('no decay for players under 28', () => {
    const player = makePlayer({ age: 25 });
    const result = applyPhysicalDecay(player);
    expect(result.attributes.pace).toBe(0.50);
    expect(result.attributes.acceleration).toBe(0.50);
    expect(result.attributes.stamina).toBe(0.50);
    expect(result.attributes.agility).toBe(0.50);
    expect(result.attributes.strength).toBe(0.50);
  });

  it('applies 0.008 decay for ages 28-30', () => {
    const player = makePlayer({ age: 29, attributes: { pace: 0.80 } });
    const result = applyPhysicalDecay(player);
    expect(result.attributes.pace).toBeCloseTo(0.792, 3);
    expect(result.attributes.acceleration).toBeCloseTo(0.492, 3);
  });

  it('applies 0.015 decay for ages 31-33', () => {
    const player = makePlayer({ age: 32, attributes: { pace: 0.80 } });
    const result = applyPhysicalDecay(player);
    expect(result.attributes.pace).toBeCloseTo(0.785, 3);
  });

  it('applies 0.025 decay for ages 34+', () => {
    const player = makePlayer({ age: 35, attributes: { pace: 0.80 } });
    const result = applyPhysicalDecay(player);
    expect(result.attributes.pace).toBeCloseTo(0.775, 3);
  });

  it('does not decay below 0.20 floor', () => {
    const player = makePlayer({ age: 36, attributes: { pace: 0.21 } });
    const result = applyPhysicalDecay(player);
    expect(result.attributes.pace).toBe(0.20);
  });

  it('does not affect non-physical attributes', () => {
    const player = makePlayer({ age: 32, attributes: { passing: 0.80, vision: 0.80 } });
    const result = applyPhysicalDecay(player);
    expect(result.attributes.passing).toBe(0.80);
    expect(result.attributes.vision).toBe(0.80);
  });
});

// ---------------------------------------------------------------------------
// applyMentalGrowth
// ---------------------------------------------------------------------------

describe('applyMentalGrowth', () => {
  it('grows positioning/vision/concentration for young player (0.010)', () => {
    const player = makePlayer({ age: 22 });
    const result = applyMentalGrowth(player);
    expect(result.attributes.positioning).toBeCloseTo(0.51, 3);
    expect(result.attributes.vision).toBeCloseTo(0.51, 3);
    expect(result.attributes.concentration).toBeCloseTo(0.51, 3);
  });

  it('grows personality traits (composure, anticipation, work_rate)', () => {
    const player = makePlayer({ age: 26 });
    const result = applyMentalGrowth(player);
    expect(result.personality.composure).toBeCloseTo(0.515, 3);
    expect(result.personality.anticipation).toBeCloseTo(0.515, 3);
    expect(result.personality.work_rate).toBeCloseTo(0.515, 3);
  });

  it('peak growth at 24-30 (0.015)', () => {
    const player = makePlayer({ age: 28 });
    const result = applyMentalGrowth(player);
    expect(result.attributes.positioning).toBeCloseTo(0.515, 3);
  });

  it('slower growth at 31+ (0.008)', () => {
    const player = makePlayer({ age: 33 });
    const result = applyMentalGrowth(player);
    expect(result.attributes.positioning).toBeCloseTo(0.508, 3);
  });

  it('caps at 1.0', () => {
    const player = makePlayer({ age: 28, attributes: { positioning: 0.995 } });
    const result = applyMentalGrowth(player);
    expect(result.attributes.positioning).toBe(1.0);
  });

  it('does not affect non-mental attributes', () => {
    const player = makePlayer({ age: 28 });
    const result = applyMentalGrowth(player);
    expect(result.attributes.pace).toBe(0.50);
    expect(result.attributes.shooting).toBe(0.50);
  });

  it('does not affect non-mental personality traits', () => {
    const player = makePlayer({ age: 28 });
    const result = applyMentalGrowth(player);
    expect(result.personality.directness).toBe(0.5);
    expect(result.personality.flair).toBe(0.5);
    expect(result.personality.aggression).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// shouldRetire
// ---------------------------------------------------------------------------

describe('shouldRetire', () => {
  it('never retires players 32 or younger', () => {
    const player = makePlayer({ age: 32 });
    // Try with rng that would return 0 (always triggers)
    expect(shouldRetire(player, () => 0.001)).toBe(false);
  });

  it('5% chance at age 33', () => {
    const player = makePlayer({ age: 33 });
    expect(shouldRetire(player, () => 0.04)).toBe(true);
    expect(shouldRetire(player, () => 0.06)).toBe(false);
  });

  it('15% chance at age 34', () => {
    const player = makePlayer({ age: 34 });
    expect(shouldRetire(player, () => 0.14)).toBe(true);
    expect(shouldRetire(player, () => 0.16)).toBe(false);
  });

  it('35% chance at age 35', () => {
    const player = makePlayer({ age: 35 });
    expect(shouldRetire(player, () => 0.34)).toBe(true);
    expect(shouldRetire(player, () => 0.36)).toBe(false);
  });

  it('60% chance at age 36', () => {
    const player = makePlayer({ age: 36 });
    expect(shouldRetire(player, () => 0.59)).toBe(true);
    expect(shouldRetire(player, () => 0.61)).toBe(false);
  });

  it('85% chance at age 37+', () => {
    const player = makePlayer({ age: 38 });
    expect(shouldRetire(player, () => 0.84)).toBe(true);
    expect(shouldRetire(player, () => 0.86)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyAITrainingBoosts
// ---------------------------------------------------------------------------

describe('applyAITrainingBoosts', () => {
  it('boosts attributes for AI squad', () => {
    const rng = seedrandom('ai-test');
    const squad = [makePlayer({ id: 'p1', role: 'ST' }), makePlayer({ id: 'p2', role: 'CB' })];
    const result = applyAITrainingBoosts(squad, 'mid', rng);

    // At least one attribute should have improved on each player
    const p1Before = squad[0]!.attributes;
    const p1After = result[0]!.attributes;
    const anyImproved = Object.keys(p1Before).some(
      k => p1After[k as keyof PlayerAttributes] > p1Before[k as keyof PlayerAttributes]
    );
    expect(anyImproved).toBe(true);
  });

  it('stronger tiers get bigger boosts', () => {
    const rng1 = seedrandom('tier-test');
    const rng2 = seedrandom('tier-test');
    const squad = [makePlayer({ role: 'CM' })];

    const strongResult = applyAITrainingBoosts(squad, 'strong', rng1);
    const weakResult = applyAITrainingBoosts(squad, 'weak', rng2);

    // Sum of all attribute changes
    const sumGain = (result: PlayerState[]) =>
      Object.values(result[0]!.attributes).reduce((s, v, i) =>
        s + Math.max(0, v - Object.values(squad[0]!.attributes)[i]!), 0);

    expect(sumGain(strongResult)).toBeGreaterThan(sumGain(weakResult));
  });

  it('never exceeds 1.0', () => {
    const rng = seedrandom('cap-test');
    const squad = [makePlayer({ attributes: { pace: 0.99, shooting: 0.99 } })];
    const result = applyAITrainingBoosts(squad, 'strong', rng);
    for (const val of Object.values(result[0]!.attributes)) {
      expect(val).toBeLessThanOrEqual(1.0);
    }
  });

  it('does not mutate original squad', () => {
    const rng = seedrandom('immutable-test');
    const squad = [makePlayer()];
    const origPace = squad[0]!.attributes.pace;
    applyAITrainingBoosts(squad, 'mid', rng);
    expect(squad[0]!.attributes.pace).toBe(origPace);
  });
});

// ---------------------------------------------------------------------------
// applySeasonProgression (combined)
// ---------------------------------------------------------------------------

describe('applySeasonProgression', () => {
  it('increments age, applies decay and growth in one call', () => {
    const player = makePlayer({ age: 29, attributes: { pace: 0.80, positioning: 0.60 } });
    const result = applySeasonProgression(player);

    // Age incremented: 29 → 30
    expect(result.age).toBe(30);
    // Physical decay at age 30 (bracket 28-30): -0.008
    expect(result.attributes.pace).toBeCloseTo(0.792, 3);
    // Mental growth at age 30 (bracket 24-30): +0.015
    expect(result.attributes.positioning).toBeCloseTo(0.615, 3);
  });

  it('young player gets growth but no decay', () => {
    const player = makePlayer({ age: 22 });
    const result = applySeasonProgression(player);
    expect(result.age).toBe(23);
    // No decay under 28
    expect(result.attributes.pace).toBe(0.50);
    // Mental growth at age 23 (bracket <24): +0.010
    expect(result.attributes.positioning).toBeCloseTo(0.51, 3);
  });
});
