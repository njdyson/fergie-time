import { describe, it, expect } from 'vitest';
import {
  accumulateFatigue,
  applyFatigueToAttributes,
  applyFatigueToPersonality,
  CONSERVATIVE_DEFAULTS,
  ATTENUATION_FACTOR,
  EROSION_FACTOR,
} from './fatigue.ts';
import type { PlayerAttributes, PersonalityVector } from '../types.ts';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_ATTRS: PlayerAttributes = {
  pace: 0.8,
  strength: 0.7,
  stamina: 0.6,
  dribbling: 0.75,
  passing: 0.7,
  shooting: 0.65,
  tackling: 0.6,
  aerial: 0.5,
  positioning: 0.7,
};

const BASE_PERSONALITY: PersonalityVector = {
  directness: 0.9,
  risk_appetite: 0.8,
  composure: 0.7,
  creativity: 0.8,
  work_rate: 0.8,
  aggression: 0.9,
  anticipation: 0.7,
  flair: 0.8,
};

// Average stamina and work_rate for a "neutral" player
const AVG_STAMINA = 0.5;
const AVG_WORK_RATE = 0.5;

// ---------------------------------------------------------------------------
// CONSERVATIVE_DEFAULTS
// ---------------------------------------------------------------------------

describe('CONSERVATIVE_DEFAULTS', () => {
  it('has all PersonalityVector traits defined', () => {
    const traits: Array<keyof PersonalityVector> = [
      'directness', 'risk_appetite', 'composure', 'creativity',
      'work_rate', 'aggression', 'anticipation', 'flair',
    ];
    for (const trait of traits) {
      expect(CONSERVATIVE_DEFAULTS[trait]).toBeDefined();
      expect(CONSERVATIVE_DEFAULTS[trait]).toBeGreaterThanOrEqual(0);
      expect(CONSERVATIVE_DEFAULTS[trait]).toBeLessThanOrEqual(1);
    }
  });

  it('has low-to-moderate values representing cautious defaults', () => {
    // Conservative defaults represent cautious, low-risk behaviour
    expect(CONSERVATIVE_DEFAULTS.directness).toBeLessThan(0.5);
    expect(CONSERVATIVE_DEFAULTS.risk_appetite).toBeLessThan(0.4);
    expect(CONSERVATIVE_DEFAULTS.aggression).toBeLessThan(0.5);
    expect(CONSERVATIVE_DEFAULTS.flair).toBeLessThan(0.4);
  });

  it('matches the design spec values', () => {
    expect(CONSERVATIVE_DEFAULTS.directness).toBeCloseTo(0.3, 1);
    expect(CONSERVATIVE_DEFAULTS.risk_appetite).toBeCloseTo(0.2, 1);
    expect(CONSERVATIVE_DEFAULTS.composure).toBeCloseTo(0.4, 1);
    expect(CONSERVATIVE_DEFAULTS.creativity).toBeCloseTo(0.3, 1);
    expect(CONSERVATIVE_DEFAULTS.work_rate).toBeCloseTo(0.3, 1);
    expect(CONSERVATIVE_DEFAULTS.aggression).toBeCloseTo(0.3, 1);
    expect(CONSERVATIVE_DEFAULTS.anticipation).toBeCloseTo(0.5, 1);
    expect(CONSERVATIVE_DEFAULTS.flair).toBeCloseTo(0.2, 1);
  });
});

// ---------------------------------------------------------------------------
// ATTENUATION_FACTOR and EROSION_FACTOR
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('ATTENUATION_FACTOR is ~0.5', () => {
    expect(ATTENUATION_FACTOR).toBeCloseTo(0.5, 1);
  });

  it('EROSION_FACTOR is ~0.6', () => {
    expect(EROSION_FACTOR).toBeCloseTo(0.6, 1);
  });
});

// ---------------------------------------------------------------------------
// accumulateFatigue
// ---------------------------------------------------------------------------

describe('accumulateFatigue', () => {
  it('starts at 0 when currentFatigue is 0 and dt is 0', () => {
    const result = accumulateFatigue(0, 0, AVG_STAMINA, AVG_WORK_RATE, 0);
    expect(result).toBe(0);
  });

  it('increases fatigue over time during first 60 minutes', () => {
    // Simulate 45 minutes: 2700 match-seconds
    // call accumulateFatigue once per match-second with dt=1000ms
    let fatigue = 0;
    for (let tick = 0; tick < 2700; tick++) {
      fatigue = accumulateFatigue(fatigue, tick, AVG_STAMINA, AVG_WORK_RATE, 1000);
    }
    // At halftime, average stamina player should be between 0.15 and 0.25 fatigued
    expect(fatigue).toBeGreaterThan(0.10);
    expect(fatigue).toBeLessThan(0.30);
  });

  it('reaches higher fatigue at fulltime (90 min) than at halftime (45 min)', () => {
    let fatigue = 0;
    let halfTimeFatigue = 0;
    for (let tick = 0; tick < 5400; tick++) {
      fatigue = accumulateFatigue(fatigue, tick, AVG_STAMINA, AVG_WORK_RATE, 1000);
      if (tick === 2699) halfTimeFatigue = fatigue;
    }
    expect(fatigue).toBeGreaterThan(halfTimeFatigue);
    expect(fatigue).toBeGreaterThan(0.4); // well-fatigued at 90min
  });

  it('shows steep rate after tick 3600 (60 minutes)', () => {
    // Rate of accumulation should be noticeably higher after minute 60
    const preBurst = accumulateFatigue(0, 3599, AVG_STAMINA, AVG_WORK_RATE, 1000);
    const postBurst = accumulateFatigue(0, 3601, AVG_STAMINA, AVG_WORK_RATE, 1000);
    expect(postBurst).toBeGreaterThan(preBurst * 2);
  });

  it('high stamina player fatigues slower than low stamina player', () => {
    let highStaminaFatigue = 0;
    let lowStaminaFatigue = 0;
    const TICKS = 5400;
    for (let tick = 0; tick < TICKS; tick++) {
      highStaminaFatigue = accumulateFatigue(highStaminaFatigue, tick, 0.9, AVG_WORK_RATE, 1000);
      lowStaminaFatigue = accumulateFatigue(lowStaminaFatigue, tick, 0.2, AVG_WORK_RATE, 1000);
    }
    // High stamina should have meaningfully less fatigue at fulltime
    expect(highStaminaFatigue).toBeLessThan(lowStaminaFatigue);
    // The difference should be meaningful (not trivial)
    expect(lowStaminaFatigue - highStaminaFatigue).toBeGreaterThan(0.1);
  });

  it('high stamina (0.9) results in ~40% slower fatigue rate than stamina=0.5', () => {
    // staminaMod(0.9) = 1.5 - 0.9 = 0.6; staminaMod(0.5) = 1.5 - 0.5 = 1.0
    // ratio should be ~0.6x
    const singleTickHighStamina = accumulateFatigue(0, 30, 0.9, AVG_WORK_RATE, 1000);
    const singleTickAvgStamina = accumulateFatigue(0, 30, 0.5, AVG_WORK_RATE, 1000);
    const ratio = singleTickHighStamina / singleTickAvgStamina;
    expect(ratio).toBeCloseTo(0.6, 1);
  });

  it('low stamina (0.2) results in ~30% faster fatigue rate than stamina=0.5', () => {
    // staminaMod(0.2) = 1.5 - 0.2 = 1.3; staminaMod(0.5) = 1.0
    // ratio should be ~1.3x
    const singleTickLowStamina = accumulateFatigue(0, 30, 0.2, AVG_WORK_RATE, 1000);
    const singleTickAvgStamina = accumulateFatigue(0, 30, 0.5, AVG_WORK_RATE, 1000);
    const ratio = singleTickLowStamina / singleTickAvgStamina;
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it('high work rate player accumulates fatigue faster than low work rate player', () => {
    const highWorkRate = accumulateFatigue(0, 30, AVG_STAMINA, 0.9, 1000);
    const lowWorkRate = accumulateFatigue(0, 30, AVG_STAMINA, 0.1, 1000);
    expect(highWorkRate).toBeGreaterThan(lowWorkRate);
  });

  it('clamps fatigue to [0, 1]', () => {
    const result = accumulateFatigue(0.999, 5400, 0.1, 1.0, 1000);
    expect(result).toBeLessThanOrEqual(1.0);
    expect(result).toBeGreaterThanOrEqual(0.0);
  });

  it('never produces negative fatigue', () => {
    const result = accumulateFatigue(0, 0, 1.0, 0.0, 1000);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('at halftime, high-stamina player has fatigue ~0.10-0.20', () => {
    let fatigue = 0;
    for (let tick = 0; tick < 2700; tick++) {
      fatigue = accumulateFatigue(fatigue, tick, 0.9, AVG_WORK_RATE, 1000);
    }
    expect(fatigue).toBeGreaterThan(0.08);
    expect(fatigue).toBeLessThan(0.22);
  });

  it('at fulltime, low-stamina player has fatigue ~0.6-0.85', () => {
    let fatigue = 0;
    for (let tick = 0; tick < 5400; tick++) {
      fatigue = accumulateFatigue(fatigue, tick, 0.2, AVG_WORK_RATE, 1000);
    }
    expect(fatigue).toBeGreaterThan(0.55);
    expect(fatigue).toBeLessThan(0.90);
  });
});

// ---------------------------------------------------------------------------
// applyFatigueToAttributes
// ---------------------------------------------------------------------------

describe('applyFatigueToAttributes', () => {
  it('returns identical attributes for fatigue=0 (fresh player)', () => {
    const result = applyFatigueToAttributes(BASE_ATTRS, 0);
    expect(result.pace).toBeCloseTo(BASE_ATTRS.pace, 5);
    expect(result.strength).toBeCloseTo(BASE_ATTRS.strength, 5);
    expect(result.stamina).toBeCloseTo(BASE_ATTRS.stamina, 5);
    expect(result.dribbling).toBeCloseTo(BASE_ATTRS.dribbling, 5);
    expect(result.passing).toBeCloseTo(BASE_ATTRS.passing, 5);
    expect(result.shooting).toBeCloseTo(BASE_ATTRS.shooting, 5);
  });

  it('reduces physical attributes at fatigue=1.0', () => {
    const result = applyFatigueToAttributes(BASE_ATTRS, 1.0);
    // Physical: reduced by ~50% (ATTENUATION_FACTOR=0.5)
    expect(result.pace).toBeCloseTo(BASE_ATTRS.pace * 0.5, 2);
    expect(result.strength).toBeCloseTo(BASE_ATTRS.strength * 0.5, 2);
    expect(result.stamina).toBeCloseTo(BASE_ATTRS.stamina * 0.5, 2);
  });

  it('reduces technical attributes by a smaller amount at fatigue=1.0', () => {
    const result = applyFatigueToAttributes(BASE_ATTRS, 1.0);
    // Technical: reduced by ~20% (fatigue * 0.2)
    expect(result.dribbling).toBeCloseTo(BASE_ATTRS.dribbling * 0.8, 2);
    expect(result.passing).toBeCloseTo(BASE_ATTRS.passing * 0.8, 2);
    expect(result.shooting).toBeCloseTo(BASE_ATTRS.shooting * 0.8, 2);
    expect(result.tackling).toBeCloseTo(BASE_ATTRS.tackling * 0.8, 2);
  });

  it('physical attenuation is larger than technical attenuation at same fatigue', () => {
    const fatigue = 0.7;
    const result = applyFatigueToAttributes(BASE_ATTRS, fatigue);
    const physicalReduction = 1 - result.pace / BASE_ATTRS.pace;
    const technicalReduction = 1 - result.passing / BASE_ATTRS.passing;
    expect(physicalReduction).toBeGreaterThan(technicalReduction);
  });

  it('at fatigue=0.5, pace is visibly lower than base pace', () => {
    const result = applyFatigueToAttributes(BASE_ATTRS, 0.5);
    expect(result.pace).toBeLessThan(BASE_ATTRS.pace * 0.9); // at least 10% reduction
    expect(result.pace).toBeGreaterThan(BASE_ATTRS.pace * 0.6); // not catastrophic
  });

  it('returns a new object (immutable — does not mutate base)', () => {
    const basesCopy = { ...BASE_ATTRS };
    applyFatigueToAttributes(BASE_ATTRS, 0.8);
    // Base should be unchanged
    expect(BASE_ATTRS.pace).toBe(basesCopy.pace);
    expect(BASE_ATTRS.strength).toBe(basesCopy.strength);
  });

  it('all returned attributes are in range [0, 1]', () => {
    const result = applyFatigueToAttributes(BASE_ATTRS, 1.0);
    for (const val of Object.values(result)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('positioning attribute is also affected (technical)', () => {
    const result = applyFatigueToAttributes(BASE_ATTRS, 1.0);
    expect(result.positioning).toBeCloseTo(BASE_ATTRS.positioning * 0.8, 2);
  });
});

// ---------------------------------------------------------------------------
// applyFatigueToPersonality
// ---------------------------------------------------------------------------

describe('applyFatigueToPersonality', () => {
  it('returns identical personality for fatigue=0', () => {
    const result = applyFatigueToPersonality(BASE_PERSONALITY, 0);
    expect(result.directness).toBeCloseTo(BASE_PERSONALITY.directness, 5);
    expect(result.risk_appetite).toBeCloseTo(BASE_PERSONALITY.risk_appetite, 5);
    expect(result.composure).toBeCloseTo(BASE_PERSONALITY.composure, 5);
    expect(result.aggression).toBeCloseTo(BASE_PERSONALITY.aggression, 5);
  });

  it('shifts personality toward conservative defaults at fatigue=1.0', () => {
    const result = applyFatigueToPersonality(BASE_PERSONALITY, 1.0);
    // directness: lerp(0.9, 0.3, 1.0 * 0.6) = lerp(0.9, 0.3, 0.6) = 0.9 + 0.6*(0.3-0.9) = 0.9 - 0.36 = 0.54
    expect(result.directness).toBeCloseTo(0.54, 2);
    // aggression: lerp(0.9, 0.3, 0.6) = 0.54
    expect(result.aggression).toBeCloseTo(0.54, 2);
  });

  it('maverick directness (0.9) shifts to ~0.54 at full fatigue', () => {
    const result = applyFatigueToPersonality(BASE_PERSONALITY, 1.0);
    expect(result.directness).toBeCloseTo(0.54, 2);
  });

  it('highly aggressive player (0.9) shifts toward lower aggression at full fatigue', () => {
    const result = applyFatigueToPersonality(BASE_PERSONALITY, 1.0);
    expect(result.aggression).toBeLessThan(BASE_PERSONALITY.aggression);
    expect(result.aggression).toBeCloseTo(0.54, 2);
  });

  it('does not over-shift — personality cannot go past conservative defaults at fatigue=1', () => {
    const result = applyFatigueToPersonality(BASE_PERSONALITY, 1.0);
    // EROSION_FACTOR=0.6, so max shift is 60% toward conservative
    // For directness=0.9 → result should still be above conservative (0.3)
    expect(result.directness).toBeGreaterThan(CONSERVATIVE_DEFAULTS.directness);
  });

  it('erosion is stronger at higher fatigue values', () => {
    const halfFatigue = applyFatigueToPersonality(BASE_PERSONALITY, 0.5);
    const fullFatigue = applyFatigueToPersonality(BASE_PERSONALITY, 1.0);
    // directness should shift more at full fatigue
    const halfShift = Math.abs(halfFatigue.directness - BASE_PERSONALITY.directness);
    const fullShift = Math.abs(fullFatigue.directness - BASE_PERSONALITY.directness);
    expect(fullShift).toBeGreaterThan(halfShift);
  });

  it('returns a new object (immutable — does not mutate base)', () => {
    const copy = { ...BASE_PERSONALITY };
    applyFatigueToPersonality(BASE_PERSONALITY, 0.8);
    expect(BASE_PERSONALITY.directness).toBe(copy.directness);
    expect(BASE_PERSONALITY.aggression).toBe(copy.aggression);
  });

  it('all returned traits are in [0, 1]', () => {
    const result = applyFatigueToPersonality(BASE_PERSONALITY, 1.0);
    for (const val of Object.values(result)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('a player already at conservative defaults has no erosion effect', () => {
    const result = applyFatigueToPersonality(CONSERVATIVE_DEFAULTS, 1.0);
    for (const key of Object.keys(CONSERVATIVE_DEFAULTS) as Array<keyof PersonalityVector>) {
      expect(result[key]).toBeCloseTo(CONSERVATIVE_DEFAULTS[key], 5);
    }
  });

  it('erosion is per-tick (based on base, not accumulated)', () => {
    // Applying twice should give same result as applying once — not cumulative
    const once = applyFatigueToPersonality(BASE_PERSONALITY, 0.8);
    const twiceFromBase = applyFatigueToPersonality(BASE_PERSONALITY, 0.8);
    expect(once.directness).toBeCloseTo(twiceFromBase.directness, 5);

    // But applying to already-modified personality would compound — document this as expected behavior
    const fromEroded = applyFatigueToPersonality(once, 0.8);
    // fromEroded should differ from BASE result
    expect(fromEroded.directness).not.toBeCloseTo(once.directness, 1);
  });
});

// ---------------------------------------------------------------------------
// Full match simulation integration
// ---------------------------------------------------------------------------

describe('full match simulation', () => {
  it('high-stamina and low-stamina curves diverge over 90 minutes', () => {
    let highStaminaFatigue = 0;
    let lowStaminaFatigue = 0;

    const TICKS = 5400;
    for (let tick = 0; tick < TICKS; tick++) {
      highStaminaFatigue = accumulateFatigue(highStaminaFatigue, tick, 0.9, 0.5, 1000);
      lowStaminaFatigue = accumulateFatigue(lowStaminaFatigue, tick, 0.2, 0.5, 1000);
    }

    // They should diverge meaningfully
    const divergence = lowStaminaFatigue - highStaminaFatigue;
    expect(divergence).toBeGreaterThan(0.15);

    // Both should show meaningful fatigue but not be identical
    expect(highStaminaFatigue).toBeGreaterThan(0.2);
    expect(lowStaminaFatigue).toBeGreaterThan(0.4);
  });

  it('high-stamina player attributes at fulltime are better than low-stamina', () => {
    let highStaminaFatigue = 0;
    let lowStaminaFatigue = 0;

    for (let tick = 0; tick < 5400; tick++) {
      highStaminaFatigue = accumulateFatigue(highStaminaFatigue, tick, 0.9, 0.5, 1000);
      lowStaminaFatigue = accumulateFatigue(lowStaminaFatigue, tick, 0.2, 0.5, 1000);
    }

    const highStaminaAttrs = applyFatigueToAttributes(BASE_ATTRS, highStaminaFatigue);
    const lowStaminaAttrs = applyFatigueToAttributes(BASE_ATTRS, lowStaminaFatigue);

    // High stamina player should run faster at fulltime
    expect(highStaminaAttrs.pace).toBeGreaterThan(lowStaminaAttrs.pace);
  });

  it('tired player personality is more conservative than fresh personality', () => {
    const freshPersonality = applyFatigueToPersonality(BASE_PERSONALITY, 0);
    const tiredPersonality = applyFatigueToPersonality(BASE_PERSONALITY, 0.8);

    // Tired player should have lower directness and risk_appetite
    expect(tiredPersonality.directness).toBeLessThan(freshPersonality.directness);
    expect(tiredPersonality.risk_appetite).toBeLessThan(freshPersonality.risk_appetite);
    expect(tiredPersonality.aggression).toBeLessThan(freshPersonality.aggression);
  });
});
