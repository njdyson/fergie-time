import { describe, it, expect } from 'vitest';
import { Vec2 } from './vec2.ts';

describe('Vec2', () => {
  describe('construction', () => {
    it('creates a vector with x and y components', () => {
      const v = new Vec2(3, 4);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });

    it('Vec2.zero() returns (0,0)', () => {
      const v = Vec2.zero();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });
  });

  describe('add', () => {
    it('Vec2(1,2).add(Vec2(3,4)) === Vec2(4,6)', () => {
      const result = new Vec2(1, 2).add(new Vec2(3, 4));
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });
  });

  describe('subtract', () => {
    it('Vec2(5,3).subtract(Vec2(2,1)) === Vec2(3,2)', () => {
      const result = new Vec2(5, 3).subtract(new Vec2(2, 1));
      expect(result.x).toBe(3);
      expect(result.y).toBe(2);
    });
  });

  describe('scale', () => {
    it('Vec2(2,3).scale(2) === Vec2(4,6)', () => {
      const result = new Vec2(2, 3).scale(2);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });
  });

  describe('length', () => {
    it('Vec2(3,4).length() === 5', () => {
      expect(new Vec2(3, 4).length()).toBe(5);
    });
  });

  describe('normalize', () => {
    it('Vec2(3,4).normalize().length() ~== 1', () => {
      const n = new Vec2(3, 4).normalize();
      expect(n.length()).toBeCloseTo(1, 10);
    });

    it('Vec2(0,0).normalize() === Vec2(0,0)', () => {
      const n = new Vec2(0, 0).normalize();
      expect(n.x).toBe(0);
      expect(n.y).toBe(0);
    });
  });

  describe('dot', () => {
    it('Vec2(1,0).dot(Vec2(0,1)) === 0 (perpendicular)', () => {
      expect(new Vec2(1, 0).dot(new Vec2(0, 1))).toBe(0);
    });

    it('Vec2(1,0).dot(Vec2(1,0)) === 1 (parallel)', () => {
      expect(new Vec2(1, 0).dot(new Vec2(1, 0))).toBe(1);
    });
  });

  describe('distanceTo', () => {
    it('Vec2(0,0).distanceTo(Vec2(3,4)) === 5', () => {
      expect(new Vec2(0, 0).distanceTo(new Vec2(3, 4))).toBe(5);
    });
  });

  describe('immutability', () => {
    it('add returns a new instance', () => {
      const a = new Vec2(1, 2);
      const b = new Vec2(3, 4);
      const c = a.add(b);
      expect(c).not.toBe(a);
      expect(c).not.toBe(b);
      // original unchanged
      expect(a.x).toBe(1);
      expect(a.y).toBe(2);
    });

    it('subtract returns a new instance', () => {
      const a = new Vec2(5, 3);
      const b = new Vec2(2, 1);
      const c = a.subtract(b);
      expect(c).not.toBe(a);
      expect(a.x).toBe(5);
    });

    it('scale returns a new instance', () => {
      const a = new Vec2(2, 3);
      const c = a.scale(2);
      expect(c).not.toBe(a);
      expect(a.x).toBe(2);
    });

    it('normalize returns a new instance', () => {
      const a = new Vec2(3, 4);
      const c = a.normalize();
      expect(c).not.toBe(a);
      expect(a.x).toBe(3);
    });
  });
});
