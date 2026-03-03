import { describe, it, expect } from 'vitest';
import { computeFormationAnchors, ROLES_442 } from './formation.ts';
import { Vec2 } from '../math/vec2.ts';

// Pitch constants
const PITCH_W = 105;
const PITCH_H = 68;

describe('ROLES_442', () => {
  it('has 11 entries', () => {
    expect(ROLES_442).toHaveLength(11);
  });

  it('first entry is GK', () => {
    expect(ROLES_442[0]).toBe('GK');
  });

  it('includes GK, LB, CB, CB, RB, LM, CM, CM, RM, ST, ST', () => {
    expect(ROLES_442).toEqual(['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST']);
  });
});

describe('computeFormationAnchors', () => {
  const centerBall = new Vec2(PITCH_W / 2, PITCH_H / 2);

  describe('basic shape', () => {
    it('returns 11 positions for home team', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      expect(anchors).toHaveLength(11);
    });

    it('returns 11 positions for away team', () => {
      const anchors = computeFormationAnchors('4-4-2', 'away', centerBall, false);
      expect(anchors).toHaveLength(11);
    });

    it('all positions are Vec2 instances', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      for (const a of anchors) {
        expect(a).toBeInstanceOf(Vec2);
      }
    });

    it('all positions are within pitch bounds', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      for (const a of anchors) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x).toBeLessThanOrEqual(PITCH_W);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeLessThanOrEqual(PITCH_H);
      }
    });
  });

  describe('home team positioning', () => {
    it('GK is near own goal line (x near 5)', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      const gk = anchors[0]!;
      // GK should be in the defensive third, x < 30
      expect(gk.x).toBeLessThan(30);
    });

    it('GK is near center vertically', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      const gk = anchors[0]!;
      // GK y near center (34 ± some ball influence)
      expect(gk.y).toBeGreaterThan(20);
      expect(gk.y).toBeLessThan(48);
    });

    it('defenders are further x than GK', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      const gk = anchors[0]!;
      // Defenders are indices 1-4
      for (let i = 1; i <= 4; i++) {
        expect(anchors[i]!.x).toBeGreaterThan(gk.x);
      }
    });

    it('midfielders are further x than defenders', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      const avgDefX = (anchors[1]!.x + anchors[2]!.x + anchors[3]!.x + anchors[4]!.x) / 4;
      const avgMidX = (anchors[5]!.x + anchors[6]!.x + anchors[7]!.x + anchors[8]!.x) / 4;
      expect(avgMidX).toBeGreaterThan(avgDefX);
    });

    it('forwards are further x than midfielders', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      const avgMidX = (anchors[5]!.x + anchors[6]!.x + anchors[7]!.x + anchors[8]!.x) / 4;
      const avgFwdX = (anchors[9]!.x + anchors[10]!.x) / 2;
      expect(avgFwdX).toBeGreaterThan(avgMidX);
    });

    it('defenders are spaced 8-12m apart on y-axis', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      // Defenders sorted by y
      const defY = [anchors[1]!.y, anchors[2]!.y, anchors[3]!.y, anchors[4]!.y].sort((a, b) => a - b);
      for (let i = 0; i < defY.length - 1; i++) {
        const gap = defY[i + 1]! - defY[i]!;
        expect(gap).toBeGreaterThan(6); // at least 6m apart
        expect(gap).toBeLessThan(18); // no more than 18m apart
      }
    });
  });

  describe('away team mirroring', () => {
    it('away GK x is near PITCH_WIDTH - 5', () => {
      const anchors = computeFormationAnchors('4-4-2', 'away', centerBall, false);
      const gk = anchors[0]!;
      // Away GK should be in own half (x > 75)
      expect(gk.x).toBeGreaterThan(75);
    });

    it('away forwards are at lower x than away midfielders', () => {
      const anchors = computeFormationAnchors('4-4-2', 'away', centerBall, false);
      const avgMidX = (anchors[5]!.x + anchors[6]!.x + anchors[7]!.x + anchors[8]!.x) / 4;
      const avgFwdX = (anchors[9]!.x + anchors[10]!.x) / 2;
      // Away team: forwards are nearer home goal (lower x)
      expect(avgFwdX).toBeLessThan(avgMidX);
    });

    it('home and away anchors are roughly mirrored on x-axis', () => {
      const homeAnchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      const awayAnchors = computeFormationAnchors('4-4-2', 'away', centerBall, false);
      // For center ball with no possession influence, anchors should mirror roughly
      for (let i = 0; i < 11; i++) {
        const homeX = homeAnchors[i]!.x;
        const awayX = awayAnchors[i]!.x;
        // They should sum to approximately PITCH_W (with some tolerance for ball influence)
        expect(homeX + awayX).toBeCloseTo(PITCH_W, 0);
      }
    });
  });

  describe('ball position influence', () => {
    it('home team anchors shift forward when ball is in opponent half', () => {
      const ballInOpponentHalf = new Vec2(PITCH_W * 0.8, PITCH_H / 2); // 84m into field
      const ballAtCenter = new Vec2(PITCH_W / 2, PITCH_H / 2);

      const anchorsWithFarBall = computeFormationAnchors('4-4-2', 'home', ballInOpponentHalf, false);
      const anchorsWithCenterBall = computeFormationAnchors('4-4-2', 'home', ballAtCenter, false);

      // Average x position should be higher (further forward) when ball is in opponent half
      const avgXFar = anchorsWithFarBall.reduce((sum, a) => sum + a.x, 0) / 11;
      const avgXCenter = anchorsWithCenterBall.reduce((sum, a) => sum + a.x, 0) / 11;
      expect(avgXFar).toBeGreaterThan(avgXCenter);
    });

    it('home team anchors shift backward when ball is in own half', () => {
      const ballInOwnHalf = new Vec2(PITCH_W * 0.2, PITCH_H / 2); // 21m
      const ballAtCenter = new Vec2(PITCH_W / 2, PITCH_H / 2);

      const anchorsWithNearBall = computeFormationAnchors('4-4-2', 'home', ballInOwnHalf, false);
      const anchorsWithCenterBall = computeFormationAnchors('4-4-2', 'home', ballAtCenter, false);

      const avgXNear = anchorsWithNearBall.reduce((sum, a) => sum + a.x, 0) / 11;
      const avgXCenter = anchorsWithCenterBall.reduce((sum, a) => sum + a.x, 0) / 11;
      expect(avgXNear).toBeLessThan(avgXCenter);
    });
  });

  describe('possession influence', () => {
    it('home team in possession pushes outfield anchors forward by ~10m', () => {
      const anchorsInPossession = computeFormationAnchors('4-4-2', 'home', centerBall, true);
      const anchorsDefending = computeFormationAnchors('4-4-2', 'home', centerBall, false);

      // Outfield players (indices 1-10) should be further forward in possession
      const avgXPossession = anchorsInPossession.slice(1).reduce((sum, a) => sum + a.x, 0) / 10;
      const avgXDefending = anchorsDefending.slice(1).reduce((sum, a) => sum + a.x, 0) / 10;
      // Should be at least 5m further forward
      expect(avgXPossession - avgXDefending).toBeGreaterThan(5);
    });

    it('away team in possession pushes outfield anchors backward (lower x)', () => {
      const anchorsInPossession = computeFormationAnchors('4-4-2', 'away', centerBall, true);
      const anchorsDefending = computeFormationAnchors('4-4-2', 'away', centerBall, false);

      const avgXPossession = anchorsInPossession.slice(1).reduce((sum, a) => sum + a.x, 0) / 10;
      const avgXDefending = anchorsDefending.slice(1).reduce((sum, a) => sum + a.x, 0) / 10;
      // Away in possession pushes toward home goal (lower x)
      expect(avgXPossession).toBeLessThan(avgXDefending);
    });
  });

  describe('edge cases', () => {
    it('all positions remain clamped even with extreme ball position', () => {
      const extremeBall = new Vec2(0, 0);
      const anchors = computeFormationAnchors('4-4-2', 'home', extremeBall, true);
      for (const a of anchors) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x).toBeLessThanOrEqual(PITCH_W);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeLessThanOrEqual(PITCH_H);
      }
    });
  });
});
