import { describe, it, expect } from 'vitest';
import { createEmptyStats, StatsAccumulator } from './stats.ts';
import type { ActionIntent, PlayerState, TeamId } from '../types.ts';
import { ActionType } from '../types.ts';
import { Vec2 } from '../math/vec2.ts';

// Helper to create a minimal PlayerState for testing
function makePlayer(id: string, teamId: TeamId): PlayerState {
  return {
    id,
    teamId,
    position: new Vec2(0, 0),
    velocity: new Vec2(0, 0),
    attributes: {
      pace: 0.7, strength: 0.7, stamina: 0.7,
      dribbling: 0.7, passing: 0.7, shooting: 0.7,
      tackling: 0.7, aerial: 0.7, positioning: 0.7,
    },
    personality: {
      directness: 0.5, risk_appetite: 0.5, composure: 0.5,
      creativity: 0.5, work_rate: 0.5, aggression: 0.5,
      anticipation: 0.5, flair: 0.5,
    },
    fatigue: 0,
    role: 'FWD',
    formationAnchor: new Vec2(48, 34),
  };
}

function makeIntent(agentId: string, action: ActionType): ActionIntent {
  return { agentId, action };
}

describe('createEmptyStats', () => {
  it('returns MatchStats with all zeros', () => {
    const stats = createEmptyStats();
    expect(stats.possession).toEqual([0, 0]);
    expect(stats.shots).toEqual([0, 0]);
    expect(stats.passes).toEqual([0, 0]);
    expect(stats.tackles).toEqual([0, 0]);
  });
});

describe('StatsAccumulator', () => {
  describe('getSnapshot', () => {
    it('returns zero stats before any actions', () => {
      const acc = new StatsAccumulator();
      const snapshot = acc.getSnapshot();
      expect(snapshot.possession).toEqual([0, 0]);
      expect(snapshot.shots).toEqual([0, 0]);
      expect(snapshot.passes).toEqual([0, 0]);
      expect(snapshot.tackles).toEqual([0, 0]);
    });
  });

  describe('recordIntent - shots', () => {
    it('increments home shots when home player SHOOT', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('home1', ActionType.SHOOT), 'home');
      const s = acc.getSnapshot();
      expect(s.shots).toEqual([1, 0]);
    });

    it('increments away shots when away player SHOOT', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('away1', ActionType.SHOOT), 'away');
      const s = acc.getSnapshot();
      expect(s.shots).toEqual([0, 1]);
    });

    it('accumulates multiple shots', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('home1', ActionType.SHOOT), 'home');
      acc.recordIntent(makeIntent('home2', ActionType.SHOOT), 'home');
      acc.recordIntent(makeIntent('away1', ActionType.SHOOT), 'away');
      const s = acc.getSnapshot();
      expect(s.shots).toEqual([2, 1]);
    });
  });

  describe('recordIntent - passes', () => {
    it('increments home passes for PASS_FORWARD', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('home1', ActionType.PASS_FORWARD), 'home');
      const s = acc.getSnapshot();
      expect(s.passes).toEqual([1, 0]);
    });

    it('increments home passes for PASS_SAFE', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('home1', ActionType.PASS_SAFE), 'home');
      const s = acc.getSnapshot();
      expect(s.passes).toEqual([1, 0]);
    });

    it('increments away passes for PASS_FORWARD', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('away1', ActionType.PASS_FORWARD), 'away');
      const s = acc.getSnapshot();
      expect(s.passes).toEqual([0, 1]);
    });

    it('accumulates PASS_FORWARD + PASS_SAFE together', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('home1', ActionType.PASS_FORWARD), 'home');
      acc.recordIntent(makeIntent('home2', ActionType.PASS_SAFE), 'home');
      const s = acc.getSnapshot();
      expect(s.passes).toEqual([2, 0]);
    });
  });

  describe('recordIntent - tackles', () => {
    it('increments home tackles for PRESS', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('home1', ActionType.PRESS), 'home');
      const s = acc.getSnapshot();
      expect(s.tackles).toEqual([1, 0]);
    });

    it('increments away tackles for PRESS', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('away1', ActionType.PRESS), 'away');
      const s = acc.getSnapshot();
      expect(s.tackles).toEqual([0, 1]);
    });
  });

  describe('recordIntent - non-tracked actions', () => {
    it('does not increment any stat for DRIBBLE', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('home1', ActionType.DRIBBLE), 'home');
      const s = acc.getSnapshot();
      expect(s.shots).toEqual([0, 0]);
      expect(s.passes).toEqual([0, 0]);
      expect(s.tackles).toEqual([0, 0]);
    });

    it('does not increment any stat for MOVE_TO_POSITION', () => {
      const acc = new StatsAccumulator();
      acc.recordIntent(makeIntent('home1', ActionType.MOVE_TO_POSITION), 'home');
      const s = acc.getSnapshot();
      expect(s.shots).toEqual([0, 0]);
      expect(s.passes).toEqual([0, 0]);
      expect(s.tackles).toEqual([0, 0]);
    });
  });

  describe('recordPossession', () => {
    it('10 ticks home possession → possession = [100, 0]', () => {
      const acc = new StatsAccumulator();
      for (let i = 0; i < 10; i++) {
        acc.recordPossession('home');
      }
      const s = acc.getSnapshot();
      expect(s.possession[0]).toBeCloseTo(100, 1);
      expect(s.possession[1]).toBeCloseTo(0, 1);
    });

    it('5 ticks home, 5 ticks away → possession = [50, 50]', () => {
      const acc = new StatsAccumulator();
      for (let i = 0; i < 5; i++) acc.recordPossession('home');
      for (let i = 0; i < 5; i++) acc.recordPossession('away');
      const s = acc.getSnapshot();
      expect(s.possession[0]).toBeCloseTo(50, 1);
      expect(s.possession[1]).toBeCloseTo(50, 1);
    });

    it('null ball carrier → neither team gets possession tick', () => {
      const acc = new StatsAccumulator();
      acc.recordPossession('home');
      acc.recordPossession(null);  // loose ball
      acc.recordPossession(null);  // loose ball
      const s = acc.getSnapshot();
      // 1 home tick out of 3 total non-null+possession = 1/(1) * 100 = 100
      // Actually: total ticks for % calculation = homeTicksWithBall + awayTicksWithBall
      // 1 home tick, 0 away, null ticks don't count → 100%
      expect(s.possession[0]).toBeCloseTo(100, 1);
      expect(s.possession[1]).toBeCloseTo(0, 1);
    });

    it('no possession ticks recorded → possession = [0, 0]', () => {
      const acc = new StatsAccumulator();
      const s = acc.getSnapshot();
      expect(s.possession).toEqual([0, 0]);
    });

    it('only null possession ticks → possession = [0, 0]', () => {
      const acc = new StatsAccumulator();
      acc.recordPossession(null);
      acc.recordPossession(null);
      const s = acc.getSnapshot();
      expect(s.possession).toEqual([0, 0]);
    });
  });

  describe('getSnapshot immutability', () => {
    it('returns a new object each time', () => {
      const acc = new StatsAccumulator();
      const s1 = acc.getSnapshot();
      const s2 = acc.getSnapshot();
      // Different object references
      expect(s1).not.toBe(s2);
    });

    it('does not mutate previous snapshot when recording new intents', () => {
      const acc = new StatsAccumulator();
      const s1 = acc.getSnapshot();
      acc.recordIntent(makeIntent('home1', ActionType.SHOOT), 'home');
      const s2 = acc.getSnapshot();
      // s1 should still be zeros
      expect(s1.shots).toEqual([0, 0]);
      expect(s2.shots).toEqual([1, 0]);
    });
  });
});

describe('accumulateStats (functional API)', () => {
  it('exports accumulateStats function', async () => {
    const module = await import('./stats.ts');
    expect(typeof module.accumulateStats).toBe('function');
  });

  it('accumulateStats returns updated stats from intents and players', async () => {
    const { accumulateStats } = await import('./stats.ts');
    const players: PlayerState[] = [
      makePlayer('home1', 'home'),
      makePlayer('away1', 'away'),
    ];
    const empty = createEmptyStats();
    const intents: ActionIntent[] = [
      makeIntent('home1', ActionType.SHOOT),
      makeIntent('away1', ActionType.PASS_FORWARD),
    ];
    const result = accumulateStats(empty, intents, 'home', players);
    expect(result.shots).toEqual([1, 0]);
    expect(result.passes).toEqual([0, 1]);
    expect(result.possession[0]).toBeGreaterThan(0); // home has possession
  });
});
