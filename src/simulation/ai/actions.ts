import type { AgentContext } from '../types.ts';
import { ActionType } from '../types.ts';
import { sigmoid, exponentialDecay, linear } from '../math/curves.ts';
import { TUNING } from '../tuning.ts';

/**
 * A consideration function takes the agent's world context and returns a score in [0..1].
 * A score of 0 means "completely inappropriate"; 1 means "ideal conditions for this action".
 * Hard disqualifiers return 0 immediately when an action is physically impossible.
 */
export type ConsiderationFn = (ctx: AgentContext) => number;

/**
 * An action definition: identifies the action type and lists its consideration functions.
 * The evaluation pipeline multiplies all considerations (with compensation factor) to produce a raw score.
 */
export interface Action {
  readonly id: (typeof ActionType)[keyof typeof ActionType];
  readonly considerations: readonly ConsiderationFn[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: does this agent currently carry the ball?
// ─────────────────────────────────────────────────────────────────────────────
function agentHasBall(ctx: AgentContext): boolean {
  return ctx.ball.carrierId === ctx.self.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOOT — strike at goal
// ─────────────────────────────────────────────────────────────────────────────
const shootConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 1 : 0,
  (ctx) => 1 - sigmoid(ctx.distanceToOpponentGoal / 105, 20, 0.24),
  (ctx) => ctx.self.attributes.shooting,
  // Defender proximity: penalise when defenders are close, BUT reduce the penalty
  // when near goal — a striker through on goal should still shoot with a trailing defender
  (ctx) => {
    const defenderScore = 1 - exponentialDecay(ctx.nearestDefenderDistance / 30, 2);
    const goalProximity = Math.max(0, 1 - ctx.distanceToOpponentGoal / 25);
    return defenderScore + (1 - defenderScore) * goalProximity * 0.7;
  },
  // GK position: boost when keeper is off their line (easier to score / chip)
  (ctx) => {
    const gk = ctx.opponents.find(p => p.role === 'GK');
    if (!gk) return 1; // no GK = open goal
    const goalX = ctx.self.teamId === 'home' ? 105 : 0;
    const gkDistFromGoal = Math.abs(gk.position.x - goalX);
    // GK on line (~0m): 0.5 (neutral). GK 15m+ out: 1.0 (should shoot)
    return Math.min(1, 0.5 + gkDistFromGoal / 30);
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PASS_FORWARD — play ball forward into space / to advanced teammate
// ─────────────────────────────────────────────────────────────────────────────
const passForwardConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 1 : 0,
  (ctx) => linear(ctx.distanceToOpponentGoal / 105, 0.6, 0.2),
  (ctx) => ctx.self.attributes.passing,
  (ctx) => exponentialDecay(ctx.nearestTeammateDistance / 50, 1.5),
];

// ─────────────────────────────────────────────────────────────────────────────
// PASS_SAFE — sideways/backward pass to maintain possession
// ─────────────────────────────────────────────────────────────────────────────
const passSafeConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 1 : 0,
  (ctx) => 1 - exponentialDecay(1 / Math.max(ctx.nearestDefenderDistance, 0.5), 2),
  (ctx) => ctx.self.attributes.passing,
  (ctx) => exponentialDecay(ctx.nearestTeammateDistance / 50, 1.5),
];

// ─────────────────────────────────────────────────────────────────────────────
// DRIBBLE — take on the defender with the ball
// ─────────────────────────────────────────────────────────────────────────────
const dribbleConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 1 : 0,
  (ctx) => 1 - exponentialDecay(ctx.nearestDefenderDistance / 30, 0.8),
  (ctx) => ctx.self.attributes.dribbling,
  (ctx) => linear(1 - ctx.distanceToOpponentGoal / 105, 0.7, 0.3),
];

// ─────────────────────────────────────────────────────────────────────────────
// HOLD_SHIELD — shield ball, buy time, wait for support
// ─────────────────────────────────────────────────────────────────────────────
const holdShieldConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 1 : 0,
  (ctx) => 1 - exponentialDecay(1 / Math.max(ctx.nearestDefenderDistance, 0.5), 3),
  (ctx) => ctx.self.attributes.strength,
  (ctx) => exponentialDecay(ctx.nearestTeammateDistance / 30, 1.2),
  // Discourage shielding deep in own half — defenders should distribute, not hold indefinitely
  (ctx) => linear(1 - ctx.distanceToOpponentGoal / 105, 0.5, 0.5),
];

// ─────────────────────────────────────────────────────────────────────────────
// MOVE_TO_POSITION — return to / maintain tactical formation position
// ─────────────────────────────────────────────────────────────────────────────
// Reads TUNING.moveToPosIntercept and TUNING.moveToPosSlope live
const moveToPositionConsiderations: readonly ConsiderationFn[] = [
  (ctx) => linear(ctx.distanceToFormationAnchor / 40, TUNING.moveToPosSlope, TUNING.moveToPosIntercept),
  (ctx) => agentHasBall(ctx) ? 0.1 : 1.0,
  (ctx) => ctx.self.attributes.positioning,
];

// ─────────────────────────────────────────────────────────────────────────────
// PRESS — aggressively pressure the ball carrier
// ─────────────────────────────────────────────────────────────────────────────
// Reads TUNING.pressDecayK and TUNING.pressNorm live
const pressConsiderations: readonly ConsiderationFn[] = [
  (ctx) => ctx.isInPossessionTeam ? 0 : 1,
  (ctx) => {
    const norm = ctx.ball.carrierId === null
      ? TUNING.pressNorm * TUNING.looseBallPressBoost
      : TUNING.pressNorm;
    return exponentialDecay(ctx.distanceToBall / norm, TUNING.pressDecayK);
  },
  (ctx) => linear(ctx.distanceToOpponentGoal / 105, 0.6, 0.2),
  (ctx) => ctx.self.attributes.tackling,
  // Press rank: penalise if teammates are already closer to ball (prevents clumping)
  (ctx) => {
    const myDist = ctx.distanceToBall;
    let closerCount = 0;
    for (const tm of ctx.teammates) {
      if (tm.position.distanceTo(ctx.ball.position) < myDist) closerCount++;
    }
    return Math.pow(TUNING.pressRankDecay, closerCount);
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAKE_RUN — off-ball run into space to receive a pass
// ─────────────────────────────────────────────────────────────────────────────
const makeRunConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 0 : 1,
  (ctx) => ctx.isInPossessionTeam ? 1 : 0.1,
  (ctx) => linear(ctx.distanceToOpponentGoal / 105, 0.5, 0.3),
  (ctx) => ctx.self.attributes.pace,
];

// ─────────────────────────────────────────────────────────────────────────────
// ACTIONS array — the complete set of actions evaluated every tick
// ─────────────────────────────────────────────────────────────────────────────
export const ACTIONS: readonly Action[] = [
  { id: ActionType.SHOOT, considerations: shootConsiderations },
  { id: ActionType.PASS_FORWARD, considerations: passForwardConsiderations },
  { id: ActionType.PASS_SAFE, considerations: passSafeConsiderations },
  { id: ActionType.DRIBBLE, considerations: dribbleConsiderations },
  { id: ActionType.HOLD_SHIELD, considerations: holdShieldConsiderations },
  { id: ActionType.MOVE_TO_POSITION, considerations: moveToPositionConsiderations },
  { id: ActionType.PRESS, considerations: pressConsiderations },
  { id: ActionType.MAKE_RUN, considerations: makeRunConsiderations },
];
