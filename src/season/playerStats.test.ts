/**
 * Player Season Stats - TDD tests
 * Tests for accumulation, merging, clean sheets, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import type { PlayerLogStats } from '../simulation/match/gameLog.ts';
import {
  type PlayerSeasonStats,
  createEmptySeasonStats,
  mergeMatchStats,
  mergeAllMatchStats,
} from './playerStats.ts';

// --- helpers ---

function makeMatchStats(overrides: Partial<PlayerLogStats> = {}): PlayerLogStats {
  return {
    playerId: overrides.playerId ?? 'p-1',
    role: overrides.role ?? 'CM',
    teamId: overrides.teamId ?? 'home',
    passes: overrides.passes ?? 0,
    passesCompleted: overrides.passesCompleted ?? 0,
    shots: overrides.shots ?? 0,
    shotsOnTarget: overrides.shotsOnTarget ?? 0,
    goals: overrides.goals ?? 0,
    assists: overrides.assists ?? 0,
    tacklesWon: overrides.tacklesWon ?? 0,
    tacklesAttempted: overrides.tacklesAttempted ?? 0,
    yellowCards: overrides.yellowCards ?? 0,
    redCards: overrides.redCards ?? 0,
  };
}

// --- createEmptySeasonStats ---

describe('[playerStats] createEmptySeasonStats', () => {
  it('returns an object with all fields set to 0', () => {
    const stats = createEmptySeasonStats();
    expect(stats.goals).toBe(0);
    expect(stats.assists).toBe(0);
    expect(stats.appearances).toBe(0);
    expect(stats.shots).toBe(0);
    expect(stats.shotsOnTarget).toBe(0);
    expect(stats.passes).toBe(0);
    expect(stats.passesCompleted).toBe(0);
    expect(stats.tacklesWon).toBe(0);
    expect(stats.tacklesAttempted).toBe(0);
    expect(stats.yellowCards).toBe(0);
    expect(stats.redCards).toBe(0);
    expect(stats.cleanSheets).toBe(0);
    expect(stats.minutesPlayed).toBe(0);
  });
});

// --- mergeMatchStats ---

describe('[playerStats] mergeMatchStats', () => {
  it('accumulates basic stats from empty season into first match', () => {
    const season = createEmptySeasonStats();
    const match = makeMatchStats({ goals: 2, assists: 1, shots: 4, shotsOnTarget: 3 });
    const result = mergeMatchStats(season, match, 90, 1);

    expect(result.goals).toBe(2);
    expect(result.assists).toBe(1);
    expect(result.shots).toBe(4);
    expect(result.shotsOnTarget).toBe(3);
    expect(result.appearances).toBe(1);
    expect(result.minutesPlayed).toBe(90);
  });

  it('accumulates on top of existing season stats', () => {
    const season: PlayerSeasonStats = {
      goals: 3, assists: 2, appearances: 5, shots: 10, shotsOnTarget: 6,
      passes: 250, passesCompleted: 200, tacklesWon: 8, tacklesAttempted: 12,
      yellowCards: 1, redCards: 0, cleanSheets: 0, minutesPlayed: 450,
    };
    const match = makeMatchStats({ goals: 1, assists: 0 });
    const result = mergeMatchStats(season, match, 90, 0);

    expect(result.goals).toBe(4);
    expect(result.appearances).toBe(6);
    expect(result.minutesPlayed).toBe(540);
  });

  it('adds yellowCards and redCards from match stats', () => {
    const season = createEmptySeasonStats();
    const match = makeMatchStats({ yellowCards: 1, redCards: 0 });
    const result = mergeMatchStats(season, match, 90, 0);
    expect(result.yellowCards).toBe(1);
    expect(result.redCards).toBe(0);
  });

  it('grants cleanSheet to GK when teamConceded === 0', () => {
    const season = createEmptySeasonStats();
    const match = makeMatchStats({ role: 'GK' });
    const result = mergeMatchStats(season, match, 90, 0);
    expect(result.cleanSheets).toBe(1);
  });

  it('does not grant cleanSheet to GK when teamConceded > 0', () => {
    const season = createEmptySeasonStats();
    const match = makeMatchStats({ role: 'GK' });
    const result = mergeMatchStats(season, match, 90, 2);
    expect(result.cleanSheets).toBe(0);
  });

  it('does not grant cleanSheet to non-GK even when teamConceded === 0', () => {
    const season = createEmptySeasonStats();
    const match = makeMatchStats({ role: 'CB' });
    const result = mergeMatchStats(season, match, 90, 0);
    expect(result.cleanSheets).toBe(0);
  });

  it('accumulates passes and tackles correctly', () => {
    const season = createEmptySeasonStats();
    const match = makeMatchStats({
      passes: 40, passesCompleted: 35,
      tacklesWon: 3, tacklesAttempted: 5,
    });
    const result = mergeMatchStats(season, match, 90, 0);
    expect(result.passes).toBe(40);
    expect(result.passesCompleted).toBe(35);
    expect(result.tacklesWon).toBe(3);
    expect(result.tacklesAttempted).toBe(5);
  });
});

// --- mergeAllMatchStats ---

describe('[playerStats] mergeAllMatchStats', () => {
  it('creates new entries for players not yet in season stats', () => {
    const seasonStats = new Map<string, PlayerSeasonStats>();
    const matchStats = new Map<string, PlayerLogStats>();
    matchStats.set('p-1', makeMatchStats({ playerId: 'p-1', role: 'CM', teamId: 'home', goals: 1 }));

    const result = mergeAllMatchStats(seasonStats, matchStats, { home: 0, away: 1 });

    expect(result.has('p-1')).toBe(true);
    expect(result.get('p-1')!.goals).toBe(1);
  });

  it('merges into existing season stats', () => {
    const seasonStats = new Map<string, PlayerSeasonStats>();
    seasonStats.set('p-1', { ...createEmptySeasonStats(), goals: 5, appearances: 10 });

    const matchStats = new Map<string, PlayerLogStats>();
    matchStats.set('p-1', makeMatchStats({ playerId: 'p-1', role: 'CM', teamId: 'home', goals: 2 }));

    const result = mergeAllMatchStats(seasonStats, matchStats, { home: 1, away: 0 });

    expect(result.get('p-1')!.goals).toBe(7);
    expect(result.get('p-1')!.appearances).toBe(11);
  });

  it('uses minutesPlayed of 90 for all players', () => {
    const seasonStats = new Map<string, PlayerSeasonStats>();
    const matchStats = new Map<string, PlayerLogStats>();
    matchStats.set('p-1', makeMatchStats({ playerId: 'p-1', role: 'CM', teamId: 'home' }));

    const result = mergeAllMatchStats(seasonStats, matchStats, { home: 0, away: 0 });
    expect(result.get('p-1')!.minutesPlayed).toBe(90);
  });

  it('gives home GK a cleanSheet when home conceded 0', () => {
    const seasonStats = new Map<string, PlayerSeasonStats>();
    const matchStats = new Map<string, PlayerLogStats>();
    matchStats.set('gk-home', makeMatchStats({ playerId: 'gk-home', role: 'GK', teamId: 'home' }));
    matchStats.set('gk-away', makeMatchStats({ playerId: 'gk-away', role: 'GK', teamId: 'away' }));

    const result = mergeAllMatchStats(seasonStats, matchStats, { home: 0, away: 2 });

    expect(result.get('gk-home')!.cleanSheets).toBe(1);
    expect(result.get('gk-away')!.cleanSheets).toBe(0);
  });

  it('gives away GK a cleanSheet when away conceded 0', () => {
    const seasonStats = new Map<string, PlayerSeasonStats>();
    const matchStats = new Map<string, PlayerLogStats>();
    matchStats.set('gk-home', makeMatchStats({ playerId: 'gk-home', role: 'GK', teamId: 'home' }));
    matchStats.set('gk-away', makeMatchStats({ playerId: 'gk-away', role: 'GK', teamId: 'away' }));

    const result = mergeAllMatchStats(seasonStats, matchStats, { home: 3, away: 0 });

    expect(result.get('gk-home')!.cleanSheets).toBe(0);
    expect(result.get('gk-away')!.cleanSheets).toBe(1);
  });

  it('handles multiple players from both teams', () => {
    const seasonStats = new Map<string, PlayerSeasonStats>();
    const matchStats = new Map<string, PlayerLogStats>();
    for (let i = 0; i < 11; i++) {
      matchStats.set(`home-${i}`, makeMatchStats({ playerId: `home-${i}`, role: 'CM', teamId: 'home' }));
      matchStats.set(`away-${i}`, makeMatchStats({ playerId: `away-${i}`, role: 'CM', teamId: 'away' }));
    }

    const result = mergeAllMatchStats(seasonStats, matchStats, { home: 1, away: 1 });
    expect(result.size).toBe(22);
  });
});
