import { describe, it, expect } from 'vitest';
import {
  checkGoal,
  createInitialSnapshot,
  applyGoal,
  getKickoffPositions,
  PITCH_WIDTH,
  PITCH_HEIGHT,
  GOAL_WIDTH,
  CROSSBAR_HEIGHT,
} from './state.ts';
import { Vec2 } from '../math/vec2.ts';
import { MatchPhase } from '../types.ts';
import type { BallState, PlayerState } from '../types.ts';

// Helpers
function makeBall(x: number, y: number, z: number): BallState {
  return {
    position: new Vec2(x, y),
    velocity: Vec2.zero(),
    z,
    vz: 0,
    carrierId: null,
  };
}

const GOAL_CENTER_Y = PITCH_HEIGHT / 2; // 34

describe('Pitch dimension constants', () => {
  it('PITCH_WIDTH is 105', () => {
    expect(PITCH_WIDTH).toBe(105);
  });

  it('PITCH_HEIGHT is 68', () => {
    expect(PITCH_HEIGHT).toBe(68);
  });

  it('GOAL_WIDTH is 7.32', () => {
    expect(GOAL_WIDTH).toBe(7.32);
  });

  it('CROSSBAR_HEIGHT is 2.44', () => {
    expect(CROSSBAR_HEIGHT).toBe(2.44);
  });
});

describe('checkGoal - home goal (left side, x <= 0)', () => {
  it('ball at x=0, centered on goal, below bar → away scores', () => {
    const ball = makeBall(0, GOAL_CENTER_Y, 1.0);
    expect(checkGoal(ball)).toBe('away');
  });

  it('ball at x=-1 (behind goal line), centered, below bar → away scores', () => {
    const ball = makeBall(-1, GOAL_CENTER_Y, 1.0);
    expect(checkGoal(ball)).toBe('away');
  });

  it('ball at x=0, within goal width at left edge, below bar → away scores', () => {
    const goalLeft = GOAL_CENTER_Y - GOAL_WIDTH / 2;
    const ball = makeBall(0, goalLeft + 0.1, 1.0);
    expect(checkGoal(ball)).toBe('away');
  });

  it('ball at x=0, within goal width at right edge, below bar → away scores', () => {
    const goalRight = GOAL_CENTER_Y + GOAL_WIDTH / 2;
    const ball = makeBall(0, goalRight - 0.1, 1.0);
    expect(checkGoal(ball)).toBe('away');
  });

  it('ball at x=0, y outside goal width (too low) → no goal', () => {
    const ball = makeBall(0, GOAL_CENTER_Y - GOAL_WIDTH / 2 - 0.5, 1.0);
    expect(checkGoal(ball)).toBeNull();
  });

  it('ball at x=0, y outside goal width (too high) → no goal', () => {
    const ball = makeBall(0, GOAL_CENTER_Y + GOAL_WIDTH / 2 + 0.5, 1.0);
    expect(checkGoal(ball)).toBeNull();
  });

  it('ball at x=0, centered but z >= CROSSBAR_HEIGHT → no goal (over bar)', () => {
    const ball = makeBall(0, GOAL_CENTER_Y, CROSSBAR_HEIGHT);
    expect(checkGoal(ball)).toBeNull();
  });

  it('ball at x=0, centered but z > CROSSBAR_HEIGHT → no goal', () => {
    const ball = makeBall(0, GOAL_CENTER_Y, 3.0);
    expect(checkGoal(ball)).toBeNull();
  });
});

describe('checkGoal - away goal (right side, x >= PITCH_WIDTH)', () => {
  it('ball at x=PITCH_WIDTH, centered, below bar → home scores', () => {
    const ball = makeBall(PITCH_WIDTH, GOAL_CENTER_Y, 1.0);
    expect(checkGoal(ball)).toBe('home');
  });

  it('ball at x=PITCH_WIDTH+1, centered, below bar → home scores', () => {
    const ball = makeBall(PITCH_WIDTH + 1, GOAL_CENTER_Y, 1.0);
    expect(checkGoal(ball)).toBe('home');
  });

  it('ball at x=PITCH_WIDTH, y outside goal width → no goal', () => {
    const ball = makeBall(PITCH_WIDTH, 0, 1.0);
    expect(checkGoal(ball)).toBeNull();
  });

  it('ball at x=PITCH_WIDTH, centered, z >= CROSSBAR_HEIGHT → no goal', () => {
    const ball = makeBall(PITCH_WIDTH, GOAL_CENTER_Y, CROSSBAR_HEIGHT);
    expect(checkGoal(ball)).toBeNull();
  });
});

describe('checkGoal - ball in play (not on goal line)', () => {
  it('ball in the middle of pitch → no goal', () => {
    const ball = makeBall(52.5, 34, 0.2);
    expect(checkGoal(ball)).toBeNull();
  });

  it('ball near left goal line but not on it → no goal', () => {
    const ball = makeBall(1, GOAL_CENTER_Y, 1.0);
    expect(checkGoal(ball)).toBeNull();
  });

  it('ball near right goal line but not on it → no goal', () => {
    const ball = makeBall(PITCH_WIDTH - 1, GOAL_CENTER_Y, 1.0);
    expect(checkGoal(ball)).toBeNull();
  });
});

describe('getKickoffPositions', () => {
  it('returns 11 positions for home team', () => {
    const positions = getKickoffPositions('home');
    expect(positions).toHaveLength(11);
  });

  it('returns 11 positions for away team', () => {
    const positions = getKickoffPositions('away');
    expect(positions).toHaveLength(11);
  });

  it('home team positions are in home half (x <= PITCH_WIDTH/2)', () => {
    const positions = getKickoffPositions('home');
    // At least 10 of 11 players should be in their own half
    // (one forward is at center for kickoff)
    const inOwnHalf = positions.filter(p => p.x <= PITCH_WIDTH / 2 + 0.1);
    expect(inOwnHalf.length).toBeGreaterThanOrEqual(10);
  });

  it('away team positions are in away half (x >= PITCH_WIDTH/2)', () => {
    const positions = getKickoffPositions('away');
    const inOwnHalf = positions.filter(p => p.x >= PITCH_WIDTH / 2 - 0.1);
    expect(inOwnHalf.length).toBeGreaterThanOrEqual(10);
  });

  it('all positions are within pitch bounds', () => {
    for (const team of ['home', 'away'] as const) {
      const positions = getKickoffPositions(team);
      for (const pos of positions) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(PITCH_WIDTH);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThanOrEqual(PITCH_HEIGHT);
      }
    }
  });
});

describe('createInitialSnapshot', () => {
  function makeMinimalPlayers(teamId: 'home' | 'away', count: number): PlayerState[] {
    const positions = getKickoffPositions(teamId);
    return Array.from({ length: count }, (_, i) => ({
      id: `${teamId}-${i}`,
      teamId,
      position: positions[i] ?? new Vec2(52.5, 34),
      velocity: Vec2.zero(),
      attributes: {
        pace: 0.7, strength: 0.7, stamina: 0.7, dribbling: 0.7,
        passing: 0.7, shooting: 0.7, tackling: 0.7, aerial: 0.7, positioning: 0.7,
      },
      personality: {
        directness: 0.5, risk_appetite: 0.5, composure: 0.5, creativity: 0.5,
        work_rate: 0.5, aggression: 0.5, anticipation: 0.5, flair: 0.5,
      },
      fatigue: 0,
      role: 'midfielder',
      formationAnchor: positions[i] ?? new Vec2(52.5, 34),
    }));
  }

  it('returns snapshot at tick 0', () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const snapshot = createInitialSnapshot(home, away);
    expect(snapshot.tick).toBe(0);
  });

  it('returns score [0, 0]', () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const snapshot = createInitialSnapshot(home, away);
    expect(snapshot.score).toEqual([0, 0]);
  });

  it('returns 22 players', () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const snapshot = createInitialSnapshot(home, away);
    expect(snapshot.players).toHaveLength(22);
  });

  it('ball starts at center (52.5, 34)', () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const snapshot = createInitialSnapshot(home, away);
    expect(snapshot.ball.position.x).toBeCloseTo(52.5, 5);
    expect(snapshot.ball.position.y).toBeCloseTo(34, 5);
  });

  it('ball z starts at 0 (ground)', () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const snapshot = createInitialSnapshot(home, away);
    expect(snapshot.ball.z).toBe(0);
  });

  it('ball velocity is zero at start', () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const snapshot = createInitialSnapshot(home, away);
    expect(snapshot.ball.velocity.x).toBe(0);
    expect(snapshot.ball.velocity.y).toBe(0);
  });

  it('matchPhase starts at KICKOFF', () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const snapshot = createInitialSnapshot(home, away);
    expect(snapshot.matchPhase).toBe(MatchPhase.KICKOFF);
  });

  it('events array is empty at start', () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const snapshot = createInitialSnapshot(home, away);
    expect(snapshot.events).toHaveLength(0);
  });
});

describe('applyGoal', () => {
  function makeMinimalPlayers(teamId: 'home' | 'away', count: number): PlayerState[] {
    const positions = getKickoffPositions(teamId);
    return Array.from({ length: count }, (_, i) => ({
      id: `${teamId}-${i}`,
      teamId,
      position: positions[i] ?? new Vec2(52.5, 34),
      velocity: Vec2.zero(),
      attributes: {
        pace: 0.7, strength: 0.7, stamina: 0.7, dribbling: 0.7,
        passing: 0.7, shooting: 0.7, tackling: 0.7, aerial: 0.7, positioning: 0.7,
      },
      personality: {
        directness: 0.5, risk_appetite: 0.5, composure: 0.5, creativity: 0.5,
        work_rate: 0.5, aggression: 0.5, anticipation: 0.5, flair: 0.5,
      },
      fatigue: 0,
      role: 'midfielder',
      formationAnchor: positions[i] ?? new Vec2(52.5, 34),
    }));
  }

  it('increments home score when home scores', async () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const initial = createInitialSnapshot(home, away);
    const updated = applyGoal(initial, 'home');
    expect(updated.score[0]).toBe(1);
    expect(updated.score[1]).toBe(0);
  });

  it('increments away score when away scores', async () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const initial = createInitialSnapshot(home, away);
    const updated = applyGoal(initial, 'away');
    expect(updated.score[0]).toBe(0);
    expect(updated.score[1]).toBe(1);
  });

  it('resets ball to center', async () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const initial = createInitialSnapshot(home, away);
    const updated = applyGoal(initial, 'home');
    expect(updated.ball.position.x).toBeCloseTo(52.5, 5);
    expect(updated.ball.position.y).toBeCloseTo(34, 5);
  });

  it('returns a new snapshot (immutable - not same reference)', async () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const initial = createInitialSnapshot(home, away);
    const updated = applyGoal(initial, 'home');
    expect(updated).not.toBe(initial);
  });

  it('can apply multiple goals accumulating scores', async () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const s0 = createInitialSnapshot(home, away);
    const s1 = applyGoal(s0, 'home');
    const s2 = applyGoal(s1, 'home');
    const s3 = applyGoal(s2, 'away');
    expect(s3.score[0]).toBe(2);
    expect(s3.score[1]).toBe(1);
  });

  it('original snapshot score is unchanged (immutability)', async () => {
    const home = makeMinimalPlayers('home', 11);
    const away = makeMinimalPlayers('away', 11);
    const initial = createInitialSnapshot(home, away);
    applyGoal(initial, 'home');
    expect(initial.score[0]).toBe(0);
    expect(initial.score[1]).toBe(0);
  });
});
