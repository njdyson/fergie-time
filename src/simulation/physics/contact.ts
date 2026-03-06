import { Vec2 } from '../math/vec2';
import type { PlayerState, BallState } from '../types';

/**
 * Result of a tackle attempt.
 * success: defender wins the ball
 * foul: defender committed a foul (regardless of success)
 */
export interface TackleResult {
  readonly success: boolean;
  readonly foul: boolean;
}

/**
 * Result of an aerial contest.
 * winnerId: the player ID who wins the header/aerial challenge
 */
export interface AerialResult {
  readonly winnerId: string;
}

/**
 * Tackle range parameters:
 * - TACKLE_RANGE: characteristic scale for the inverse-quadratic distance falloff.
 *   At TACKLE_RANGE (1.5m), distanceMod = 0.5. At 2x range, ~0.2.
 * - MAX_TACKLE_REACH: hard cutoff — no tackle possible beyond this distance.
 */
const TACKLE_RANGE = 1.5; // meters — inverse-quadratic falloff scale
const MAX_TACKLE_REACH = 4.0; // meters — hard cutoff

/**
 * Shielding radius base. Actual radius = BASE_SHIELD_RADIUS * carrier.strength.
 * A strong player (strength=0.9) has shield radius ~1.35m.
 * A weak player (strength=0.3) has shield radius ~0.45m.
 */
const BASE_SHIELD_RADIUS = 1.5; // meters

/**
 * Base jump height for a player with aerial=1.0.
 * Actual jump height = BASE_JUMP * player.aerial.
 * A good aerial player (0.9) reaches ~2.25m.
 */
const BASE_JUMP = 2.5; // meters

/**
 * Maximum distance from ball ground position to contest an aerial duel.
 * Both players must be within this radius to participate.
 */
const AERIAL_CONTEST_RANGE = 3.0; // meters

/**
 * Compute the angle modifier for tackle success based on approach direction.
 *
 * Angle is measured between the defender's facing direction (velocity) and
 * the vector from defender to attacker.
 *
 * - Front (0–45°):  1.0x modifier — clean frontal tackle
 * - Side (45–90°):  0.8x modifier — reasonable side challenge
 * - Behind (90–180°): 0.5x modifier — difficult, risky behind-the-play tackle
 *
 * If defender velocity is zero (no facing direction), assume neutral (0.8x).
 */
function computeAngleModifier(defender: PlayerState, attacker: PlayerState): number {
  const defVelLen = defender.velocity.length();

  if (defVelLen < 0.001) {
    // No facing direction: use neutral modifier
    return 0.8;
  }

  const facingDir = defender.velocity.normalize();
  const toAttacker = attacker.position.subtract(defender.position).normalize();

  // Dot product: 1.0 = same direction (frontal), -1.0 = opposite (behind)
  const dot = facingDir.dot(toAttacker);
  // Convert to angle in degrees
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;

  if (angleDeg <= 45) {
    return 1.0; // Frontal
  } else if (angleDeg <= 90) {
    return 0.8; // Side
  } else {
    return 0.5; // Behind
  }
}

/**
 * Compute the foul probability for a tackle attempt.
 *
 * Fouls are more likely:
 * - From behind (poor angle)
 * - For low-tackling defenders (clumsy challenges)
 *
 * Base foul probability: ~5% frontal, ~15% side, ~35% behind
 * Adjusted by tackling skill: lower tackling = higher foul chance
 */
function computeFoulProbability(defender: PlayerState, attacker: PlayerState): number {
  const angleModifier = computeAngleModifier(defender, attacker);

  // Base foul rate inversely proportional to angle modifier
  // angleModifier 1.0 → ~5% base foul, 0.8 → ~15%, 0.5 → ~35%
  let baseFoulRate: number;
  if (angleModifier >= 1.0) {
    baseFoulRate = 0.05;
  } else if (angleModifier >= 0.8) {
    baseFoulRate = 0.15;
  } else {
    baseFoulRate = 0.35;
  }

  // Tackling skill reduces foul rate: a defender with tackling=1.0 commits ~50% fewer fouls
  const tacklingFactor = 1 - defender.attributes.tackling * 0.5;
  return Math.max(0, Math.min(1, baseFoulRate * tacklingFactor));
}

/**
 * Resolve a tackle attempt.
 *
 * Formula:
 *   base = (tackling - dribbling + 1) / 2  — linear attribute difference mapped to [0..1]
 *   angleModifier: 1.0 (frontal), 0.8 (side), 0.5 (behind)
 *   distancePenalty: applies only beyond 1m; reduces probability for medium-range challenges
 *   strengthMod: ±0.1 based on relative strength
 *   probability = base * angleModifier - distancePenalty + strengthMod
 *
 * Calibration examples (at 1m contact distance):
 *   tackling=0.8, dribbling=0.4, frontal, strength=0.7 vs 0.5 → ~72% success
 *   tackling=0.3, dribbling=0.9, behind,  strength=0.4 vs 0.8 → ~7%  success
 *
 * Success if rng() < probability. Foul checked independently.
 */
export function resolveTackle(
  defender: PlayerState,
  attacker: PlayerState,
  rng: () => number
): TackleResult {
  const def = defender.attributes;
  const att = attacker.attributes;

  // Hard distance cutoff — no tackle beyond MAX_TACKLE_REACH
  const distance = defender.position.distanceTo(attacker.position);
  if (distance > MAX_TACKLE_REACH) {
    // Consume rng calls to maintain determinism with the caller's rng stream
    rng(); // success roll
    rng(); // foul roll
    return { success: false, foul: false };
  }

  // Base success probability: linear attribute difference mapped to [0..1]
  //   tackling=0.8, dribbling=0.4 → 0.70  (clear advantage)
  //   tackling=0.3, dribbling=0.9 → 0.20  (clear disadvantage)
  //   tackling=0.5, dribbling=0.5 → 0.50  (even)
  // Attacker agility gives evasion bonus (up to +0.15 effective dribbling)
  const effectiveDribbling = att.dribbling + (att.agility ?? 0.5) * 0.15;
  const base = (def.tackling - effectiveDribbling + 1) / 2;

  // Angle modifier: how directly the defender approaches (0.5–1.0)
  const angleModifier = computeAngleModifier(defender, attacker);

  // Distance penalty: only applies beyond 1m close-contact threshold.
  // inverse-quadratic falloff: distanceMod = 1 / (1 + (d/TACKLE_RANGE)^2)
  // At 1m: 0.692, at 2m: 0.360, at 4m: 0.124
  const CLOSE_THRESHOLD = 1.0; // m — no penalty within contact range
  let distancePenalty = 0;
  if (distance > CLOSE_THRESHOLD) {
    const distanceMod = 1 / (1 + Math.pow(distance / TACKLE_RANGE, 2));
    distancePenalty = (1 - distanceMod) * base * angleModifier * 0.8;
  }

  // Strength modifier: ±0.1 based on relative strength
  const strengthMod = (def.strength / (def.strength + att.strength)) * 0.2 - 0.1;

  const probability = base * angleModifier - distancePenalty + strengthMod;
  const clampedProb = Math.max(0, Math.min(1, probability));

  const success = rng() < clampedProb;

  // Foul check (independent of success)
  const foulProb = computeFoulProbability(defender, attacker);
  const foul = rng() < foulProb;

  return { success, foul };
}

/**
 * Determine if a ball carrier is shielding the ball from a challenger.
 *
 * Shielding requires TWO conditions:
 * 1. Challenger is within the shield radius (BASE_SHIELD_RADIUS * carrier.strength)
 * 2. The carrier's body is between the ball and the challenger:
 *    carrier-to-challenger vector · carrier-to-ball vector > 0
 *    (i.e., ball and challenger are on the same side of the carrier's facing axis)
 *    AND the carrier is positioned between them geometrically.
 *
 * Geometry check: The carrier is "between" the ball and challenger if the
 * carrier-to-ball direction and carrier-to-challenger direction are OPPOSITE
 * (dot product < 0). This means the ball is behind the carrier relative to the challenger.
 */
export function isShielded(
  carrier: PlayerState,
  challenger: PlayerState,
  ballPosition: Vec2
): boolean {
  const shieldRadius = BASE_SHIELD_RADIUS * carrier.attributes.strength;

  // Check 1: Is the challenger within the shield radius?
  const distToChallenger = carrier.position.distanceTo(challenger.position);
  if (distToChallenger > shieldRadius) {
    return false;
  }

  // Check 2: Is the carrier between the ball and challenger?
  // carrier-to-challenger direction
  const toChallenger = challenger.position.subtract(carrier.position).normalize();
  // carrier-to-ball direction
  const toBall = ballPosition.subtract(carrier.position).normalize();

  // If the ball is on the opposite side of the carrier from the challenger,
  // the carrier's body is between the ball and the challenger (shielding = true)
  const dot = toChallenger.dot(toBall);
  return dot < 0;
}

/**
 * Resolve an aerial contest (headers, crosses, high balls).
 *
 * Steps:
 * 1. Check if each player can reach the ball's Z height (jumpHeight = BASE_JUMP * aerial)
 * 2. Check if each player is within AERIAL_CONTEST_RANGE of the ball's ground position
 * 3. If only one can reach + is close: they win automatically
 * 4. If both can reach: winner determined by weighted score:
 *    score = aerial * 0.6 + strength * 0.3 + rng() * 0.1
 */
export function resolveAerialContest(
  p1: PlayerState,
  p2: PlayerState,
  ball: BallState,
  rng: () => number
): AerialResult {
  const jumpHeight1 = BASE_JUMP * p1.attributes.aerial;
  const jumpHeight2 = BASE_JUMP * p2.attributes.aerial;

  const dist1 = p1.position.distanceTo(ball.position);
  const dist2 = p2.position.distanceTo(ball.position);

  const canReach1 = ball.z <= jumpHeight1 && dist1 <= AERIAL_CONTEST_RANGE;
  const canReach2 = ball.z <= jumpHeight2 && dist2 <= AERIAL_CONTEST_RANGE;

  // Automatic wins
  if (canReach1 && !canReach2) {
    return { winnerId: p1.id };
  }
  if (canReach2 && !canReach1) {
    return { winnerId: p2.id };
  }

  // Neither can reach — award to whoever is closer (edge case)
  if (!canReach1 && !canReach2) {
    return { winnerId: dist1 <= dist2 ? p1.id : p2.id };
  }

  // Both can reach: weighted attribute contest — heading accuracy contributes
  const heading1 = p1.attributes.heading ?? 0.5;
  const heading2 = p2.attributes.heading ?? 0.5;
  const score1 = p1.attributes.aerial * 0.45 + p1.attributes.strength * 0.25 + heading1 * 0.2 + rng() * 0.1;
  const score2 = p2.attributes.aerial * 0.45 + p2.attributes.strength * 0.25 + heading2 * 0.2 + rng() * 0.1;

  return { winnerId: score1 >= score2 ? p1.id : p2.id };
}
