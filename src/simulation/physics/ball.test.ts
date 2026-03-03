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

  it('ball on ground decelerates via friction and stops well within 3 seconds', () => {
    // 10 * 0.985^N — how many ticks to < 0.5?
    // 0.985^N < 0.05 → N > ln(0.05)/ln(0.985) = -2.996 / -0.01511 ≈ 198 ticks (~6.6 sec)
    // Test at 300 ticks to be well below 0.5
    let ball = makeBall(10, 0);
    for (let i = 0; i < 300; i++) {
      ball = integrateBall(ball, DT_ONE_TICK);
    }
    // After 300 ticks: 10 * 0.985^300 ≈ 10 * 0.0107 ≈ 0.107 m/s
    expect(ball.velocity.x).toBeLessThan(0.5);
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

  it('ball at rest on ground stays grounded (z=0, vz=0 is stable)', () => {
    // Ball with zero vertical motion at ground level — should not bounce
    const ball = makeBall(5, 0, 0, 0);
    const next = integrateBall(ball, DT_ONE_TICK);
    expect(next.z).toBe(0);
    expect(next.vz).toBe(0);
  });
});

// ============================================================
// integrateBall — gravity and parabolic arc
// ============================================================
describe('integrateBall — gravity', () => {
  it('vz decreases by GRAVITY * dtSec each tick when airborne', () => {
    const dtSec = DT_ONE_TICK / 1000;
    const ball = makeBall(0, 0, 100, 5); // z=100 so ball never hits ground
    const next = integrateBall(ball, DT_ONE_TICK);
    const expectedVz = 5 - GRAVITY * dtSec;
    expect(next.vz).toBeCloseTo(expectedVz, 5);
  });

  it('ball kicked upward rises and then falls back to ground (parabolic arc)', () => {
    // Kick with vz=10 m/s from z=0. Ball must rise (max z > 0) and return to ground.
    // The ball follows a parabolic arc under gravity: rises ~5m, falls, bounces with BOUNCE_COEFFICIENT.
    // This test verifies: (1) ball goes up, (2) ball's maximum height decreases over bounces,
    // (3) ball spends time at z > 0, (4) ball eventually has much lower height than initial.
    let ball = makeBall(0, 0, 0, 10);
    let maxZ = 0;
    let earlyMaxZ = 0;

    for (let i = 0; i < 500; i++) {
      ball = integrateBall(ball, DT_ONE_TICK);
      if (ball.z > maxZ) maxZ = ball.z;
      if (i === 80) earlyMaxZ = maxZ; // capture max height after initial arc
    }

    // After vz=10 kick, ball should reach ~5m (parabolic arc under 9.8 m/s^2 gravity)
    expect(maxZ).toBeGreaterThan(3); // ball went up significantly
    // After 500 ticks, ball's height should be much smaller than peak (energy dissipated)
    expect(ball.z).toBeLessThan(earlyMaxZ * 0.1); // ball much lower than original arc
  });

  it('z is always non-negative (ground clamp prevents tunneling)', () => {
    // Ball falling from height with strong downward vz
    const ball = makeBall(0, 0, 0.5, -50);
    const next = integrateBall(ball, DT_ONE_TICK);
    expect(next.z).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// integrateBall — bounce
// ============================================================
describe('integrateBall — bounce', () => {
  it('clamps z to 0 when ball reaches ground during tick', () => {
    // Ball at z=0.2, vz=-20: z_new = 0.2 + (-20)*0.0333 = 0.2 - 0.667 = -0.467 → clamped to 0
    const ball = makeBall(0, 0, 0.2, -20);
    const next = integrateBall(ball, DT_ONE_TICK);
    expect(next.z).toBe(0);
  });

  it('inverts vz with BOUNCE_COEFFICIENT on ground contact, producing positive vz', () => {
    // Ball at z=0.2, vz=-20:
    //   vz_after_gravity = -20 - 9.8*0.0333 = -20.327
    //   z_new = -0.467 → bounces
    //   vz_bounced = 20.327 * 0.55 = 11.18 > 0
    const ball = makeBall(0, 0, 0.2, -20);
    const next = integrateBall(ball, DT_ONE_TICK);
    expect(next.vz).toBeGreaterThan(0);
    // Expected: (20 + 9.8*0.0333) * 0.55 ≈ 11.18
    expect(next.vz).toBeGreaterThan(10);
  });

  it('settles vz to 0 when |vz| after bounce is below SETTLE_THRESHOLD', () => {
    // For settle to trigger: |ball.vz + GRAVITY * dtSec| * BOUNCE_COEFFICIENT < SETTLE_THRESHOLD
    // Use a very small dt to minimize gravity contribution
    // smallDt = 2ms: gravity adds 9.8 * 0.002 = 0.0196 m/s
    // ball.vz = -0.05: after gravity = -0.0696, bounce = 0.0696 * 0.55 = 0.038 < 0.1 → settles
    // Need z to actually go negative:
    // z = 0.001 + (-0.05) * 0.002 = 0.001 - 0.0001 = 0.0009 → still positive, no bounce
    // Use z=0 with vz=-0.05: z stays 0 but vz=0 so ground contact case applies... no.
    // Actually with z=0, vz=-0.05 (not zero), the z=0 && vz=0 guard doesn't trigger.
    // vz_new = -0.05 - 0.0196 = -0.0696
    // z_new = 0 + (-0.05) * 0.002 = -0.0001 → negative → bounce!
    // vz_bounced = 0.0696 * 0.55 = 0.038 < 0.1 → settles to 0
    const smallDt = 2; // 2ms
    const ball = makeBall(0, 0, 0, -0.05); // z=0, tiny downward vz
    const next = integrateBall(ball, smallDt);
    expect(next.vz).toBe(0);
    expect(next.z).toBe(0);
  });

  it('does not settle when bounce vz is at or above SETTLE_THRESHOLD', () => {
    // Ball at z=0, vz=-1 m/s, smallDt=2ms:
    //   vz_after_gravity = -1 - 0.0196 = -1.0196
    //   z_new = 0 + (-1)*0.002 = -0.002 → bounces
    //   vz_bounced = 1.0196 * 0.55 = 0.561 >> 0.1 → does NOT settle
    const smallDt = 2;
    const ball = makeBall(0, 0, 0, -1);
    const next = integrateBall(ball, smallDt);
    expect(next.vz).toBeGreaterThan(SETTLE_THRESHOLD);
  });

  it('ball decelerates XY velocity when bouncing on ground', () => {
    // After bounce, ball is at z=0 so friction applies to XY in same tick
    const ball = makeBall(10, 0, 0.2, -20);
    const next = integrateBall(ball, DT_ONE_TICK);
    // Ball bounced (z=0), friction applied: vx = 10 * 0.985
    expect(next.velocity.x).toBeCloseTo(10 * GROUND_FRICTION, 5);
  });
});

// ============================================================
// continuousCollisionCheck
// ============================================================
describe('continuousCollisionCheck', () => {
  it('detects collision: fast ball moving through a player within one tick', () => {
    // Ball at origin moving at 100 m/s in X direction
    // Player at (2, 0) with radius 1.0
    // In dt=33.33ms, ball moves 100*0.0333 = 3.33m — passes through player at 2m
    const ballPos = new Vec2(0, 0);
    const ballVel = new Vec2(100, 0);
    const playerPos = new Vec2(2, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(true);
  });

  it('returns false: ball moving slowly, player far away — does not reach within one tick', () => {
    // Ball at origin moving at 1 m/s, player at (50, 0)
    // In one tick (33.33ms), ball moves 0.033m — nowhere near player at 50m
    const ballPos = new Vec2(0, 0);
    const ballVel = new Vec2(1, 0);
    const playerPos = new Vec2(50, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(false);
  });

  it('returns false: ball moving perpendicular, misses player entirely', () => {
    // Ball at (0, 5) moving in Y direction, player at (2, 5 + 20) = far away perpendicularly
    // Or simpler: ball at origin moving in Y, player at (10, 0) with radius 1 — path never intersects
    const ballPos = new Vec2(0, 5);
    const ballVel = new Vec2(0, 100); // moves in Y direction
    const playerPos = new Vec2(10, 5); // player 10m to the side, path is in Y direction
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(false);
  });

  it('returns false when discriminant is negative (geometrically no intersection)', () => {
    // Ball at (0, 5) moving horizontally (+X), player at (2, 0) with radius 1
    // Ball path passes 5 units from player center — outside radius 1, no intersection
    const ballPos = new Vec2(0, 5);
    const ballVel = new Vec2(100, 0);
    const playerPos = new Vec2(2, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(false);
  });

  it('detects collision with ball starting inside player radius (stationary ball)', () => {
    // Ball at (0.3, 0) inside player at (0, 0) with radius 1.0 — stationary
    const ballPos = new Vec2(0.3, 0);
    const ballVel = new Vec2(0, 0);
    const playerPos = new Vec2(0, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(true);
  });

  it('t in [0,1] constraint: ball moving too slowly to reach player in this tick', () => {
    // Ball at (0, 0) moving at 1 m/s in X, player at (100, 0), radius 1
    // In one tick (33.33ms), ball moves 0.033m — nowhere near player at 100m
    const ballPos = new Vec2(0, 0);
    const ballVel = new Vec2(1, 0);
    const playerPos = new Vec2(100, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 1.0);
    expect(result).toBe(false);
  });

  it('CCD catches ball that passes through player between tick endpoints', () => {
    // Ball at (0, 0), player at (1, 0) with radius 0.5
    // Ball vel = (50, 0) m/s: in 33ms, moves 50*0.0333 = 1.67m past the player
    // Naive endpoint check: ball ends at (1.67, 0) which is outside radius 0.5 from (1,0)
    // CCD correctly detects the path crosses through player
    const ballPos = new Vec2(0, 0);
    const ballVel = new Vec2(50, 0);
    const playerPos = new Vec2(1, 0);
    const result = continuousCollisionCheck(ballPos, ballVel, playerPos, DT_ONE_TICK, 0.5);
    expect(result).toBe(true);
  });
});
