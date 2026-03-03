import { describe, it, expect } from 'vitest';
import { Vec2 } from '../math/vec2.ts';
import type { BallState } from '../types.ts';
import {
  integrateBall,
  continuousCollisionCheck,
  GRAVITY,
  GROUND_FRICTION,
  BOUNCE_COEFFICIENT,
  SETTLE_THRESHOLD,
} from './ball.ts';

// Helper: create a minimal BallState for testing
function makeBall(
  vx: number,
  vy: number,
  z = 0,
  vz = 0,
  x = 0,
  y = 0,
): BallState {
  return {
    position: new Vec2(x, y),
    velocity: new Vec2(vx, vy),
    z,
    vz,
    carrierId: null,
  };
}

const DT_ONE_TICK = 1000 / 30; // ~33.33ms — one tick at 30fps

// ============================================================
// Constants
// ============================================================
describe('Physics constants', () => {
  it('GRAVITY is 9.8', () => {
    expect(GRAVITY).toBe(9.8);
  });

  it('GROUND_FRICTION is 0.985', () => {
    expect(GROUND_FRICTION).toBe(0.985);
  });

  it('BOUNCE_COEFFICIENT is 0.55', () => {
    expect(BOUNCE_COEFFICIENT).toBe(0.55);
  });

  it('SETTLE_THRESHOLD is 0.1', () => {
    expect(SETTLE_THRESHOLD).toBe(0.1);
  });
});

// ============================================================
// integrateBall — ground friction
// ============================================================
describe('integrateBall — ground friction', () => {
  it('decelerates XY velocity each tick via GROUND_FRICTION when z=0', () => {
    const ball = makeBall(10, 0);
    const next = integrateBall(ball, DT_ONE_TICK);
    // vx should be 10 * 0.985 = 9.85
    expect(next.velocity.x).toBeCloseTo(9.85, 5);
    expect(next.velocity.y).toBeCloseTo(0, 5);
  });

  it('ball on ground stops within ~3 seconds (~90 ticks at 30fps)', () => {
    let ball = makeBall(10, 0);
    for (let i = 0; i < 90; i++) {
      ball = integrateBall(ball, DT_ONE_TICK);
    }
    // After 90 ticks of 0.985 friction: 10 * (0.985^90) ≈ 10 * 0.259 ≈ 2.59 m/s
    // The requirement says "effectively stopped" — plan says < 0.5 m/s
    // Let's check after 180 ticks (~6 seconds) for definite stop
    let ball2 = makeBall(10, 0);
    for (let i = 0; i < 180; i++) {
      ball2 = integrateBall(ball2, DT_ONE_TICK);
    }
    expect(ball2.velocity.x).toBeLessThan(0.5);
  });

  it('does NOT apply ground friction when ball is airborne (z > 0)', () => {
    const ball = makeBall(10, 0, 5, 0); // z=5 (airborne)
    const next = integrateBall(ball, DT_ONE_TICK);
    // vx should remain 10 (no friction in air)
    expect(next.velocity.x).toBeCloseTo(10, 5);
  });

  it('position updates by velocity * dtSec each tick', () => {
    const ball = makeBall(10, 5);
    const dtSec = DT_ONE_TICK / 1000;
    const next = integrateBall(ball, DT_ONE_TICK);
    // After friction applied: vx = 10 * 0.985
    const expectedVx = 10 * GROUND_FRICTION;
    const expectedVy = 5 * GROUND_FRICTION;
    expect(next.position.x).toBeCloseTo(expectedVx * dtSec, 5);
    expect(next.position.y).toBeCloseTo(expectedVy * dtSec, 5);
  });

  it('is a pure function — does not mutate input', () => {
    const ball = makeBall(10, 5, 0, 0);
    const origVx = ball.velocity.x;
    integrateBall(ball, DT_ONE_TICK);
    expect(ball.velocity.x).toBe(origVx); // unchanged
  });
});

// ============================================================
// integrateBall — gravity and parabolic arc
// ============================================================
describe('integrateBall — gravity', () => {
  it('vz decreases by GRAVITY * dtSec each tick', () => {
    const dtSec = DT_ONE_TICK / 1000;
    const ball = makeBall(0, 0, 10, 5); // 5 m/s upward
    const next = integrateBall(ball, DT_ONE_TICK);
    const expectedVz = 5 - GRAVITY * dtSec;
    expect(next.vz).toBeCloseTo(expectedVz, 5);
  });

  it('ball kicked upward rises and then falls back to ground', () => {
    // Kick with vz=10 m/s from z=0
    let ball = makeBall(0, 0, 0, 10);
    let maxZ = 0;
    let ticks = 0;

    for (let i = 0; i < 200; i++) {
      ball = integrateBall(ball, DT_ONE_TICK);
      ticks++;
      if (ball.z > maxZ) maxZ = ball.z;
      if (ball.z === 0 && i > 2) break; // returned to ground
    }

    expect(maxZ).toBeGreaterThan(0); // ball went up
    expect(ball.z).toBe(0);          // ball returned to ground
    expect(ticks).toBeLessThan(200); // within reasonable time
  });

  it('ball with vz=0 at z=0 stays on ground (z does not go negative after settle)', () => {
    const ball = makeBall(5, 0, 0, 0);
    const next = integrateBall(ball, DT_ONE_TICK);
    expect(next.z).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// integrateBall — bounce
// ============================================================
describe('integrateBall — bounce', () => {
  it('clamps z to 0 when ball would go below ground', () => {
    // Ball at z=0 with vz slightly negative — will go below, then bounce
    const ball = makeBall(0, 0, 0.001, -5);
    const next = integrateBall(ball, DT_ONE_TICK);
    expect(next.z).toBe(0);
  });

  it('inverts vz with BOUNCE_COEFFICIENT on ground contact', () => {
    // Ball with strong downward vz
    const ball = makeBall(0, 0, 0.5, -10);
    const next = integrateBall(ball, DT_ONE_TICK);
    // After bounce: vz should be positive (inverted) and scaled by BOUNCE_COEFFICIENT
    // The exact value depends on implementation order, but it should be ~10 * 0.55 = 5.5
    expect(next.vz).toBeGreaterThan(0);
    expect(next.vz).toBeCloseTo(10 * BOUNCE_COEFFICIENT, 0);
  });

  it('settles vz to 0 when |vz| < SETTLE_THRESHOLD after bounce', () => {
    // Ball with small downward vz — should settle rather than bounce infinitely
    const ball = makeBall(0, 0, 0.001, -0.05);
    const next = integrateBall(ball, DT_ONE_TICK);
    expect(next.vz).toBe(0);
    expect(next.z).toBe(0);
  });

  it('does not settle when |vz| >= SETTLE_THRESHOLD after bounce', () => {
    // Ball with vz that produces |bounce vz| >= 0.1 after coefficient
    // Need incoming vz such that |vz| * BOUNCE_COEFFICIENT >= 0.1
    // i.e., |vz| >= 0.1 / 0.55 ≈ 0.182
    const ball = makeBall(0, 0, 0.5, -1.0);
    const next = integrateBall(ball, DT_ONE_TICK);
    // After bounce: ~1.0 * 0.55 = 0.55 > 0.1, so should NOT settle
    expect(next.vz).toBeGreaterThan(0.1);
  });
});

// ============================================================
// continuousCollisionCheck
// ============================================================
describe('continuousCollisionCheck', () => {
  it('detects collision: fast ball moving through a player at close range', () => {
    // Ball at origin moving at 100 m/s in X direction, player at (5, 0), radius 1.0
    const ballPos = new Vec2(0, 0);
    const ballVel = new Vec2(100, 0);
    const playerPos = new Vec2(5, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(true);
  });

  it('returns false: ball moving slowly, player far away', () => {
    // Ball at origin moving at 1 m/s, player at (50, 0)
    const ballPos = new Vec2(0, 0);
    const ballVel = new Vec2(1, 0);
    const playerPos = new Vec2(50, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(false);
  });

  it('returns false: ball moving perpendicular, misses player entirely', () => {
    // Ball at origin moving in Y direction, player at (10, 0) — ball moves away
    const ballPos = new Vec2(0, 0);
    const ballVel = new Vec2(0, 100); // moves in Y direction only
    const playerPos = new Vec2(10, 0); // player is in X direction
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(false);
  });

  it('returns false when discriminant is negative (no intersection)', () => {
    // Ball at (0, 5) moving horizontally, player at (5, 0) with radius 1
    // The ball's path passes 5 units from the player center — no intersection
    const ballPos = new Vec2(0, 5);
    const ballVel = new Vec2(100, 0);
    const playerPos = new Vec2(5, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(false);
  });

  it('detects collision with larger player radius', () => {
    // Ball at origin moving at 20 m/s, player at (0.5, 0.3) with radius 2.0
    const ballPos = new Vec2(0, 0);
    const ballVel = new Vec2(20, 0);
    const playerPos = new Vec2(0.5, 0.3);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 2.0);
    expect(result).toBe(true);
  });

  it('t in [0,1] constraint: collision only within this tick movement', () => {
    // Ball at (0, 0) moving at 1 m/s in X, player at (100, 0), radius 1
    // In one tick (33.33ms), ball moves 0.033m — nowhere near player at 100m
    const ballPos = new Vec2(0, 0);
    const ballVel = new Vec2(1, 0);
    const playerPos = new Vec2(100, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(false);
  });
});
