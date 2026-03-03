import type { AgentContext, ActionIntent, PersonalityVector, PersonalityWeightMatrix, ActionType } from '../types.ts';
import { gaussianNoise } from '../math/random.ts';
import { dotProduct, NOISE_SCALE } from './personality.ts';
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
 *
 * @param action - Action definition with consideration functions
 * @param ctx - The agent's current world context
 * @param personality - The agent's personality vector
 * @param weights - Personality weight matrix for all actions
 * @param rng - Seeded random number generator (for reproducibility)
 * @returns Utility score — can be negative due to noise or negative personality weights
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
    // Short-circuit: once a hard disqualifier returns 0, product stays 0
    if (product === 0) break;
  }

  // Step 2: Compensation factor (only applied when N > 1)
  const n = action.considerations.length;
  if (n > 1 && product > 0) {
    const modFactor = 1.0 - (1.0 / n);
    const makeUp = (1.0 - product) * modFactor;
    product = product + makeUp * product;
  }

  // Step 3: Personality bonus (action-specific dot product)
  const personalityBonus = dotProduct(weights[action.id], personality);

  // Step 4: Gaussian noise scaled by (1 - composure)
  //         High composure → low stdDev → consistent decisions
  //         Low composure → high stdDev → erratic decisions
  const noise = gaussianNoise(0, (1 - personality.composure) * NOISE_SCALE, rng);

  return product + personalityBonus + noise;
}

/**
 * Hysteresis bonus added to the score of the agent's previous action.
 * Prevents oscillation by requiring a new action to beat the current one by this margin.
 * Value of 0.12 means ~12% advantage to current action — enough to prevent jitter
 * from noise and minor context changes, but not enough to lock into bad decisions.
 */
export const HYSTERESIS_BONUS = 0.12;

/**
 * Selects the best action for an agent given its current context.
 * Evaluates all actions and returns an ActionIntent for the highest-scoring one.
 *
 * This is the core agent decision loop — called once per tick per player.
 *
 * @param actions - All available actions (typically the full ACTIONS array)
 * @param ctx - The agent's current world context
 * @param personality - The agent's personality vector
 * @param weights - Personality weight matrix for all actions
 * @param rng - Seeded random number generator
 * @param previousAction - The action this agent selected last tick (for hysteresis)
 * @returns ActionIntent identifying the selected action and the acting agent
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
    // Hysteresis: bonus for continuing the current action
    if (previousAction !== undefined && action.id === previousAction) {
      score += HYSTERESIS_BONUS;
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
