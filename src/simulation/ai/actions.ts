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

function teammatePassWindowScore(distance: number): number {
  if (distance < 3) return 0.08;
  if (distance < 6) return 0.25 + ((distance - 3) / 3) * 0.35;
  if (distance <= 18) return 0.6 + ((distance - 6) / 12) * 0.35;
  if (distance <= 28) return 0.95 - ((distance - 18) / 10) * 0.45;
  return 0.5;
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
  // Goal angle: penalize shots from acute angles (near the byline / corner flag).
  // dx/distance → 0 on the byline (impossible angle), → 1 head-on.
  (ctx) => {
    const goalX = ctx.self.teamId === 'home' ? 105 : 0;
    const dx = Math.abs(ctx.self.position.x - goalX);
    const ratio = dx / Math.max(ctx.distanceToOpponentGoal, 0.1);
    return Math.min(1, ratio * 2);
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PASS_FORWARD — play ball forward into space / to advanced teammate
// ─────────────────────────────────────────────────────────────────────────────
const passForwardConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 1 : 0,
  (ctx) => linear(ctx.distanceToOpponentGoal / 105, 0.6, 0.2),
  (ctx) => ctx.self.attributes.passing,
  (ctx) => teammatePassWindowScore(ctx.nearestTeammateDistance),
];

// ─────────────────────────────────────────────────────────────────────────────
// PASS_SAFE — sideways/backward pass to maintain possession
// ─────────────────────────────────────────────────────────────────────────────
const passSafeConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 1 : 0,
  (ctx) => 1 - exponentialDecay(1 / Math.max(ctx.nearestDefenderDistance, 0.5), 2),
  (ctx) => ctx.self.attributes.passing,
  (ctx) => teammatePassWindowScore(ctx.nearestTeammateDistance),
  (ctx) => ctx.nearestDefenderDistance < 9 ? 1 : 0.45,
];

// ─────────────────────────────────────────────────────────────────────────────
// PASS_THROUGH — play ball into space ahead of a running teammate
// ─────────────────────────────────────────────────────────────────────────────
const passThroughConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 1 : 0,
  // Vision attribute: need to see the run
  (ctx) => ctx.self.attributes.vision,
  // Passing attribute
  (ctx) => ctx.self.attributes.passing * 0.8 + 0.2,
  // Requires a teammate running toward goal (velocity > 3 m/s forward component)
  (ctx) => {
    const goalX = ctx.self.teamId === 'home' ? 105 : 0;
    const forwardSign = ctx.self.teamId === 'home' ? 1 : -1;
    let bestRunner = 0;
    for (const tm of ctx.teammates) {
      const forwardVel = tm.velocity.x * forwardSign;
      if (forwardVel < 3) continue;
      // Runner must be more advanced than passer
      const tmAdvance = Math.abs(tm.position.x - goalX);
      const selfAdvance = Math.abs(ctx.self.position.x - goalX);
      if (tmAdvance > selfAdvance) continue; // runner is behind us (closer to own goal)
      // Check space ahead: nearest opponent to runner in run direction
      let spaceAhead = 30; // assume space unless we find a defender
      for (const opp of ctx.opponents) {
        const oppDist = tm.position.distanceTo(opp.position);
        const oppAhead = (opp.position.x - tm.position.x) * forwardSign;
        if (oppAhead > 0 && oppDist < spaceAhead) {
          spaceAhead = oppDist;
        }
      }
      // Score: need at least 5m space ahead, more space = better
      const spaceScore = spaceAhead > 5 ? Math.min(1, (spaceAhead - 5) / 15) : 0;
      bestRunner = Math.max(bestRunner, spaceScore);
    }
    return bestRunner;
  },
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
  (ctx) => {
    if (agentHasBall(ctx)) return 0.1;
    const role = ctx.self.role;
    const attackingRole = role === 'ST' || role === 'LW' || role === 'RW' || role === 'CAM' || role === 'CM';
    if (ctx.isInPossessionTeam && attackingRole) return 0.42;
    return 1.0;
  },
  (ctx) => ctx.self.attributes.positioning,
];

const offerSupportConsiderations: readonly ConsiderationFn[] = [
  (ctx) => agentHasBall(ctx) ? 0 : 1,
  (ctx) => ctx.isInPossessionTeam ? 1 : 0.12,
  (ctx) => {
    const role = ctx.self.role;
    if (role === 'GK' || role === 'CB') return 0.15;
    if (role === 'LB' || role === 'RB' || role === 'CDM') return 0.55;
    if (role === 'CM' || role === 'CAM') return 0.95;
    if (role === 'LW' || role === 'RW' || role === 'ST') return 0.85;
    return 0.7;
  },
  (ctx) => {
    const d = ctx.nearestTeammateDistance;
    if (d < 5) return 0.2;
    if (d < 10) return 0.55;
    if (d < 22) return 1;
    if (d < 32) return 0.7;
    return 0.45;
  },
  (ctx) => ctx.self.attributes.positioning * 0.55 + ctx.self.attributes.vision * 0.45,
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
  // GK containment: heavily penalise GK pressing far from their penalty area.
  // GK should stay near goal unless ball is very close (sweeper-keeper scenario).
  (ctx) => {
    if (ctx.self.role !== 'GK') return 1.0;
    const goalX = ctx.self.teamId === 'home' ? 0 : 105;
    const ballDistFromGoal = Math.abs(ctx.ball.position.x - goalX);
    if (ballDistFromGoal <= 16.5) return 1.0; // inside penalty area depth — OK to press
    return Math.max(0, 1 - (ballDistFromGoal - 16.5) / 6); // decay to 0 by ~22.5m
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
  // Role boost: attacking roles (ST, LW, RW) strongly favour runs; defenders don't
  (ctx) => {
    const role = ctx.self.role;
    if (role === 'ST') return 1.0;
    if (role === 'LW' || role === 'RW') return 0.9;
    if (role === 'CM' || role === 'LM' || role === 'RM' || role === 'CAM') return 0.6;
    return 0.2; // CB, LB, RB, GK — rarely make forward runs
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ACTIONS array — the complete set of actions evaluated every tick
// ─────────────────────────────────────────────────────────────────────────────
export const ACTIONS: readonly Action[] = [
  { id: ActionType.SHOOT, considerations: shootConsiderations },
  { id: ActionType.PASS_FORWARD, considerations: passForwardConsiderations },
  { id: ActionType.PASS_SAFE, considerations: passSafeConsiderations },
  { id: ActionType.PASS_THROUGH, considerations: passThroughConsiderations },
  { id: ActionType.DRIBBLE, considerations: dribbleConsiderations },
  { id: ActionType.HOLD_SHIELD, considerations: holdShieldConsiderations },
  { id: ActionType.MOVE_TO_POSITION, considerations: moveToPositionConsiderations },
  { id: ActionType.OFFER_SUPPORT, considerations: offerSupportConsiderations },
  { id: ActionType.PRESS, considerations: pressConsiderations },
  { id: ActionType.MAKE_RUN, considerations: makeRunConsiderations },
];
