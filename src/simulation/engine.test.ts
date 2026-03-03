import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationEngine, createTestRosters, type MatchConfig } from './engine.ts';
import { MatchPhase } from './types.ts';
import { TICKS_PER_HALF, TOTAL_MATCH_TICKS } from './match/phases.ts';

// ============================================================
// createTestRosters
// ============================================================

describe('createTestRosters', () => {
  it('returns exactly 11 home players', () => {
    const { home } = createTestRosters();
    expect(home).toHaveLength(11);
  });

  it('returns exactly 11 away players', () => {
    const { away } = createTestRosters();
    expect(away).toHaveLength(11);
  });

  it('all home players have teamId "home"', () => {
    const { home } = createTestRosters();
    for (const p of home) {
      expect(p.teamId).toBe('home');
    }
  });

  it('all away players have teamId "away"', () => {
    const { away } = createTestRosters();
    for (const p of away) {
      expect(p.teamId).toBe('away');
    }
  });

  it('all player ids are unique across both rosters', () => {
    const { home, away } = createTestRosters();
    const ids = [...home, ...away].map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(22);
  });

  it('all players have valid attribute ranges (0..1)', () => {
    const { home, away } = createTestRosters();
    for (const p of [...home, ...away]) {
      const attrs = Object.values(p.attributes);
      for (const v of attrs) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('all players have valid personality ranges (0..1)', () => {
    const { home, away } = createTestRosters();
    for (const p of [...home, ...away]) {
      const traits = Object.values(p.personality);
      for (const v of traits) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('home players have positions in the left half (x <= 52.5)', () => {
    const { home } = createTestRosters();
    for (const p of home) {
      expect(p.position.x).toBeLessThanOrEqual(52.5);
    }
  });

  it('away players have positions in the right half (x >= 52.5)', () => {
    const { away } = createTestRosters();
    for (const p of away) {
      expect(p.position.x).toBeGreaterThanOrEqual(52.5);
    }
  });
});

// ============================================================
// SimulationEngine construction
// ============================================================

describe('SimulationEngine construction', () => {
  it('creates engine without throwing', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    expect(() => new SimulationEngine(config)).not.toThrow();
  });

  it('initial snapshot has tick 0', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);
    expect(engine.getCurrentSnapshot().tick).toBe(0);
  });

  it('initial snapshot has KICKOFF phase', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);
    expect(engine.getCurrentSnapshot().matchPhase).toBe(MatchPhase.KICKOFF);
  });

  it('initial snapshot has score [0, 0]', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);
    expect(engine.getCurrentSnapshot().score).toEqual([0, 0]);
  });

  it('initial snapshot has 22 players', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);
    expect(engine.getCurrentSnapshot().players).toHaveLength(22);
  });

  it('initial ball is at pitch center (52.5, 34)', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);
    const ball = engine.getCurrentSnapshot().ball;
    expect(ball.position.x).toBeCloseTo(52.5);
    expect(ball.position.y).toBeCloseTo(34);
    expect(ball.z).toBe(0);
  });
});

// ============================================================
// Engine tick() — snapshot progression
// ============================================================

describe('engine.tick()', () => {
  let engine: SimulationEngine;

  beforeEach(() => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    engine = new SimulationEngine(config);
  });

  it('returns a SimSnapshot', () => {
    const snap = engine.tick(33.33);
    expect(snap).toBeDefined();
    expect(typeof snap.tick).toBe('number');
  });

  it('increments tick count by 1 each call', () => {
    const s1 = engine.tick(33.33);
    const s2 = engine.tick(33.33);
    const s3 = engine.tick(33.33);
    expect(s1.tick).toBe(1);
    expect(s2.tick).toBe(2);
    expect(s3.tick).toBe(3);
  });

  it('getCurrentSnapshot() returns latest snapshot without advancing', () => {
    engine.tick(33.33);
    engine.tick(33.33);
    const snap = engine.getCurrentSnapshot();
    expect(snap.tick).toBe(2);
    // Calling getCurrentSnapshot again doesn't advance
    const snap2 = engine.getCurrentSnapshot();
    expect(snap2.tick).toBe(2);
  });

  it('snapshot returned by tick matches getCurrentSnapshot', () => {
    const returned = engine.tick(33.33);
    const current = engine.getCurrentSnapshot();
    expect(returned.tick).toBe(current.tick);
  });

  it('each tick returns a new object (immutability)', () => {
    const s1 = engine.tick(33.33);
    const s2 = engine.tick(33.33);
    expect(s1).not.toBe(s2);
  });

  it('players array stays at 22 after tick', () => {
    const snap = engine.tick(33.33);
    expect(snap.players).toHaveLength(22);
  });
});

// ============================================================
// Ball physics integration
// ============================================================

describe('engine ball physics', () => {
  it('ball moves when given initial velocity', () => {
    const { home, away } = createTestRosters();
    // Give ball initial velocity
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);

    // Manually set a moving ball by creating engine and checking tick moves ball
    // Ball starts at center (52.5, 34) with velocity (0,0) — won't move unless kicked
    const snap0 = engine.getCurrentSnapshot();
    const ballStart = snap0.ball.position;

    // With default stationary ball, position should not change
    const snap1 = engine.tick(33.33);
    expect(snap1.ball.position.x).toBeCloseTo(ballStart.x, 5);
    expect(snap1.ball.position.y).toBeCloseTo(ballStart.y, 5);
  });

  it('ball with non-zero velocity moves after tick', () => {
    // Engine with a moving ball
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test-kick', homeRoster: home, awayRoster: away, initialBallVelocity: { x: 10, y: 0 } };
    const engine = new SimulationEngine(config);

    const snap0 = engine.getCurrentSnapshot();
    const snap1 = engine.tick(33.33);

    // Ball should have moved right
    expect(snap1.ball.position.x).toBeGreaterThan(snap0.ball.position.x);
  });

  it('ball slows down due to friction over multiple ticks', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away, initialBallVelocity: { x: 20, y: 0 } };
    const engine = new SimulationEngine(config);

    let prevSpeed = engine.getCurrentSnapshot().ball.velocity.x;
    // Skip tick 0 (KICKOFF phase doesn't move ball in phase machine)
    engine.tick(33.33); // transitions to FIRST_HALF

    for (let i = 0; i < 10; i++) {
      const snap = engine.tick(33.33);
      const speed = Math.abs(snap.ball.velocity.x);
      expect(speed).toBeLessThanOrEqual(Math.abs(prevSpeed) + 0.001); // speed should not increase
      prevSpeed = snap.ball.velocity.x;
    }
  });
});

// ============================================================
// Match phase transitions
// ============================================================

describe('engine phase transitions', () => {
  it('transitions from KICKOFF to FIRST_HALF on first tick', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);

    const snap = engine.tick(33.33);
    expect(snap.matchPhase).toBe(MatchPhase.FIRST_HALF);
  });

  it('transitions to HALFTIME at tick TICKS_PER_HALF', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);

    // Advance to just before halftime
    for (let i = 0; i < TICKS_PER_HALF - 1; i++) {
      engine.tick(33.33);
    }
    const snap = engine.tick(33.33);
    expect(snap.matchPhase).toBe(MatchPhase.HALFTIME);
  });

  it('transitions to SECOND_HALF after HALFTIME', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);

    for (let i = 0; i < TICKS_PER_HALF + 1; i++) {
      engine.tick(33.33);
    }
    const snap = engine.getCurrentSnapshot();
    expect(snap.matchPhase).toBe(MatchPhase.SECOND_HALF);
  });

  it('transitions to FULL_TIME at TOTAL_MATCH_TICKS', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);

    for (let i = 0; i < TOTAL_MATCH_TICKS; i++) {
      engine.tick(33.33);
    }
    const snap = engine.getCurrentSnapshot();
    expect(snap.matchPhase).toBe(MatchPhase.FULL_TIME);
  });

  it('stays FULL_TIME after match ends', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away };
    const engine = new SimulationEngine(config);

    for (let i = 0; i < TOTAL_MATCH_TICKS + 10; i++) {
      engine.tick(33.33);
    }
    const snap = engine.getCurrentSnapshot();
    expect(snap.matchPhase).toBe(MatchPhase.FULL_TIME);
  });
});

// ============================================================
// Goal detection and event emission
// ============================================================

describe('engine goal detection', () => {
  it('emits goal event when ball crosses goal line in valid range', () => {
    const { home, away } = createTestRosters();
    // Ball heading into the right goal (home scores)
    // Right goal is at x=105, y center 34, width 7.32
    const config: MatchConfig = {
      seed: 'test',
      homeRoster: home,
      awayRoster: away,
      // Place ball just inside the pitch approaching the right goal
      initialBallPosition: { x: 104.5, y: 34 },
      initialBallVelocity: { x: 15, y: 0 },
    };
    const engine = new SimulationEngine(config);

    // Run ticks until goal is detected (ball crosses x=105)
    let goalDetected = false;
    for (let i = 0; i < 50; i++) {
      const snap = engine.tick(33.33);
      if (snap.events.some(e => e.type === 'goal')) {
        goalDetected = true;
        break;
      }
    }
    expect(goalDetected).toBe(true);
  });

  it('score increments when goal is scored', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = {
      seed: 'test',
      homeRoster: home,
      awayRoster: away,
      initialBallPosition: { x: 104.5, y: 34 },
      initialBallVelocity: { x: 15, y: 0 },
    };
    const engine = new SimulationEngine(config);

    let finalScore: readonly [number, number] = [0, 0];
    for (let i = 0; i < 50; i++) {
      const snap = engine.tick(33.33);
      if (snap.events.some(e => e.type === 'goal')) {
        finalScore = snap.score;
        break;
      }
    }
    // Home scores (right goal)
    expect(finalScore[0]).toBe(1);
    expect(finalScore[1]).toBe(0);
  });
});

// ============================================================
// HALFTIME/FULL_TIME — no physics during breaks
// ============================================================

describe('engine pauses physics during breaks', () => {
  it('ball does not move during HALFTIME', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away, initialBallVelocity: { x: 5, y: 0 } };
    const engine = new SimulationEngine(config);

    // Advance to halftime
    for (let i = 0; i < TICKS_PER_HALF; i++) {
      engine.tick(33.33);
    }
    expect(engine.getCurrentSnapshot().matchPhase).toBe(MatchPhase.HALFTIME);

    const ballBefore = engine.getCurrentSnapshot().ball;
    engine.tick(33.33);
    const ballAfter = engine.getCurrentSnapshot().ball;

    expect(ballAfter.position.x).toBeCloseTo(ballBefore.position.x, 5);
    expect(ballAfter.position.y).toBeCloseTo(ballBefore.position.y, 5);
  });

  it('ball does not move during FULL_TIME', () => {
    const { home, away } = createTestRosters();
    const config: MatchConfig = { seed: 'test', homeRoster: home, awayRoster: away, initialBallVelocity: { x: 5, y: 0 } };
    const engine = new SimulationEngine(config);

    for (let i = 0; i < TOTAL_MATCH_TICKS; i++) {
      engine.tick(33.33);
    }
    expect(engine.getCurrentSnapshot().matchPhase).toBe(MatchPhase.FULL_TIME);

    const ballBefore = engine.getCurrentSnapshot().ball;
    engine.tick(33.33);
    const ballAfter = engine.getCurrentSnapshot().ball;

    expect(ballAfter.position.x).toBeCloseTo(ballBefore.position.x, 5);
    expect(ballAfter.position.y).toBeCloseTo(ballBefore.position.y, 5);
  });
});
