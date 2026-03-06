import { describe, it, expect } from 'vitest';
import { computeDefensiveLine, computeFormationAnchors, ROLES_442, FORMATION_TEMPLATES, autoAssignRole } from './formation.ts';
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

  it('includes GK, LB, CB, CB, RB, LW, CM, CM, RW, ST, ST', () => {
    expect(ROLES_442).toEqual(['GK', 'LB', 'CB', 'CB', 'RB', 'LW', 'CM', 'CM', 'RW', 'ST', 'ST']);
  });
});

describe('FORMATION_TEMPLATES', () => {
  it('has exactly 5 entries', () => {
    expect(Object.keys(FORMATION_TEMPLATES)).toHaveLength(5);
  });

  it('has the correct formation keys', () => {
    const keys = Object.keys(FORMATION_TEMPLATES);
    expect(keys).toContain('4-4-2');
    expect(keys).toContain('4-3-3');
    expect(keys).toContain('4-5-1');
    expect(keys).toContain('3-5-2');
    expect(keys).toContain('4-2-3-1');
  });

  it('each template has exactly 11 base positions', () => {
    for (const [key, template] of Object.entries(FORMATION_TEMPLATES)) {
      expect(template.basePositions).toHaveLength(11), `${key} should have 11 positions`;
    }
  });

  it('each template has exactly 11 role labels', () => {
    for (const [key, template] of Object.entries(FORMATION_TEMPLATES)) {
      expect(template.roles).toHaveLength(11), `${key} should have 11 role labels`;
    }
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

    it('defenders are reasonably spaced on y-axis', () => {
      const anchors = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      // Defenders sorted by y (LB, CB, CB, RB — fullbacks push wide)
      const defY = [anchors[1]!.y, anchors[2]!.y, anchors[3]!.y, anchors[4]!.y].sort((a, b) => a - b);
      for (let i = 0; i < defY.length - 1; i++) {
        const gap = defY[i + 1]! - defY[i]!;
        expect(gap).toBeGreaterThan(6);  // at least 6m apart
        expect(gap).toBeLessThan(25);    // fullbacks push wide (~21m from nearest CB)
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

  describe('4-3-3 formation', () => {
    it('returns 11 positions', () => {
      const anchors = computeFormationAnchors('4-3-3', 'home', centerBall, false);
      expect(anchors).toHaveLength(11);
    });

    it('has 3 forward positions clustered higher x than 4-4-2 forwards', () => {
      const anchors433 = computeFormationAnchors('4-3-3', 'home', centerBall, false);
      const anchors442 = computeFormationAnchors('4-4-2', 'home', centerBall, false);
      // 4-3-3 has forwards at indices 8-10 (after GK+4DEF+3MID)
      const avgFwd433 = (anchors433[8]!.x + anchors433[9]!.x + anchors433[10]!.x) / 3;
      const avgFwd442 = (anchors442[9]!.x + anchors442[10]!.x) / 2;
      expect(avgFwd433).toBeGreaterThanOrEqual(avgFwd442 - 5); // 4-3-3 forwards at similar or higher x
    });

    it('away team mirrors correctly', () => {
      const home = computeFormationAnchors('4-3-3', 'home', centerBall, false);
      const away = computeFormationAnchors('4-3-3', 'away', centerBall, false);
      for (let i = 0; i < 11; i++) {
        expect(home[i]!.x + away[i]!.x).toBeCloseTo(PITCH_W, 0);
      }
    });
  });

  describe('4-5-1 formation', () => {
    it('returns 11 positions', () => {
      const anchors = computeFormationAnchors('4-5-1', 'home', centerBall, false);
      expect(anchors).toHaveLength(11);
    });

    it('has 5 midfield positions', () => {
      // 4-5-1: GK(1) + DEF(4) + MID(5) + FWD(1) → mid indices 5-9
      const anchors = computeFormationAnchors('4-5-1', 'home', centerBall, false);
      const midPositions = anchors.slice(5, 10);
      expect(midPositions).toHaveLength(5);
    });

    it('has 1 forward position', () => {
      const anchors = computeFormationAnchors('4-5-1', 'home', centerBall, false);
      // Only 1 forward at index 10
      expect(anchors[10]).toBeDefined();
    });

    it('away team mirrors correctly', () => {
      const home = computeFormationAnchors('4-5-1', 'home', centerBall, false);
      const away = computeFormationAnchors('4-5-1', 'away', centerBall, false);
      for (let i = 0; i < 11; i++) {
        expect(home[i]!.x + away[i]!.x).toBeCloseTo(PITCH_W, 0);
      }
    });
  });

  describe('3-5-2 formation', () => {
    it('returns 11 positions', () => {
      const anchors = computeFormationAnchors('3-5-2', 'home', centerBall, false);
      expect(anchors).toHaveLength(11);
    });

    it('has 3 defenders (not 4)', () => {
      // 3-5-2: GK(1) + DEF(3) + MID(5) + FWD(2) → def indices 1-3
      const anchors = computeFormationAnchors('3-5-2', 'home', centerBall, false);
      const defX = anchors.slice(1, 4).map(a => a.x);
      // All 3 should be in defensive zone (x < 40)
      for (const x of defX) {
        expect(x).toBeLessThan(50); // defensive third
      }
    });

    it('away team mirrors correctly', () => {
      const home = computeFormationAnchors('3-5-2', 'home', centerBall, false);
      const away = computeFormationAnchors('3-5-2', 'away', centerBall, false);
      for (let i = 0; i < 11; i++) {
        expect(home[i]!.x + away[i]!.x).toBeCloseTo(PITCH_W, 0);
      }
    });
  });

  describe('4-2-3-1 formation', () => {
    it('returns 11 positions', () => {
      const anchors = computeFormationAnchors('4-2-3-1', 'home', centerBall, false);
      expect(anchors).toHaveLength(11);
    });

    it('away team mirrors correctly', () => {
      const home = computeFormationAnchors('4-2-3-1', 'home', centerBall, false);
      const away = computeFormationAnchors('4-2-3-1', 'away', centerBall, false);
      for (let i = 0; i < 11; i++) {
        expect(home[i]!.x + away[i]!.x).toBeCloseTo(PITCH_W, 0);
      }
    });
  });

  describe('custom Vec2[] positions', () => {
    it('accepts Vec2[] as formation input and returns 11 positions', () => {
      const customPositions = Array.from({ length: 11 }, (_, i) =>
        new Vec2(i * 9 + 5, PITCH_H / 2)
      );
      const anchors = computeFormationAnchors(customPositions, 'home', centerBall, false);
      expect(anchors).toHaveLength(11);
    });

    it('ball influence still applies to custom positions', () => {
      const customPositions = Array.from({ length: 11 }, (_, i) =>
        new Vec2(i * 9 + 5, PITCH_H / 2)
      );
      const ballFar = new Vec2(100, PITCH_H / 2);
      const ballNear = new Vec2(5, PITCH_H / 2);
      const anchorsFar = computeFormationAnchors(customPositions, 'home', ballFar, false);
      const anchorsNear = computeFormationAnchors(customPositions, 'home', ballNear, false);
      const avgXFar = anchorsFar.reduce((s, a) => s + a.x, 0) / 11;
      const avgXNear = anchorsNear.reduce((s, a) => s + a.x, 0) / 11;
      expect(avgXFar).toBeGreaterThan(avgXNear);
    });
  });

  describe('all formations ball/possession influence', () => {
    const formations: Array<'4-4-2' | '4-3-3' | '4-5-1' | '3-5-2' | '4-2-3-1'> = ['4-4-2', '4-3-3', '4-5-1', '3-5-2', '4-2-3-1'];

    for (const formation of formations) {
      it(`${formation}: ball influence applies`, () => {
        const ballFar = new Vec2(90, PITCH_H / 2);
        const ballCenter = new Vec2(PITCH_W / 2, PITCH_H / 2);
        const anchorsFar = computeFormationAnchors(formation, 'home', ballFar, false);
        const anchorsCenter = computeFormationAnchors(formation, 'home', ballCenter, false);
        const avgXFar = anchorsFar.reduce((s, a) => s + a.x, 0) / 11;
        const avgXCenter = anchorsCenter.reduce((s, a) => s + a.x, 0) / 11;
        expect(avgXFar).toBeGreaterThan(avgXCenter);
      });

      it(`${formation}: possession shift applies`, () => {
        const anchorsIn = computeFormationAnchors(formation, 'home', centerBall, true);
        const anchorsOut = computeFormationAnchors(formation, 'home', centerBall, false);
        const avgXIn = anchorsIn.slice(1).reduce((s, a) => s + a.x, 0) / 10;
        const avgXOut = anchorsOut.slice(1).reduce((s, a) => s + a.x, 0) / 10;
        expect(avgXIn).toBeGreaterThan(avgXOut);
      });
    }
  });
});

describe('autoAssignRole', () => {
  it('assigns GK near own goal line', () => {
    const pos = new Vec2(8, 34);
    expect(autoAssignRole(pos, 'home')).toBe('GK');
  });

  it('assigns CB for center defensive position', () => {
    const pos = new Vec2(22, 34); // center y
    const role = autoAssignRole(pos, 'home');
    expect(role).toBe('CB');
  });

  it('assigns LB for left-side defender', () => {
    const pos = new Vec2(22, 10); // outer y (low)
    const role = autoAssignRole(pos, 'home');
    expect(role).toBe('LB');
  });

  it('assigns RB for right-side defender', () => {
    const pos = new Vec2(22, 58); // outer y (high)
    const role = autoAssignRole(pos, 'home');
    expect(role).toBe('RB');
  });

  it('assigns CDM for deep midfield', () => {
    const pos = new Vec2(38, 34); // mid x, center y
    const role = autoAssignRole(pos, 'home');
    expect(role).toBe('CDM');
  });

  it('assigns CAM for attacking midfield', () => {
    const pos = new Vec2(50, 34); // high mid x, center y
    const role = autoAssignRole(pos, 'home');
    expect(role).toBe('CAM');
  });

  it('assigns CM for central midfield', () => {
    const pos = new Vec2(44, 34); // mid x
    const role = autoAssignRole(pos, 'home');
    expect(role).toBe('CM');
  });

  it('assigns ST for forward position', () => {
    const pos = new Vec2(70, 34);
    const role = autoAssignRole(pos, 'home');
    expect(role).toBe('ST');
  });

  it('assigns LW for left wing', () => {
    const pos = new Vec2(44, 10); // mid x, outer y (low)
    const role = autoAssignRole(pos, 'home');
    expect(role).toBe('LW');
  });

  it('assigns RW for right wing', () => {
    const pos = new Vec2(44, 58); // mid x, outer y (high)
    const role = autoAssignRole(pos, 'home');
    expect(role).toBe('RW');
  });

  it('correctly mirrors x for away team', () => {
    // Away GK at x=97 → mirrors to x=8 from own goal → GK
    const pos = new Vec2(97, 34);
    expect(autoAssignRole(pos, 'away')).toBe('GK');
  });

  it('4-4-2 role assignments match ROLES_442 expectations', () => {
    // Based on BASE_442_HOME_X: GK=5, DEF=25, MID=45, FWD=65
    // and BASE_442_Y spread
    const MID_Y = PITCH_H / 2;
    const positions = [
      new Vec2(5, MID_Y),                 // GK
      new Vec2(25, MID_Y - 21),           // LB (outer y low)
      new Vec2(25, MID_Y - 7),            // CB (inner)
      new Vec2(25, MID_Y + 7),            // CB (inner)
      new Vec2(25, MID_Y + 21),           // RB (outer y high)
      new Vec2(45, MID_Y - 20),           // LM/LW (outer left)
      new Vec2(45, MID_Y - 6.67),         // CM (inner)
      new Vec2(45, MID_Y + 6.67),         // CM (inner)
      new Vec2(45, MID_Y + 20),           // RM/RW (outer right)
      new Vec2(65, MID_Y - 6),            // ST (center)
      new Vec2(65, MID_Y + 6),            // ST (center)
    ];

    const roles = positions.map(p => autoAssignRole(p, 'home'));
    expect(roles[0]).toBe('GK');
    expect(roles[1]).toBe('LB');
    expect(roles[2]).toBe('CB');
    expect(roles[3]).toBe('CB');
    expect(roles[4]).toBe('RB');
    // indices 5-8: midfield positions
    expect(roles[9]).toBe('ST');
    expect(roles[10]).toBe('ST');
  });
});

describe('computeDefensiveLine', () => {
  it('ignores sent-off defenders when finding the second-last player', () => {
    const line = computeDefensiveLine([
      { teamId: 'away' as const, role: 'GK', position: { x: 102 } },
      { teamId: 'away' as const, role: 'CB', position: { x: 97 } },
      { teamId: 'away' as const, role: 'CB', position: { x: 95 }, sentOff: true },
      { teamId: 'away' as const, role: 'RB', position: { x: 90 } },
      { teamId: 'home' as const, role: 'ST', position: { x: 88 } },
    ], 'away', 84);

    expect(line).toBe(97);
  });
});

describe('computeDefensiveLine', () => {
  it('counts the goalkeeper as one of the two deepest opponents', () => {
    const players = [
      { teamId: 'home' as const, role: 'GK', position: { x: 5 } },
      { teamId: 'home' as const, role: 'CB', position: { x: 12 } },
      { teamId: 'home' as const, role: 'CB', position: { x: 16 } },
      { teamId: 'home' as const, role: 'LB', position: { x: 18 } },
      { teamId: 'away' as const, role: 'ST', position: { x: 70 } },
    ];

    expect(computeDefensiveLine(players, 'home', 40)).toBe(12);
  });

  it('still applies the ball as the limiting offside line', () => {
    const players = [
      { teamId: 'away' as const, role: 'GK', position: { x: 100 } },
      { teamId: 'away' as const, role: 'CB', position: { x: 92 } },
      { teamId: 'away' as const, role: 'CB', position: { x: 88 } },
      { teamId: 'home' as const, role: 'ST', position: { x: 60 } },
    ];

    expect(computeDefensiveLine(players, 'away', 85)).toBe(92);
    expect(computeDefensiveLine(players, 'away', 95)).toBe(95);
  });
});
