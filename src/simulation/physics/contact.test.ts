import { describe, it, expect } from 'vitest';
import { resolveTackle, isShielded, resolveAerialContest } from './contact';
import { createRng } from '../math/random';
import { Vec2 } from '../math/vec2';
import type { PlayerState, BallState } from '../types';

// Helper to create a minimal PlayerState for testing
function makePlayer(
  id: string,
  position: Vec2,
  tackling: number,
  dribbling: number,
  strength: number,
  aerial: number = 0.5,
  velocity?: Vec2
): PlayerState {
  return {
    id,
    teamId: 'home',
    position,
    velocity: velocity ?? Vec2.zero(),
    attributes: {
      pace: 0.7,
      strength,
      stamina: 0.7,
      dribbling,
      passing: 0.7,
      shooting: 0.7,
      tackling,
      aerial,
      positioning: 0.7,
      vision: 0.7,
    },
    personality: {
      directness: 0.5,
      risk_appetite: 0.5,
      composure: 0.7,
      creativity: 0.5,
      work_rate: 0.7,
      aggression: 0.5,
      anticipation: 0.5,
      flair: 0.5,
    },
    fatigue: 0,
    role: 'midfielder',
    duty: 'SUPPORT',
    formationAnchor: Vec2.zero(),
  };
}

function makeBall(position: Vec2, z: number = 0): BallState {
  return {
    position,
    velocity: Vec2.zero(),
    z,
    vz: 0,
    carrierId: null,
  };
}

describe('resolveTackle', () => {
  describe('TackleResult shape', () => {
    it('returns a TackleResult with success and foul booleans', () => {
      const defender = makePlayer('d1', new Vec2(50, 34), 0.7, 0.5, 0.6);
      const attacker = makePlayer('a1', new Vec2(51, 34), 0.5, 0.5, 0.5);
      const rng = createRng('test');
      const result = resolveTackle(defender, attacker, rng);
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.foul).toBe('boolean');
    });
  });

  describe('frontal tackle (high success rate)', () => {
    it('strong defender tackling weak dribbler from front succeeds >70% of time', () => {
      // defender.tackling=0.8, strength=0.7 vs attacker.dribbling=0.4, strength=0.5
      // Defender faces the attacker from the front (defender velocity points toward attacker)
      // Attacker is 1m away — typical contact distance for a frontal tackle
      const defPos = new Vec2(50, 34);
      const attPos = new Vec2(51, 34); // attacker is 1m in front of defender
      // Defender velocity points toward attacker (+x direction)
      const defVel = new Vec2(1, 0);
      const defender = makePlayer('d1', defPos, 0.8, 0.5, 0.7);
      const attacker = makePlayer('a1', attPos, 0.5, 0.4, 0.5);
      // Give defender a velocity to establish facing direction
      const defenderWithVel: PlayerState = { ...defender, velocity: defVel };

      let successCount = 0;
      for (let i = 0; i < 1000; i++) {
        const rng = createRng(`frontal-${i}`);
        const result = resolveTackle(defenderWithVel, attacker, rng);
        if (result.success) successCount++;
      }
      const rate = successCount / 1000;
      expect(rate).toBeGreaterThan(0.70);
    });
  });

  describe('behind tackle (low success rate)', () => {
    it('weak defender tackling strong dribbler from behind succeeds <20% of time', () => {
      // defender.tackling=0.3, strength=0.4 vs attacker.dribbling=0.9, strength=0.8
      // Defender approaches from behind (defender velocity points AWAY from attacker or perpendicular)
      const defPos = new Vec2(52, 34);
      const attPos = new Vec2(50, 34); // attacker is BEHIND the defender's direction
      // Defender velocity points forward (+x) — attacker is behind
      const defVel = new Vec2(1, 0);
      const defender = makePlayer('d1', defPos, 0.3, 0.5, 0.4);
      const attacker = makePlayer('a1', attPos, 0.5, 0.9, 0.8);
      const defenderWithVel: PlayerState = { ...defender, velocity: defVel };

      let successCount = 0;
      for (let i = 0; i < 1000; i++) {
        const rng = createRng(`behind-${i}`);
        const result = resolveTackle(defenderWithVel, attacker, rng);
        if (result.success) successCount++;
      }
      const rate = successCount / 1000;
      expect(rate).toBeLessThan(0.20);
    });
  });

  describe('angle effect', () => {
    it('frontal tackle has higher success rate than side tackle', () => {
      const baseDefender = makePlayer('d1', new Vec2(50, 34), 0.6, 0.5, 0.6);
      const attacker = makePlayer('a1', new Vec2(51, 34), 0.5, 0.6, 0.5);

      // Frontal: defender velocity points toward attacker (+x)
      const frontalDefender: PlayerState = { ...baseDefender, velocity: new Vec2(1, 0) };
      // Side tackle: defender velocity is perpendicular (+y)
      const sideDefender: PlayerState = { ...baseDefender, velocity: new Vec2(0, 1) };

      let frontalSuccess = 0;
      let sideSuccess = 0;
      for (let i = 0; i < 1000; i++) {
        const rng1 = createRng(`angle-frontal-${i}`);
        if (resolveTackle(frontalDefender, attacker, rng1).success) frontalSuccess++;
        const rng2 = createRng(`angle-side-${i}`);
        if (resolveTackle(sideDefender, attacker, rng2).success) sideSuccess++;
      }
      expect(frontalSuccess).toBeGreaterThan(sideSuccess);
    });

    it('side tackle has higher success rate than behind tackle', () => {
      const baseDefender = makePlayer('d1', new Vec2(50, 34), 0.6, 0.5, 0.6);
      const attacker = makePlayer('a1', new Vec2(51, 34), 0.5, 0.6, 0.5);

      // Side: defender velocity perpendicular (+y), attacker 1m ahead (+x)
      const sideDefender: PlayerState = { ...baseDefender, velocity: new Vec2(0, 1) };
      // Behind: defender at (52,34) pointing forward (+x), attacker at (51,34) = 1m behind defender
      const defBehind = makePlayer('d1', new Vec2(52, 34), 0.6, 0.5, 0.6);
      const defBehindVel: PlayerState = { ...defBehind, velocity: new Vec2(1, 0) }; // pointing away from attacker

      let sideSuccess = 0;
      let behindSuccess = 0;
      for (let i = 0; i < 1000; i++) {
        const rng1 = createRng(`side-test-${i}`);
        if (resolveTackle(sideDefender, attacker, rng1).success) sideSuccess++;
        const rng2 = createRng(`behind-test-${i}`);
        if (resolveTackle(defBehindVel, attacker, rng2).success) behindSuccess++;
      }
      expect(sideSuccess).toBeGreaterThan(behindSuccess);
    });
  });

  describe('distance effect', () => {
    it('tackle from within range (~2m) is possible', () => {
      const defPos = new Vec2(50, 34);
      const attPos = new Vec2(51.5, 34); // 1.5m away — within tackle range
      const defender = makePlayer('d1', defPos, 0.7, 0.5, 0.6);
      const defenderFacing: PlayerState = { ...defender, velocity: new Vec2(1, 0) };
      const attacker = makePlayer('a1', attPos, 0.5, 0.5, 0.5);
      const rng = createRng('distance-close');
      const result = resolveTackle(defenderFacing, attacker, rng);
      expect(result).toBeDefined();
    });

    it('tackle from outside range (>5m) has very low success', () => {
      const defPos = new Vec2(50, 34);
      const attPos = new Vec2(60, 34); // 10m away — too far
      const defender = makePlayer('d1', defPos, 0.9, 0.5, 0.9);
      const defenderFacing: PlayerState = { ...defender, velocity: new Vec2(1, 0) };
      const attacker = makePlayer('a1', attPos, 0.5, 0.1, 0.3);

      let successCount = 0;
      for (let i = 0; i < 500; i++) {
        const rng = createRng(`far-${i}`);
        if (resolveTackle(defenderFacing, attacker, rng).success) successCount++;
      }
      const rate = successCount / 500;
      expect(rate).toBeLessThan(0.1); // Very low success from far away
    });
  });

  describe('foul probability', () => {
    it('behind tackles generate more fouls than frontal tackles', () => {
      const attacker = makePlayer('a1', new Vec2(52, 34), 0.5, 0.6, 0.5);

      // Frontal defender
      const frontalDef = makePlayer('d1', new Vec2(50, 34), 0.5, 0.5, 0.5);
      const frontalDefVel: PlayerState = { ...frontalDef, velocity: new Vec2(1, 0) };

      // Behind defender (attacker at (52,34), defender at (54,34) pointing forward)
      const behindDef = makePlayer('d1', new Vec2(54, 34), 0.5, 0.5, 0.5);
      const behindDefVel: PlayerState = { ...behindDef, velocity: new Vec2(1, 0) };

      let frontalFouls = 0;
      let behindFouls = 0;
      for (let i = 0; i < 1000; i++) {
        const rng1 = createRng(`foul-frontal-${i}`);
        if (resolveTackle(frontalDefVel, attacker, rng1).foul) frontalFouls++;
        const rng2 = createRng(`foul-behind-${i}`);
        if (resolveTackle(behindDefVel, attacker, rng2).foul) behindFouls++;
      }
      expect(behindFouls).toBeGreaterThan(frontalFouls);
    });

    it('high-tackling defenders commit fewer fouls', () => {
      const attacker = makePlayer('a1', new Vec2(52, 34), 0.5, 0.6, 0.5);
      const defPos = new Vec2(50, 34);

      const skillfulDef = makePlayer('d1', defPos, 0.9, 0.5, 0.6);
      const skillfulDefVel: PlayerState = { ...skillfulDef, velocity: new Vec2(1, 0) };

      const clumsyDef = makePlayer('d1', defPos, 0.2, 0.5, 0.6);
      const clumsyDefVel: PlayerState = { ...clumsyDef, velocity: new Vec2(1, 0) };

      let skillfulFouls = 0;
      let clumsyFouls = 0;
      for (let i = 0; i < 1000; i++) {
        const rng1 = createRng(`skill-foul-${i}`);
        if (resolveTackle(skillfulDefVel, attacker, rng1).foul) skillfulFouls++;
        const rng2 = createRng(`clumsy-foul-${i}`);
        if (resolveTackle(clumsyDefVel, attacker, rng2).foul) clumsyFouls++;
      }
      expect(skillfulFouls).toBeLessThan(clumsyFouls);
    });
  });
});

describe('isShielded', () => {
  describe('return type', () => {
    it('returns a boolean', () => {
      const carrier = makePlayer('carrier', new Vec2(50, 34), 0.5, 0.7, 0.8);
      const challenger = makePlayer('challenger', new Vec2(51, 34), 0.7, 0.5, 0.5);
      const ballPos = new Vec2(50.5, 34);
      const result = isShielded(carrier, challenger, ballPos);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('shield radius scales with strength', () => {
    it('strong carrier (strength=0.9) shields challenger within ~1.35m', () => {
      // BASE_SHIELD_RADIUS (~1.5m) * strength(0.9) = ~1.35m
      // Challenger 1.2m away — should be shielded
      const carrier = makePlayer('carrier', new Vec2(50, 34), 0.5, 0.7, 0.9);
      const challenger = makePlayer('challenger', new Vec2(51.2, 34), 0.7, 0.5, 0.5);
      // Ball is behind the carrier (carrier is between ball and challenger)
      const ballPos = new Vec2(49, 34); // ball behind carrier
      const result = isShielded(carrier, challenger, ballPos);
      expect(result).toBe(true);
    });

    it('weak carrier (strength=0.3) does NOT shield challenger at 1.2m', () => {
      // BASE_SHIELD_RADIUS (~1.5m) * strength(0.3) = ~0.45m
      // Challenger 1.2m away — outside shield radius
      const carrier = makePlayer('carrier', new Vec2(50, 34), 0.5, 0.7, 0.3);
      const challenger = makePlayer('challenger', new Vec2(51.2, 34), 0.7, 0.5, 0.5);
      const ballPos = new Vec2(49, 34);
      const result = isShielded(carrier, challenger, ballPos);
      expect(result).toBe(false);
    });
  });

  describe('geometry check', () => {
    it('returns false when challenger is not between carrier and ball', () => {
      // Carrier at (50,34), ball at (52,34) — carrier is NOT between ball and challenger
      // Challenger at (48,34) — same side as ball would be ok, but challenger is on the wrong side
      const carrier = makePlayer('carrier', new Vec2(50, 34), 0.5, 0.7, 0.8);
      const challenger = makePlayer('challenger', new Vec2(51.2, 34), 0.7, 0.5, 0.5);
      // Ball is on SAME side as challenger (no shielding possible)
      const ballPos = new Vec2(52, 34); // ball in same direction as challenger
      const result = isShielded(carrier, challenger, ballPos);
      expect(result).toBe(false);
    });

    it('returns true when carrier body is between ball and challenger (within range)', () => {
      const carrier = makePlayer('carrier', new Vec2(50, 34), 0.5, 0.7, 0.8);
      // Challenger ahead of carrier
      const challenger = makePlayer('challenger', new Vec2(51, 34), 0.7, 0.5, 0.5);
      // Ball behind carrier — carrier shields ball from challenger
      const ballPos = new Vec2(49, 34);
      const result = isShielded(carrier, challenger, ballPos);
      expect(result).toBe(true);
    });

    it('returns false when challenger is too far (outside shield radius)', () => {
      const carrier = makePlayer('carrier', new Vec2(50, 34), 0.5, 0.7, 0.8);
      // Challenger far away — 5m away
      const challenger = makePlayer('challenger', new Vec2(55, 34), 0.7, 0.5, 0.5);
      const ballPos = new Vec2(49, 34);
      const result = isShielded(carrier, challenger, ballPos);
      expect(result).toBe(false);
    });
  });
});

describe('resolveAerialContest', () => {
  describe('AerialResult shape', () => {
    it('returns an AerialResult with a winnerId string', () => {
      const p1 = makePlayer('p1', new Vec2(50, 34), 0.5, 0.5, 0.6, 0.7);
      const p2 = makePlayer('p2', new Vec2(50.5, 34), 0.5, 0.5, 0.6, 0.6);
      const ball = makeBall(new Vec2(50, 34), 1.5); // ball at 1.5m height
      const rng = createRng('aerial-test');
      const result = resolveAerialContest(p1, p2, ball, rng);
      expect(typeof result.winnerId).toBe('string');
      expect([p1.id, p2.id]).toContain(result.winnerId);
    });
  });

  describe('automatic win when only one player can reach', () => {
    it('player with high aerial wins when opponent cannot reach ball height', () => {
      // p1 aerial=0.9: jumpHeight = BASE_JUMP(2.5) * 0.9 = 2.25m → can reach ball at 2.0m
      // p2 aerial=0.2: jumpHeight = BASE_JUMP(2.5) * 0.2 = 0.5m → cannot reach ball at 2.0m
      const p1 = makePlayer('p1', new Vec2(50, 34), 0.5, 0.5, 0.6, 0.9);
      const p2 = makePlayer('p2', new Vec2(50.5, 34), 0.5, 0.5, 0.5, 0.2);
      const ball = makeBall(new Vec2(50, 34), 2.0); // ball at 2.0m
      const rng = createRng('auto-win-test');
      const result = resolveAerialContest(p1, p2, ball, rng);
      expect(result.winnerId).toBe('p1');
    });

    it('weak aerial player cannot win when they cannot reach the ball', () => {
      const p1 = makePlayer('p1', new Vec2(50, 34), 0.5, 0.5, 0.6, 0.2);
      const p2 = makePlayer('p2', new Vec2(50.5, 34), 0.5, 0.5, 0.5, 0.9);
      const ball = makeBall(new Vec2(50, 34), 2.0);
      const rng = createRng('auto-win-p2');
      const result = resolveAerialContest(p1, p2, ball, rng);
      expect(result.winnerId).toBe('p2');
    });
  });

  describe('contested aerial (both can reach)', () => {
    it('higher aerial attribute player wins more often in contested header', () => {
      // Both players can reach a low ball
      const p1 = makePlayer('p1', new Vec2(50, 34), 0.5, 0.5, 0.5, 0.9);  // high aerial
      const p2 = makePlayer('p2', new Vec2(50.5, 34), 0.5, 0.5, 0.5, 0.3); // low aerial
      const ball = makeBall(new Vec2(50, 34), 1.0); // low ball both can reach

      let p1wins = 0;
      for (let i = 0; i < 1000; i++) {
        const rng = createRng(`aerial-contest-${i}`);
        const result = resolveAerialContest(p1, p2, ball, rng);
        if (result.winnerId === 'p1') p1wins++;
      }
      const p1Rate = p1wins / 1000;
      expect(p1Rate).toBeGreaterThan(0.6); // p1 should win majority with aerial=0.9 vs 0.3
    });

    it('strength affects outcome of aerial contests', () => {
      // Equal aerial but different strength
      const p1 = makePlayer('p1', new Vec2(50, 34), 0.5, 0.5, 0.9, 0.6);   // high strength
      const p2 = makePlayer('p2', new Vec2(50.5, 34), 0.5, 0.5, 0.2, 0.6); // low strength
      const ball = makeBall(new Vec2(50, 34), 1.0);

      let p1wins = 0;
      for (let i = 0; i < 1000; i++) {
        const rng = createRng(`strength-aerial-${i}`);
        const result = resolveAerialContest(p1, p2, ball, rng);
        if (result.winnerId === 'p1') p1wins++;
      }
      const p1Rate = p1wins / 1000;
      expect(p1Rate).toBeGreaterThan(0.55); // High-strength player should win more
    });
  });

  describe('position check', () => {
    it('player far from ball ground position cannot contest', () => {
      // p1 is close to ball, p2 is far
      const p1 = makePlayer('p1', new Vec2(50, 34), 0.5, 0.5, 0.5, 0.7);
      const p2 = makePlayer('p2', new Vec2(80, 34), 0.5, 0.5, 0.5, 0.7); // 30m away
      const ball = makeBall(new Vec2(50, 34), 1.0);
      const rng = createRng('far-player-test');
      const result = resolveAerialContest(p1, p2, ball, rng);
      expect(result.winnerId).toBe('p1');
    });
  });
});
