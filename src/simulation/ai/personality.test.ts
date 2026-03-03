import { describe, it, expect } from 'vitest';
import {
  PERSONALITY_WEIGHTS,
  dotProduct,
  personalityBonus,
  NOISE_SCALE,
} from './personality.ts';
import type { PersonalityVector } from '../types.ts';
import { ActionType } from '../types.ts';

// Baseline personality for tests
const neutralPersonality: PersonalityVector = {
  directness: 0.5,
  risk_appetite: 0.5,
  composure: 0.5,
  creativity: 0.5,
  work_rate: 0.5,
  aggression: 0.5,
  anticipation: 0.5,
  flair: 0.5,
};

const highDirectness: PersonalityVector = {
  ...neutralPersonality,
  directness: 1.0,
  risk_appetite: 0.2,
};

const lowDirectness: PersonalityVector = {
  ...neutralPersonality,
  directness: 0.0,
  risk_appetite: 0.8,
};

const highFlair: PersonalityVector = {
  ...neutralPersonality,
  flair: 1.0,
  risk_appetite: 0.8,
};

const highAggression: PersonalityVector = {
  ...neutralPersonality,
  aggression: 1.0,
  work_rate: 0.8,
};

describe('NOISE_SCALE', () => {
  it('should be 0.08', () => {
    expect(NOISE_SCALE).toBe(0.08);
  });
});

describe('PERSONALITY_WEIGHTS', () => {
  it('should have an entry for every ActionType', () => {
    for (const actionType of Object.values(ActionType)) {
      expect(PERSONALITY_WEIGHTS).toHaveProperty(actionType);
    }
  });

  it('should have positive directness weight for PASS_FORWARD', () => {
    const weights = PERSONALITY_WEIGHTS[ActionType.PASS_FORWARD];
    expect(weights.directness).toBeDefined();
    expect((weights.directness ?? 0)).toBeGreaterThan(0);
  });

  it('should have negative directness weight for PASS_SAFE (or zero)', () => {
    const weights = PERSONALITY_WEIGHTS[ActionType.PASS_SAFE];
    // directness should not favor safe passing — either negative or absent
    const d = weights.directness ?? 0;
    expect(d).toBeLessThanOrEqual(0);
  });

  it('should have high flair weight for DRIBBLE', () => {
    const weights = PERSONALITY_WEIGHTS[ActionType.DRIBBLE];
    expect(weights.flair).toBeDefined();
    expect((weights.flair ?? 0)).toBeGreaterThan(0.3);
  });

  it('should have high aggression weight for PRESS', () => {
    const weights = PERSONALITY_WEIGHTS[ActionType.PRESS];
    expect(weights.aggression).toBeDefined();
    expect((weights.aggression ?? 0)).toBeGreaterThan(0.3);
  });

  it('should have positive work_rate weight for MOVE_TO_POSITION', () => {
    const weights = PERSONALITY_WEIGHTS[ActionType.MOVE_TO_POSITION];
    expect(weights.work_rate).toBeDefined();
    expect((weights.work_rate ?? 0)).toBeGreaterThan(0);
  });
});

describe('dotProduct', () => {
  it('returns 0 for empty weights', () => {
    const result = dotProduct({}, neutralPersonality);
    expect(result).toBe(0);
  });

  it('computes correct dot product for single trait', () => {
    const result = dotProduct({ directness: 0.5 }, neutralPersonality);
    expect(result).toBeCloseTo(0.5 * 0.5);
  });

  it('computes correct dot product for multiple traits', () => {
    const result = dotProduct(
      { directness: 0.4, risk_appetite: 0.2 },
      neutralPersonality
    );
    expect(result).toBeCloseTo(0.4 * 0.5 + 0.2 * 0.5);
  });

  it('handles negative weights correctly', () => {
    const result = dotProduct({ directness: -0.3, composure: 0.3 }, neutralPersonality);
    expect(result).toBeCloseTo(-0.3 * 0.5 + 0.3 * 0.5);
  });

  it('returns larger value for higher trait values', () => {
    const low = dotProduct({ directness: 0.4 }, { ...neutralPersonality, directness: 0.1 });
    const high = dotProduct({ directness: 0.4 }, { ...neutralPersonality, directness: 0.9 });
    expect(high).toBeGreaterThan(low);
  });
});

describe('personalityBonus', () => {
  it('returns a number for every action type', () => {
    for (const actionType of Object.values(ActionType)) {
      const result = personalityBonus(actionType, neutralPersonality);
      expect(typeof result).toBe('number');
    }
  });

  it('high directness player prefers PASS_FORWARD over PASS_SAFE', () => {
    const forwardBonus = personalityBonus(ActionType.PASS_FORWARD, highDirectness);
    const safeBonus = personalityBonus(ActionType.PASS_SAFE, highDirectness);
    expect(forwardBonus).toBeGreaterThan(safeBonus);
  });

  it('low directness player prefers PASS_SAFE over PASS_FORWARD', () => {
    const forwardBonus = personalityBonus(ActionType.PASS_FORWARD, lowDirectness);
    const safeBonus = personalityBonus(ActionType.PASS_SAFE, lowDirectness);
    expect(safeBonus).toBeGreaterThan(forwardBonus);
  });

  it('high flair player prefers DRIBBLE over HOLD_SHIELD', () => {
    const dribbleBonus = personalityBonus(ActionType.DRIBBLE, highFlair);
    const shieldBonus = personalityBonus(ActionType.HOLD_SHIELD, highFlair);
    expect(dribbleBonus).toBeGreaterThan(shieldBonus);
  });

  it('high aggression player gets higher PRESS bonus', () => {
    const highAggBonus = personalityBonus(ActionType.PRESS, highAggression);
    const neutralAggBonus = personalityBonus(ActionType.PRESS, neutralPersonality);
    expect(highAggBonus).toBeGreaterThan(neutralAggBonus);
  });
});
