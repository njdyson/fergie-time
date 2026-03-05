import { Vec2 } from '../math/vec2.ts';
import type { BallState } from '../types.ts';

// ============================================================
// Physics constants
// ============================================================

/** Gravity acceleration in m/s^2 */
export const GRAVITY = 9.8;

/**
 * Per-tick XY velocity multiplier when ball is on the ground.
 * Approximates rolling friction (~1-2 m/s^2 deceleration).
 * Ball moving at 10 m/s slows significantly over hundreds of ticks.
 */
export const GROUND_FRICTION = 0.975;

/**
 * Per-tick XY velocity multiplier when ball is airborne.
 * Approximates aerodynamic drag on a football in flight.
 * At 30 Hz: ~16% speed loss per second, ~30% over 2 seconds.
 * Makes long balls arc and decelerate realistically.
 */
export const AIR_DRAG = 0.994;

/**
 * Energy retained after ground bounce.
 * Coefficient of restitution for grass/turf: 0.55.
 */
export const BOUNCE_COEFFICIENT = 0.55;

/**
 * When |vz| drops below this after a bounce, set vz = 0 to prevent
 * infinite micro-bounces that never visually settle.
 */
export const SETTLE_THRESHOLD = 0.1;

// ============================================================
// Ball physics integration
// ============================================================

/**
 * Integrate ball physics for one time step.
 *
 * 2.5D model: X/Y are the ground plane, Z is height above ground.
 * - Gravity pulls Z down at GRAVITY m/s^2 (only applied when airborne)
 * - Ground friction decelerates XY when ball is on the ground (z === 0)
 * - Bounce on ground contact: vz inverted * BOUNCE_COEFFICIENT
 * - Ball settles when |vz| < SETTLE_THRESHOLD after bounce
 * - Ball resting on ground (z=0, vz=0) is stable — gravity not applied
 *
 * Pure function — input BallState is never mutated.
 *
 * @param ball         - Current ball state
 * @param dt           - Time step in milliseconds
 * @param groundFriction - Per-tick XY multiplier when on ground (default: GROUND_FRICTION)
 * @param airDragOverride - Per-tick XY multiplier when airborne (default: AIR_DRAG)
 * @returns              - New BallState after dt has elapsed
 */
export function integrateBall(
  ball: BallState,
  dt: number,
  groundFriction: number = GROUND_FRICTION,
  airDragOverride: number = AIR_DRAG,
): BallState {
  const dtSec = dt / 1000;

  // --- Z-axis integration (height) ---
  // If ball is settled on the ground (z=0, vz=0), skip gravity and keep it grounded.
  // This prevents gravity from causing a perpetual micro-bounce loop.
  let vz: number;
  let z: number;

  if (ball.z === 0 && ball.vz === 0) {
    // Ball is at rest on the ground — maintain ground contact
    vz = 0;
    z = 0;
  } else {
    // Apply gravity to vertical velocity, then update Z using pre-update vz
    vz = ball.vz - GRAVITY * dtSec;
    z = ball.z + ball.vz * dtSec;

    // Ground clamp: bounce and settle
    if (z <= 0) {
      z = 0;
      // Check settle threshold on incoming speed (before bounce coefficient).
      // If the ball hits the ground slowly enough that the bounce would produce
      // vz < SETTLE_THRESHOLD, stop it instead of bouncing micro-infinitely.
      // Threshold on incoming: SETTLE_THRESHOLD / BOUNCE_COEFFICIENT ≈ 0.182 m/s
      if (Math.abs(vz) * BOUNCE_COEFFICIENT < SETTLE_THRESHOLD) {
        vz = 0;
      } else {
        vz = -vz * BOUNCE_COEFFICIENT;
      }
    }
  }

  // --- XY integration (ground plane) ---
  // Apply ground friction on the ground, air drag when airborne
  const friction = z === 0 ? groundFriction : airDragOverride;
  const vx = ball.velocity.x * friction;
  const vy = ball.velocity.y * friction;

  // Update position by new velocity * dt
  const newPosition = ball.position.add(new Vec2(vx, vy).scale(dtSec));
  const newVelocity = new Vec2(vx, vy);

  return {
    ...ball,
    position: newPosition,
    velocity: newVelocity,
    z,
    vz,
  };
}

// ============================================================
// Continuous Collision Detection (CCD)
// ============================================================

/**
 * Check if a moving ball passes through a player's collision circle
 * during this tick using parametric ray-circle intersection.
 *
 * Solves the quadratic: |ballPos + t*move - playerPos|^2 = radius^2
 * for t in [0, 1], where t=0 is ball start and t=1 is ball end position.
 *
 * This catches fast balls that would "tunnel" through a player in a single
 * tick if only endpoint positions were checked.
 *
 * @param ballPos      - Ball start position (ground X/Y)
 * @param ballVel      - Ball velocity (m/s)
 * @param playerPos    - Player center position (ground X/Y)
 * @param dt           - Time step in milliseconds
 * @param playerRadius - Collision radius of the player (meters)
 * @returns true if ball path intersects player circle within this tick
 */
export function continuousCollisionCheck(
  ballPos: Vec2,
  ballVel: Vec2,
  playerPos: Vec2,
  dt: number,
  playerRadius: number,
): boolean {
  // Movement vector this tick: move = ballVel * dtSec
  const move = ballVel.scale(dt / 1000);

  // Vector from ball to player center
  const d = playerPos.subtract(ballPos);

  // Edge case: ball not moving (or essentially stationary)
  // Check if ball is already inside player radius
  const a = move.dot(move);
  if (a < 1e-12) {
    return d.dot(d) <= playerRadius * playerRadius;
  }

  // Quadratic coefficients for |ballPos + t*move - playerPos|^2 = r^2
  // Expand: |(t*move - d)|^2 = r^2
  // a*t^2 - 2*(d.move)*t + (d.d - r^2) = 0
  const b = -2 * d.dot(move);
  const c = d.dot(d) - playerRadius * playerRadius;

  const discriminant = b * b - 4 * a * c;

  // No real intersection
  if (discriminant < 0) {
    return false;
  }

  // Earliest intersection parameter t (use the minus root for first contact)
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);

  // Collision is valid only if it occurs within this tick's movement [0, 1]
  return t >= 0 && t <= 1;
}
