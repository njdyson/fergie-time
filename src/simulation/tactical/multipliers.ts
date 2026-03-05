import type { ActionType, PlayerTacticalMultipliers } from '../types.ts';

// ============================================================
// Tactical multiplier → action score bonuses
// ============================================================

/**
 * Per-player tactical instruction multipliers.
 * Each multiplier is 0..1 with 0.5 = neutral.
 * Returns an additive bonus in the -0.1..+0.1 range for most actions,
 * applied in selectAction alongside duty modifiers and personality bonuses.
 *
 * Mapping:
 *   risk       → SHOOT +, PASS_FORWARD +, DRIBBLE +, PASS_SAFE -
 *   directness → PASS_FORWARD +, MAKE_RUN +, PASS_SAFE -
 *   press      → PRESS + (0 to +0.25)
 *   holdUp     → HOLD_SHIELD + (0 to +0.20)
 *   dribble    → DRIBBLE +, PASS_FORWARD -, PASS_SAFE -
 *   freedom    → MOVE_TO_POSITION - (inverse), MAKE_RUN +
 *   decisionWindow → not applied here (affects hysteresis in selectAction)
 */
export function getTacticalMultiplierBonus(
  actionType: ActionType,
  multipliers: PlayerTacticalMultipliers,
): number {
  // Convert 0..1 to -1..+1 centred on 0.5
  const risk = (multipliers.risk - 0.5) * 2;           // -1..+1
  const dir = (multipliers.directness - 0.5) * 2;       // -1..+1
  const drib = (multipliers.dribble - 0.5) * 2;         // -1..+1

  // Max bonus magnitude per lever: 0.2 (doubled from 0.1 to make tactical
  // instructions competitive with hysteresis/passBias/goalUrgency)
  const SCALE = 0.2;

  let bonus = 0;

  switch (actionType) {
    case 'SHOOT':
      bonus += risk * SCALE;
      break;
    case 'PASS_FORWARD':
      bonus += risk * SCALE * 0.5;    // risk contributes half-weight to forward passing
      bonus += dir * SCALE;            // directness is the main lever
      bonus -= drib * SCALE * 0.5;    // high dribble reduces passing preference
      break;
    case 'PASS_SAFE':
      bonus -= risk * SCALE;          // high risk discourages safe passes
      bonus -= dir * SCALE * 0.7;     // high directness discourages recycling
      bonus -= drib * SCALE * 0.5;    // high dribble reduces passing preference
      break;
    case 'DRIBBLE':
      bonus += risk * SCALE * 0.5;    // risk contributes to dribble willingness
      bonus += drib * SCALE;           // main dribble lever
      break;
    case 'HOLD_SHIELD':
      // holdUp: 0..1 → 0..+0.20
      bonus += multipliers.holdUp * 0.20;
      break;
    case 'PRESS':
      // press: 0..1 → 0..+0.25
      bonus += multipliers.press * 0.25;
      break;
    case 'MAKE_RUN':
      bonus += dir * SCALE;            // directness drives forward runs
      bonus += risk * SCALE * 0.5;     // risk contributes to run willingness
      // freedom boosts off-ball runs: roaming players seek space
      bonus += (multipliers.freedom - 0.5) * 0.15;
      break;
    case 'MOVE_TO_POSITION':
      // freedom: 0 (hold) → +0.15 bonus, 1 (roam) → -0.15 penalty
      // Low freedom = stronger positional discipline, high freedom = less pull to anchor
      bonus -= (multipliers.freedom - 0.5) * 0.3;
      break;
  }

  return bonus;
}
