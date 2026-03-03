import type { AgentContext, ActionIntent, PersonalityVector, PersonalityWeightMatrix, ActionType } from '../types.ts';
import { gaussianNoise } from '../math/random.ts';
import { dotProduct } from './personality.ts';
import { TUNING } from '../tuning.ts';
import type { Action } from './actions.ts';

/**
 * Evaluates a single action's utility score for an agent.
 *
 * Pipeline:
 * 1. Compute consideration product (any zero kills the action)
 * 2. Apply compensation factor to correct product-toward-zero as N increases
 * 3. Add action-specific personality bonus via dot product
 * 4. Add Gaussian noise scaled by (1 - composure)
 *
 * Compensation factor formula — source: GDC 2015 "Building a Better Centaur":
 *   modFactor = 1 - (1 / N)
 *   makeUp    = (1 - product) * modFactor
 *   final     = product + makeUp * product
 */
export function evaluateAction(
  action: Action,
  ctx: AgentContext,
  personality: PersonalityVector,
  weights: PersonalityWeightMatrix,
  rng: () => number
): number {
  // Step 1: Product of all consideration scores
  let product = 1.0;
  for (const consideration of action.considerations) {
    product *= consideration(ctx);
    if (product === 0) break;
  }

  // Step 2: Compensation factor (only applied when N > 1)
  const n = action.considerations.length;
  if (n > 1 && product > 0) {
    const modFactor = 1.0 - (1.0 / n);
    const makeUp = (1.0 - product) * modFactor;
    product = product + makeUp * product;
  }

  // Step 3: Personality bonus
  const personalityBonus = dotProduct(weights[action.id], personality);

  // Step 4: Gaussian noise — reads TUNING.noiseScale live
  const noise = gaussianNoise(0, (1 - personality.composure) * TUNING.noiseScale, rng);

  return product + personalityBonus + noise;
}

/**
 * Selects the best action for an agent given its current context.
 * Evaluates all actions and returns an ActionIntent for the highest-scoring one.
 * Applies hysteresis bonus from TUNING to the previous action to prevent oscillation.
 */
export function selectAction(
  actions: readonly Action[],
  ctx: AgentContext,
  personality: PersonalityVector,
  weights: PersonalityWeightMatrix,
  rng: () => number,
  previousAction?: ActionType,
): ActionIntent {
  let bestAction = actions[0]!;
  let bestScore = -Infinity;

  for (const action of actions) {
    let score = evaluateAction(action, ctx, personality, weights, rng);
    // Hysteresis: bonus for continuing the current action — reads TUNING live
    if (previousAction !== undefined && action.id === previousAction) {
      score += TUNING.hysteresisBonus;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return {
    agentId: ctx.self.id,
    action: bestAction.id,
  };
}
