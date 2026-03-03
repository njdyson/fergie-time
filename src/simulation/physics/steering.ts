/**
 * Craig Reynolds steering behaviors for autonomous agents.
 *
 * All functions are pure — they take Vec2 inputs and return Vec2 outputs.
 * No player state is mutated. The caller is responsible for integrating
 * the returned desired velocity into position each tick.
 *
 * Source: Craig Reynolds, "Steering Behaviors for Autonomous Characters" (1999)
 * www.red3d.com/cwr/steer/
 *
 * Speed cap: clampVelocity(velocity, maxSpeed) enforces the attribute-derived
 * speed limit. Callers compute maxSpeed from player attributes:
 *   maxSpeed = pace * BASE_PLAYER_SPEED * (1 - fatiguePenalty)
 */
import { Vec2 } from '../math/vec2';

/**
 * Base sprint speed for a player with pace=1.0 and no fatigue.
 * Average footballer sprint: ~8-9 m/s. Cruising: ~5-6 m/s.
 * Callers scale this by the pace attribute and fatigue factor.
 */
export const BASE_PLAYER_SPEED = 8.0;

/**
 * Seek: returns desired velocity pointing from position toward target at maxSpeed.
 *
 * The returned vector is the desired velocity, not a steering force.
 * To compute the steering force, subtract current velocity from the result:
 *   steeringForce = seek(...) - currentVelocity
 *
 * Returns Vec2.zero() when position === target (normalize handles near-zero safely).
 */
export function seek(position: Vec2, target: Vec2, maxSpeed: number): Vec2 {
  return target.subtract(position).normalize().scale(maxSpeed);
}

/**
 * Arrive: like seek, but decelerates within a slowing radius.
 *
 * - Outside slowing radius: full speed toward target.
 * - Inside slowing radius: speed proportional to distance / slowingRadius.
 * - At target (dist < 0.01): returns Vec2.zero().
 */
export function arrive(
  position: Vec2,
  target: Vec2,
  maxSpeed: number,
  slowingRadius: number
): Vec2 {
  const toTarget = target.subtract(position);
  const dist = toTarget.length();

  if (dist < 0.01) {
    return Vec2.zero();
  }

  const speed = dist < slowingRadius ? maxSpeed * (dist / slowingRadius) : maxSpeed;
  return toTarget.normalize().scale(speed);
}

/**
 * Separation: produces a repulsion force pushing the agent away from nearby neighbors.
 *
 * - Neighbors outside radius are ignored.
 * - Neighbors exactly at position (dist=0) are skipped to prevent division by zero.
 * - Force magnitude is inversely proportional to distance (closer = stronger repulsion).
 * - Multiple neighbor forces are summed.
 *
 * Returns Vec2.zero() when no neighbors are within the radius.
 */
export function separation(position: Vec2, neighbors: Vec2[], radius: number): Vec2 {
  let force = Vec2.zero();

  for (const neighbor of neighbors) {
    const diff = position.subtract(neighbor);
    const dist = diff.length();

    if (dist > 0 && dist < radius) {
      // Inversely proportional: 1/dist makes closer neighbors repel more strongly
      force = force.add(diff.normalize().scale(1 / dist));
    }
  }

  return force;
}

/**
 * Pursuit: seeks a predicted future position of a moving target.
 *
 * Look-ahead time is proportional to distance — the further away the target,
 * the further ahead we predict. This prevents overshooting close targets.
 *
 * For a stationary target (velocity = Vec2.zero()), behaves identically to seek.
 */
export function pursuit(
  position: Vec2,
  target: Vec2,
  targetVelocity: Vec2,
  maxSpeed: number
): Vec2 {
  const lookAhead = position.distanceTo(target) / maxSpeed;
  const futurePosition = target.add(targetVelocity.scale(lookAhead));
  return seek(position, futurePosition, maxSpeed);
}

/**
 * Clamp velocity to a maximum speed.
 *
 * If velocity.length() > maxSpeed, returns velocity normalized and scaled to maxSpeed.
 * If velocity.length() <= maxSpeed, returns velocity unchanged.
 * Handles zero velocity safely (normalize returns Vec2.zero()).
 */
export function clampVelocity(velocity: Vec2, maxSpeed: number): Vec2 {
  if (velocity.length() > maxSpeed) {
    return velocity.normalize().scale(maxSpeed);
  }
  return velocity;
}
