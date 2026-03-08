/**
 * Season state machine tests (TDD RED → GREEN)
 */

import { describe, it, expect, vi } from 'vitest';
import type { PlayerState } from '../simulation/types.ts';
import { Duty } from '../simulation/types.ts';
import { Vec2 } from '../simulation/math/vec2.ts';

// Mock quickSimMatch to avoid running real engine in season unit tests
vi.mock('./quickSim.ts', () => ({
  quickSimMatch: () => ({ homeGoals: 1, awayGoals: 0 }),
}));

import {
  createSeason,
  validateSquadSelection,
  advanceMatchday,
  recordPlayerResult,
  isSeasonComplete,
  getChampion,
  startNewSeason,
  recoverFatigue,
} from './season.ts';
import type { SquadSelection } from './season.ts';

// --- helpers ---

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: overrides.id ?? 'p-0',
    teamId: overrides.teamId ?? 'home',
    position: Vec2.zero(),
    velocity: Vec2.zero(),
    attributes: {
      pace: 0.6, strength: 0.6, stamina: 0.6, dribbling: 0.6,
      passing: 0.6, shooting: 0.6, tackling: 0.6, aerial: 0.6,
      positioning: 0.6, vision: 0.6,
      acceleration: 0.65, crossing: 0.5, finishing: 0.55, agility: 0.6,
      heading: 0.55, concentration: 0.65, reflexes: 0.4, handling: 0.4,
      oneOnOnes: 0.4, distribution: 0.4,
    },
    personality: {
      directness: 0.5, risk_appetite: 0.5, composure: 0.5, creativity: 0.5,
      work_rate: 0.5, aggression: 0.5, anticipation: 0.5, flair: 0.5,
    },
    fatigue: 0,
    role: overrides.role ?? 'CM',
    duty: Duty.SUPPORT,
    formationAnchor: Vec2.zero(),
    name: overrides.name ?? 'Test Player',
    ...overrides,
  };
}

function makeSquad(teamId: string = 'player-team'): PlayerState[] {
  // 25-man squad matching ROLES_25 distribution
  const roles = [
    'GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'ST', 'ST',  // starters (11)
    'GK', 'CB', 'CB', 'LB', 'CM', 'CAM', 'ST',                            // bench (7)
    'CB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'GK',                            // reserves (7)
  ];
  return roles.map((role, i) => makePlayer({ id: `${teamId}-p${i}`, teamId: teamId as any, role }));
}

function makeSelection(overrides?: Partial<{ starters: PlayerState[]; bench: PlayerState[] }>): SquadSelection {
  const squad = makeSquad();
  return {
    starters: overrides?.starters ?? squad.slice(0, 11),
    bench: overrides?.bench ?? squad.slice(11, 18),
  };
}

// --- createSeason ---

describe('createSeason', () => {
  it('returns SeasonState with 20 teams', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'test-seed');
    expect(state.teams).toHaveLength(20);
  });

  it('has player team at index 0 with isPlayerTeam=true', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'test-seed');
    expect(state.teams[0]!.isPlayerTeam).toBe(true);
    expect(state.teams[0]!.id).toBe('my-team');
    expect(state.teams[0]!.name).toBe('My Team FC');
  });

  it('has 19 AI teams with isPlayerTeam=false', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'test-seed');
    const aiTeams = state.teams.filter(t => !t.isPlayerTeam);
    expect(aiTeams).toHaveLength(19);
  });

  it('assigns each AI team a preferred tactic and formation', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'test-seed');
    const aiTeams = state.teams.filter(t => !t.isPlayerTeam);
    for (const team of aiTeams) {
      expect(team.preferredTacticName).toBeDefined();
      expect(team.preferredTacticName!.length).toBeGreaterThan(0);
      expect(team.preferredFormation).toBeDefined();
    }
  });

  it('distributes AI team tiers as 4 strong, 10 mid, 6 weak', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'test-seed');
    const aiTeams = state.teams.filter(t => !t.isPlayerTeam);
    expect(aiTeams.filter(t => t.tier === 'strong')).toHaveLength(4);
    expect(aiTeams.filter(t => t.tier === 'mid')).toHaveLength(10);
    expect(aiTeams.filter(t => t.tier === 'weak')).toHaveLength(5);
    // Player team uses 1 weak slot (total: 4+10+6=20 with player team)
  });

  it('generates 380 fixtures', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'test-seed');
    expect(state.fixtures).toHaveLength(380);
  });

  it('creates initial league table with 20 entries all at zero', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'test-seed');
    expect(state.table).toHaveLength(20);
    for (const row of state.table) {
      expect(row.played).toBe(0);
      expect(row.points).toBe(0);
    }
  });

  it('starts at matchday 1', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'test-seed');
    expect(state.currentMatchday).toBe(1);
  });

  it('initializes fatigueMap with 0 for all players', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'test-seed');
    // Every player across all teams should have fatigue 0
    const totalPlayers = state.teams.reduce((n, t) => n + t.squad.length, 0);
    expect(state.fatigueMap.size).toBe(totalPlayers);
    for (const fatigue of state.fatigueMap.values()) {
      expect(fatigue).toBe(0);
    }
  });

  it('is reproducible with same seed', () => {
    const squad = makeSquad('my-team');
    const s1 = createSeason('my-team', 'My Team FC', squad, 'seed-42');
    const s2 = createSeason('my-team', 'My Team FC', squad, 'seed-42');
    expect(s1.teams.map(t => t.name)).toEqual(s2.teams.map(t => t.name));
    expect(s1.fixtures.length).toBe(s2.fixtures.length);
  });
});

// --- validateSquadSelection ---

describe('validateSquadSelection', () => {
  it('returns valid for 11 starters (1+ GK) + 7 bench', () => {
    const result = validateSquadSelection(makeSelection());
    expect(result).toEqual({ valid: true });
  });

  it('returns invalid when starters count != 11 (too few)', () => {
    const sel = makeSelection({ starters: makeSquad().slice(0, 10) });
    const result = validateSquadSelection(sel);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns invalid when starters count != 11 (too many)', () => {
    const sel = makeSelection({ starters: makeSquad().slice(0, 12) });
    const result = validateSquadSelection(sel);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns invalid when no GK in starters', () => {
    // 11 outfield players, no GK
    const starters = Array.from({ length: 11 }, (_, i) =>
      makePlayer({ id: `nogk-${i}`, role: 'CM' })
    );
    const sel = makeSelection({ starters });
    const result = validateSquadSelection(sel);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('GK');
  });

  it('returns invalid when bench count != 7 (too few)', () => {
    const sel = makeSelection({ bench: makeSquad().slice(11, 14) });
    const result = validateSquadSelection(sel);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns invalid when bench count != 7 (too many)', () => {
    const bench = Array.from({ length: 8 }, (_, i) =>
      makePlayer({ id: `extra-bench-${i}`, role: 'CM' })
    );
    const sel = makeSelection({ bench });
    const result = validateSquadSelection(sel);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

// --- recoverFatigue ---

describe('recoverFatigue', () => {
  it('returns 0 when current fatigue is 0', () => {
    expect(recoverFatigue(0, 7)).toBe(0);
  });

  it('caps recovery rate at 0.75', () => {
    // 7 days * 0.12 = 0.84, capped at 0.75
    const result = recoverFatigue(1.0, 7);
    expect(result).toBeCloseTo(0.25, 5);
  });

  it('applies linear recovery for shorter gaps', () => {
    // 3 days * 0.12 = 0.36 recovery rate
    const result = recoverFatigue(0.8, 3);
    expect(result).toBeCloseTo(0.8 * (1 - 0.36), 5);
  });

  it('never returns negative', () => {
    expect(recoverFatigue(0.01, 100)).toBeGreaterThanOrEqual(0);
  });
});

// --- advanceMatchday ---

describe('advanceMatchday', () => {
  it('increments currentMatchday', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'adv-seed');
    const next = advanceMatchday(state, { homeGoals: 2, awayGoals: 1 }, true);
    expect(next.currentMatchday).toBe(2);
  });

  it('records the player fixture result', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'adv-seed');
    const next = advanceMatchday(state, { homeGoals: 3, awayGoals: 0 }, true);
    // Find the player's matchday 1 fixture
    const playerFixture = next.fixtures.find(
      f => f.matchday === 1 && (f.homeTeamId === 'my-team' || f.awayTeamId === 'my-team')
    );
    expect(playerFixture?.result).toBeDefined();
  });

  it('updates the league table', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'adv-seed');
    const next = advanceMatchday(state, { homeGoals: 1, awayGoals: 0 }, true);
    // At least some teams should have played = 1
    const played = next.table.filter(r => r.played > 0);
    expect(played.length).toBeGreaterThan(0);
  });

  it('applies fatigue recovery to all players', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'fatigue-seed');
    // Set some fatigue first
    for (const [key] of state.fatigueMap) {
      state.fatigueMap.set(key, 0.8);
    }
    const next = advanceMatchday(state, { homeGoals: 0, awayGoals: 0 }, true);
    // After recovery with 7 days gap, fatigue should be lower
    for (const fatigue of next.fatigueMap.values()) {
      expect(fatigue).toBeLessThan(0.8);
    }
  });
});

describe('recordPlayerResult', () => {
  it('persists optional fixture match stats payload on player fixture', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'stats-seed');
    const matchStats = {
      players: [{ id: 'home-0', name: 'Example', role: 'ST', teamId: 'home' as const }],
      playerStats: [],
    };
    const progress = recordPlayerResult(state, { homeGoals: 2, awayGoals: 1 }, true, matchStats);
    const playerFixture = progress.state.fixtures.find(
      f => f.matchday === 1 && (f.homeTeamId === 'my-team' || f.awayTeamId === 'my-team')
    );
    expect(playerFixture?.matchStats).toEqual(matchStats);
  });
});

// --- isSeasonComplete ---

describe('isSeasonComplete', () => {
  it('returns false at matchday 1', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'comp-seed');
    expect(isSeasonComplete(state)).toBe(false);
  });

  it('returns false at matchday 38', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'comp-seed');
    state.currentMatchday = 38;
    expect(isSeasonComplete(state)).toBe(false);
  });

  it('returns true when currentMatchday > 38', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'comp-seed');
    state.currentMatchday = 39;
    expect(isSeasonComplete(state)).toBe(true);
  });
});

// --- getChampion ---

describe('getChampion', () => {
  it('returns the team at position 0 of sorted table', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'champ-seed');
    // Manually set one team to have the most points
    const topTeam = state.table.find(r => r.teamId === 'my-team')!;
    topTeam.points = 100;
    topTeam.goalsFor = 80;
    const champ = getChampion(state);
    expect(champ.teamId).toBe('my-team');
    expect(champ.points).toBe(100);
  });
});

// --- startNewSeason ---

describe('startNewSeason', () => {
  it('resets currentMatchday to 1', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'new-season-seed');
    state.currentMatchday = 39;
    const next = startNewSeason(state, squad);
    expect(next.currentMatchday).toBe(1);
  });

  it('increments seasonNumber', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'new-season-seed');
    const next = startNewSeason(state, squad);
    expect(next.seasonNumber).toBe(state.seasonNumber + 1);
  });

  it('generates fresh fixtures (380)', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'new-season-seed');
    const next = startNewSeason(state, squad);
    expect(next.fixtures).toHaveLength(380);
    // All fixtures should have no results
    for (const f of next.fixtures) {
      expect(f.result).toBeUndefined();
    }
  });

  it('resets table to all zeros', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'new-season-seed');
    // Modify table
    state.table[0]!.points = 50;
    const next = startNewSeason(state, squad);
    for (const row of next.table) {
      expect(row.played).toBe(0);
      expect(row.points).toBe(0);
    }
  });

  it('preserves player squad players (with age progression)', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'new-season-seed');
    const next = startNewSeason(state, squad);
    const playerTeam = next.teams.find(t => t.isPlayerTeam);
    expect(playerTeam).toBeDefined();
    // Squad length preserved, same player IDs, ages incremented by 1
    expect(playerTeam!.squad.length).toBe(squad.length);
    for (let i = 0; i < squad.length; i++) {
      expect(playerTeam!.squad[i]!.id).toBe(squad[i]!.id);
      expect(playerTeam!.squad[i]!.age).toBe((squad[i]!.age ?? 25) + 1);
    }
  });

  it('resets fatigueMap to 0 for all players', () => {
    const squad = makeSquad('my-team');
    const state = createSeason('my-team', 'My Team FC', squad, 'new-season-seed');
    // Set fatigue
    for (const [key] of state.fatigueMap) {
      state.fatigueMap.set(key, 0.5);
    }
    const next = startNewSeason(state, squad);
    for (const fatigue of next.fatigueMap.values()) {
      expect(fatigue).toBe(0);
    }
  });
});
