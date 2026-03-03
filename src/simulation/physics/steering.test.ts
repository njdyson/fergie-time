import { describe, it, expect } from 'vitest';
import { Vec2 } from '../math/vec2';
import { seek, arrive, separation, pursuit, clampVelocity, BASE_PLAYER_SPEED } from './steering';

describe('seek', () => {
  it('returns velocity pointing from position toward target at maxSpeed', () => {
    const result = seek(new Vec2(0, 0), new Vec2(10, 0), 5);
    expect(result.x).toBeCloseTo(5, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('normalizes direction and applies maxSpeed for diagonal target', () => {
    // (3,4) distance = 5, normalized = (0.6, 0.8), scaled by 10 = (6, 8)
    const result = seek(new Vec2(0, 0), new Vec2(3, 4), 10);
    expect(result.x).toBeCloseTo(6, 5);
    expect(result.y).toBeCloseTo(8, 5);
  });

  it('returns Vec2.zero() when position === target', () => {
    const result = seek(new Vec2(5, 5), new Vec2(5, 5), 10);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('result magnitude equals maxSpeed for non-zero displacement', () => {
    const result = seek(new Vec2(1, 2), new Vec2(4, 6), 7);
    expect(result.length()).toBeCloseTo(7, 5);
  });
});

describe('arrive', () => {
  it('travels at full speed outside slowing radius', () => {
    // Target at (100,0), slowing radius 20 — dist=100, outside radius
    const result = arrive(new Vec2(0, 0), new Vec2(100, 0), 10, 20);
    expect(result.length()).toBeCloseTo(10, 4);
    expect(result.x).toBeCloseTo(10, 4);
  });

  it('returns Vec2.zero() when at target (dist < 0.01)', () => {
    const result = arrive(new Vec2(0, 0), new Vec2(0.005, 0), 10, 20);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('speed proportional to distance within slowing radius — halfway = half speed', () => {
    // Target at (10,0), slowing radius 20 — dist=10, speed = 10 * (10/20) = 5
    const result = arrive(new Vec2(0, 0), new Vec2(10, 0), 10, 20);
    expect(result.length()).toBeCloseTo(5, 4);
    expect(result.x).toBeCloseTo(5, 4);
  });

  it('speed proportional to distance within slowing radius — quarter = quarter speed', () => {
    // Target at (5,0), slowing radius 20 — dist=5, speed = 10 * (5/20) = 2.5
    const result = arrive(new Vec2(0, 0), new Vec2(5, 0), 10, 20);
    expect(result.length()).toBeCloseTo(2.5, 4);
  });

  it('outside slowing radius: direction points toward target', () => {
    const result = arrive(new Vec2(0, 0), new Vec2(0, 50), 10, 20);
    expect(result.x).toBeCloseTo(0, 4);
    expect(result.y).toBeCloseTo(10, 4);
  });

  it('returns zero vector when position equals target exactly', () => {
    const result = arrive(new Vec2(3, 3), new Vec2(3, 3), 10, 20);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });
});

describe('separation', () => {
  it('returns Vec2.zero() when no neighbors within radius', () => {
    const result = separation(new Vec2(0, 0), [new Vec2(10, 0)], 5);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('force points away from neighbor when within radius', () => {
    // Neighbor at (1,0), radius 5 — force should be in -x direction
    const result = separation(new Vec2(0, 0), [new Vec2(1, 0)], 5);
    expect(result.x).toBeLessThan(0);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('force is inversely proportional to distance — closer neighbor produces stronger force', () => {
    const farResult = separation(new Vec2(0, 0), [new Vec2(4, 0)], 5);
    const nearResult = separation(new Vec2(0, 0), [new Vec2(1, 0)], 5);
    expect(nearResult.length()).toBeGreaterThan(farResult.length());
  });

  it('sums repulsion forces from multiple neighbors', () => {
    // Two neighbors at equal distance on opposite sides — forces cancel
    const result = separation(new Vec2(0, 0), [new Vec2(1, 0), new Vec2(-1, 0)], 5);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('skips neighbors exactly at position to avoid division by zero', () => {
    // Neighbor exactly at position (dist=0) — should not crash and result should be zero
    const result = separation(new Vec2(0, 0), [new Vec2(0, 0)], 5);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('skips neighbors outside the radius', () => {
    // Neighbor at (6,0), radius=5 — outside, should produce no force
    const result = separation(new Vec2(0, 0), [new Vec2(6, 0)], 5);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('neighbor at exactly radius boundary is not included (strict less-than)', () => {
    const result = separation(new Vec2(0, 0), [new Vec2(5, 0)], 5);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });
});

describe('pursuit', () => {
  it('seeks directly at stationary target (velocity=0)', () => {
    const pos = new Vec2(0, 0);
    const target = new Vec2(10, 0);
    const velocity = Vec2.zero();
    const seekResult = seek(pos, target, 5);
    const pursuitResult = pursuit(pos, target, velocity, 5);
    expect(pursuitResult.x).toBeCloseTo(seekResult.x, 4);
    expect(pursuitResult.y).toBeCloseTo(seekResult.y, 4);
  });

  it('leads a moving target — seeks ahead of target position', () => {
    const pos = new Vec2(0, 0);
    const target = new Vec2(10, 0);
    const targetVelocity = new Vec2(0, 5); // moving in +y direction
    const result = pursuit(pos, target, targetVelocity, 5);
    // Should seek a point ahead of the target (with y offset), so result.y > 0
    const directSeek = seek(pos, target, 5);
    // The y-component should be positive (target is moving up, future pos is above)
    expect(result.y).toBeGreaterThan(directSeek.y);
  });

  it('result magnitude equals maxSpeed', () => {
    const pos = new Vec2(0, 0);
    const target = new Vec2(10, 5);
    const targetVelocity = new Vec2(2, 1);
    const result = pursuit(pos, target, targetVelocity, 8);
    expect(result.length()).toBeCloseTo(8, 4);
  });
});

describe('clampVelocity', () => {
  it('returns velocity unchanged if magnitude <= maxSpeed', () => {
    const velocity = new Vec2(3, 4); // length = 5
    const result = clampVelocity(velocity, 5);
    expect(result.x).toBeCloseTo(3, 5);
    expect(result.y).toBeCloseTo(4, 5);
  });

  it('returns velocity unchanged if magnitude < maxSpeed', () => {
    const velocity = new Vec2(2, 0); // length = 2
    const result = clampVelocity(velocity, 10);
    expect(result.x).toBeCloseTo(2, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('clamps velocity to maxSpeed if magnitude > maxSpeed', () => {
    const velocity = new Vec2(6, 8); // length = 10
    const result = clampVelocity(velocity, 5);
    expect(result.length()).toBeCloseTo(5, 5);
    // Direction should be preserved: (6,8) normalized * 5 = (3, 4)
    expect(result.x).toBeCloseTo(3, 5);
    expect(result.y).toBeCloseTo(4, 5);
  });

  it('handles zero velocity without error', () => {
    const result = clampVelocity(Vec2.zero(), 10);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });
});

describe('BASE_PLAYER_SPEED', () => {
  it('is a positive number representing average sprint speed (~8 m/s)', () => {
    expect(BASE_PLAYER_SPEED).toBeGreaterThan(0);
    expect(typeof BASE_PLAYER_SPEED).toBe('number');
    // Should represent a realistic footballer speed (8-9 m/s)
    expect(BASE_PLAYER_SPEED).toBeGreaterThanOrEqual(7);
    expect(BASE_PLAYER_SPEED).toBeLessThanOrEqual(10);
  });
});
