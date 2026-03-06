import type { AgentContext, ActionIntent, PersonalityVector, PersonalityWeightMatrix, ActionType, PlayerTacticalMultipliers } from '../types.ts';
import { gaussianNoise } from '../math/random.ts';
import { dotProduct } from './personality.ts';
import { TUNING } from '../tuning.ts';
import { getTacticalMultiplierBonus } from '../tactical/multipliers.ts';
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
  // Concentration amplifies noise under fatigue: low concentration + high fatigue = noisier decisions
  const fatigueConcentrationPenalty = ctx.self.fatigue * (1 - (ctx.self.attributes.concentration ?? 0.65)) * 0.5;
  const noise = gaussianNoise(0, (1 - personality.composure) * (1 + fatigueConcentrationPenalty) * TUNING.noiseScale, rng);

  return product + personalityBonus + noise;
}

/**
 * Selects the best action for an agent given its current context.
 * Evaluates all actions and returns an ActionIntent for the highest-scoring one.
 * Applies hysteresis bonus from TUNING to the previous action to prevent oscillation.
 *
 * @param dutyModifier - Optional function that returns an additive bonus for each action type.
 *                       Used to apply role/duty weight modifiers from the tactical system.
 *                       If omitted, no duty bonus is applied (backward-compatible).
 * @param tacticalMultipliers - Optional per-player tactical instruction multipliers (V1 overhaul).
 *                              Adds bonuses based on risk, directness, press, holdUp, dribble settings.
 *                              decisionWindow affects hysteresis (tighter = less sticky decisions).
 */
export function selectAction(
  actions: readonly Action[],
  ctx: AgentContext,
  personality: PersonalityVector,
  weights: PersonalityWeightMatrix,
  rng: () => number,
  previousAction?: ActionType,
  dutyModifier?: (actionType: ActionType) => number,
  tacticalMultipliers?: PlayerTacticalMultipliers,
): ActionIntent {
  let bestAction = actions[0]!;
  let bestScore = -Infinity;

  // Decision window affects hysteresis: quick (1.0) = 0x hysteresis, patient (0.0) = full hysteresis
  const hysteresisScale = tacticalMultipliers
    ? 1 - tacticalMultipliers.decisionWindow
    : 1;

  for (const action of actions) {
    let score = evaluateAction(action, ctx, personality, weights, rng);
    // Hysteresis: bonus for continuing the current action — reads TUNING live
    // Scaled by decision window: quicker decisions = less action stickiness
    if (previousAction !== undefined && action.id === previousAction) {
      score += TUNING.hysteresisBonus * hysteresisScale;
    }
    // Pass bias: flat bonus to encourage passing over dribbling/shielding
    // Kill pass bias inside 15m — carrier should shoot, not pass into the goal
    if (action.id === 'PASS_FORWARD' || action.id === 'PASS_SAFE' || action.id === 'PASS_THROUGH') {
      const goalDist = ctx.distanceToOpponentGoal;
      const baseScale = goalDist < 15 ? 0 : goalDist < 25 ? (goalDist - 15) / 10 : 1;
      if (action.id === 'PASS_SAFE') {
        const pressureScale = Math.max(0, 1 - ctx.nearestDefenderDistance / 10);
        score += TUNING.passBias * 0.45 * baseScale * pressureScale;
      } else if (action.id === 'PASS_FORWARD') {
        score += TUNING.passBias * 0.75 * baseScale;
      } else {
        score += TUNING.passBias * 0.35 * baseScale;
      }
    }
    // Goal urgency: proximity-scaled bonus for attacking actions near opponent goal
    if (action.id === 'SHOOT' || action.id === 'DRIBBLE') {
      score += TUNING.goalUrgency * (1 - ctx.distanceToOpponentGoal / 105);
    }
    if (action.id === 'OFFER_SUPPORT') {
      const supportNeed = ctx.isInPossessionTeam ? Math.max(0, 1 - ctx.nearestTeammateDistance / 18) : 0;
      score += 0.08 * supportNeed;
    }
    // Duty modifier: role/duty specific bonus from tactical configuration
    if (dutyModifier) {
      score += dutyModifier(action.id);
    }
    // Tactical multiplier bonus: per-player instruction overrides (V1 overhaul)
    if (tacticalMultipliers) {
      score += getTacticalMultiplierBonus(action.id, tacticalMultipliers);
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
