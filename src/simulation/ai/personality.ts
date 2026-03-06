import type { PersonalityVector, PersonalityWeightMatrix } from '../types.ts';
import { ActionType } from '../types.ts';

/**
 * Noise scale constant for composure-based Gaussian noise.
 * Recommendation from research: start at 0.08 and tune from match output.
 * Source: Phase 1 research — noiseScale ~0.05-0.15
 */
export const NOISE_SCALE = 0.12;

/**
 * Action-specific personality weight matrix.
 * Each action maps personality trait names to contribution weights.
 * Positive weights increase the action's personality bonus for high trait values.
 * Negative weights decrease the bonus (i.e., the trait discourages that action).
 *
 * Source: .planning/phases/01-engine-core/01-RESEARCH.md Pattern 5
 * Adapted to use ActionType const values instead of string keys.
 */
/**
 * Personality weight matrix.
 * Weights are scaled so the maximum dot product at full trait value (~0.15-0.20)
 * acts as a meaningful but not dominant additive bonus on top of the consideration product.
 * Source: research Pattern 5, scaled to keep personality in [0..0.20] contribution range.
 */
export const PERSONALITY_WEIGHTS: PersonalityWeightMatrix = {
  [ActionType.PASS_FORWARD]: {
    directness: 0.12,
    risk_appetite: 0.06,
    creativity: 0.03,
  },
  [ActionType.PASS_SAFE]: {
    directness: -0.09,
    composure: 0.09,
    work_rate: 0.03,
  },
  [ActionType.PASS_THROUGH]: {
    directness: 0.12,
    risk_appetite: 0.09,
    creativity: 0.06,
    composure: 0.03,
  },
  [ActionType.DRIBBLE]: {
    flair: 0.15,
    risk_appetite: 0.09,
    directness: 0.06,
  },
  [ActionType.SHOOT]: {
    risk_appetite: 0.12,
    directness: 0.06,
    composure: 0.03,
  },
  [ActionType.HOLD_SHIELD]: {
    composure: 0.12,
    work_rate: 0.06,
    risk_appetite: -0.09,
  },
  [ActionType.MOVE_TO_POSITION]: {
    work_rate: 0.15,
    anticipation: 0.09,
  },
  [ActionType.OFFER_SUPPORT]: {
    work_rate: 0.12,
    anticipation: 0.09,
    creativity: 0.05,
    composure: 0.04,
  },
  [ActionType.PRESS]: {
    aggression: 0.15,
    work_rate: 0.09,
    anticipation: 0.06,
  },
  [ActionType.MAKE_RUN]: {
    directness: 0.12,
    risk_appetite: 0.09,
    flair: 0.06,
  },
};

/**
 * Computes the dot product of a sparse weight map and a full personality vector.
 * Only iterates over traits defined in weights — undefined weights contribute 0.
 *
 * @param weights - Partial trait weights for a specific action
 * @param p - Full personality vector for the agent
 * @returns The weighted sum of personality contributions
 */
export function dotProduct(
  weights: Partial<Record<keyof PersonalityVector, number>>,
  p: PersonalityVector
): number {
  let sum = 0;
  for (const key of Object.keys(weights) as Array<keyof PersonalityVector>) {
    const w = weights[key];
    if (w !== undefined) {
      sum += w * p[key];
    }
  }
  return sum;
}

/**
 * Convenience wrapper: returns the personality bonus for a specific action type.
 * Uses PERSONALITY_WEIGHTS for the action's weight map.
 *
 * @param actionType - The action being evaluated
 * @param personality - The agent's personality vector
 * @returns Additive personality bonus (can be negative)
 */
export function personalityBonus(
  actionType: (typeof ActionType)[keyof typeof ActionType],
  personality: PersonalityVector
): number {
  return dotProduct(PERSONALITY_WEIGHTS[actionType], personality);
}
