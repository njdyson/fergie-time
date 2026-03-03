import type { AgentContext } from '../types.ts';
import { ActionType } from '../types.ts';
import { sigmoid, exponentialDecay, linear } from '../math/curves.ts';

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
// Considerations:
// 1. Hard disqualifier: must have the ball
// 2. Distance to goal — sigmoid, sharply drops beyond 25m (normalize: 0..105m)
// 3. Shooting skill of agent — linear pass-through (already 0..1)
// 4. Clear line of sight — inverse of defender pressure near goal line
const shootConsiderations: readonly ConsiderationFn[] = [
  // 1. Hard disqualifier: no ball → no shoot
  (ctx) => agentHasBall(ctx) ? 1 : 0,

  // 2. Distance to goal — goal threat drops sharply beyond 25m
  //    sigmoid centered at ~0.24 (= 25m/105m), steep falloff
  (ctx) => 1 - sigmoid(ctx.distanceToOpponentGoal / 105, 20, 0.24),

  // 3. Shooting skill
  (ctx) => ctx.self.attributes.shooting,

  // 4. Line of sight — fewer nearby defenders means better shot
  //    Exponential decay: at distance 2m the threat is high; at 10m it drops off
  (ctx) => 1 - exponentialDecay(ctx.nearestDefenderDistance / 30, 2),
];

// ─────────────────────────────────────────────────────────────────────────────
// PASS_FORWARD — play ball forward into space / to advanced teammate
// ─────────────────────────────────────────────────────────────────────────────
// Considerations:
// 1. Hard disqualifier: must have the ball
// 2. Forward progress opportunity — closer to opponent goal = more value in going forward
// 3. Passing skill
// 4. Teammate available — nearest teammate distance (inverse: closer = more available)
const passForwardConsiderations: readonly ConsiderationFn[] = [
  // 1. Hard disqualifier
  (ctx) => agentHasBall(ctx) ? 1 : 0,

  // 2. Forward progress value — higher when not yet near goal (middle of pitch = most valuable advance)
  //    Peaks around 0.4-0.6 normalised (40-60m from goal), drops near goal (shoot instead)
  //    Linear: 1.0 at 60m, 0.5 at 0m — always some value in going forward
  (ctx) => linear(ctx.distanceToOpponentGoal / 105, -0.8, 0.9),

  // 3. Passing skill
  (ctx) => ctx.self.attributes.passing,

  // 4. Teammate reachable — closer nearest teammate = more likely successful forward pass
  (ctx) => exponentialDecay(ctx.nearestTeammateDistance / 50, 1.5),
];

// ─────────────────────────────────────────────────────────────────────────────
// PASS_SAFE — sideways/backward pass to maintain possession
// ─────────────────────────────────────────────────────────────────────────────
// Considerations:
// 1. Hard disqualifier: must have the ball
// 2. Under pressure — closer defenders = more reason to play safe
// 3. Success probability proxy — passing skill
// 4. Teammate available nearby
const passSafeConsiderations: readonly ConsiderationFn[] = [
  // 1. Hard disqualifier
  (ctx) => agentHasBall(ctx) ? 1 : 0,

  // 2. Pressure — exponential: very high pressure (< 3m) scores near 1.0, low pressure scores near 0
  (ctx) => 1 - exponentialDecay(1 / Math.max(ctx.nearestDefenderDistance, 0.5), 2),

  // 3. Passing skill
  (ctx) => ctx.self.attributes.passing,

  // 4. Teammate available
  (ctx) => exponentialDecay(ctx.nearestTeammateDistance / 50, 1.5),
];

// ─────────────────────────────────────────────────────────────────────────────
// DRIBBLE — take on the defender with the ball
// ─────────────────────────────────────────────────────────────────────────────
// Considerations:
// 1. Hard disqualifier: must have the ball
// 2. Space ahead — closer defender = less space = lower score
// 3. Dribbling skill
// 4. Not too close to touchline / own goal (safe to dribble in middle areas)
const dribbleConsiderations: readonly ConsiderationFn[] = [
  // 1. Hard disqualifier
  (ctx) => agentHasBall(ctx) ? 1 : 0,

  // 2. Space available — exponential: large nearestDefenderDistance = lots of space
  (ctx) => 1 - exponentialDecay(ctx.nearestDefenderDistance / 30, 0.8),

  // 3. Dribbling skill
  (ctx) => ctx.self.attributes.dribbling,

  // 4. Risk-appropriate distance from goal — dribbling near own goal is dangerous
  //    Linear: further from own goal (i.e., closer to opponent goal) = safer to dribble
  (ctx) => linear(1 - ctx.distanceToOpponentGoal / 105, 0.7, 0.3),
];

// ─────────────────────────────────────────────────────────────────────────────
// HOLD_SHIELD — shield ball, buy time, wait for support
// ─────────────────────────────────────────────────────────────────────────────
// Considerations:
// 1. Hard disqualifier: must have the ball
// 2. Under pressure — holding makes sense when defenders are very close
// 3. Strength advantage — stronger players can shield better
// 4. Support available — teammate close by (someone to pass to when ready)
const holdShieldConsiderations: readonly ConsiderationFn[] = [
  // 1. Hard disqualifier
  (ctx) => agentHasBall(ctx) ? 1 : 0,

  // 2. Under pressure — inverse exponential: very close defender (< 3m) = high shield score
  (ctx) => 1 - exponentialDecay(1 / Math.max(ctx.nearestDefenderDistance, 0.5), 3),

  // 3. Strength
  (ctx) => ctx.self.attributes.strength,

  // 4. Support available — teammate within range
  (ctx) => exponentialDecay(ctx.nearestTeammateDistance / 30, 1.2),
];

// ─────────────────────────────────────────────────────────────────────────────
// MOVE_TO_POSITION — return to / maintain tactical formation position
// ─────────────────────────────────────────────────────────────────────────────
// Considerations:
// 1. Distance from formation anchor — further = more urgency to move back
// 2. Not in possession (no ball to hold up movement)
// 3. Work rate — high work rate players prioritize positioning
const moveToPositionConsiderations: readonly ConsiderationFn[] = [
  // 1. Distance from anchor — linear: further = higher score
  //    Normalised: max expected drift ~40m
  (ctx) => linear(ctx.distanceToFormationAnchor / 40, 0.9, 0.1),

  // 2. Not carrying the ball — if you have the ball, move-to-pos is low priority
  (ctx) => agentHasBall(ctx) ? 0.1 : 1.0,

  // 3. Work rate
  (ctx) => ctx.self.attributes.positioning,
];

// ─────────────────────────────────────────────────────────────────────────────
// PRESS — aggressively pressure the ball carrier
// ─────────────────────────────────────────────────────────────────────────────
// Considerations:
// 1. Hard disqualifier: own team must NOT have ball (don't press when in possession)
// 2. Proximity to ball carrier — closer = better pressing opportunity
// 3. In defensive zone — pressing high up the pitch is risky; midfield/defensive = better
// 4. Aggression attribute
const pressConsiderations: readonly ConsiderationFn[] = [
  // 1. Hard disqualifier — don't press when own team has ball
  (ctx) => ctx.isInPossessionTeam ? 0 : 1,

  // 2. Proximity — exponential: very close to ball = high press score
  (ctx) => exponentialDecay(ctx.distanceToBall / 40, 2.0),

  // 3. Defensive zone factor — pressing is more sensible when not in final third
  //    Use distanceToOpponentGoal: far from opponent goal (>50m) = defensive territory = good to press
  (ctx) => linear(ctx.distanceToOpponentGoal / 105, 0.6, 0.2),

  // 4. Aggression attribute proxy via work_rate
  (ctx) => ctx.self.attributes.tackling,
];

// ─────────────────────────────────────────────────────────────────────────────
// MAKE_RUN — off-ball run into space to receive a pass
// ─────────────────────────────────────────────────────────────────────────────
// Considerations:
// 1. Hard disqualifier: self must NOT be ball carrier (runs are off-ball)
// 2. Team in possession — runs make sense when team has the ball
// 3. Space in forward position — distance from opponent goal (further = more space to run into)
// 4. Pace attribute — faster players make more effective runs
const makeRunConsiderations: readonly ConsiderationFn[] = [
  // 1. Hard disqualifier — if YOU have the ball, you can't make a run
  (ctx) => agentHasBall(ctx) ? 0 : 1,

  // 2. Team in possession — runs only make sense in possession
  (ctx) => ctx.isInPossessionTeam ? 1 : 0.1,

  // 3. Space to run into — normalized by pitch length
  //    Runs are most valuable in the middle of the pitch; some space needed
  (ctx) => linear(ctx.distanceToOpponentGoal / 105, 0.5, 0.3),

  // 4. Pace — fast players make better runs
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
