/**
 * Day Loop module tests — TDD RED phase
 * Tests for advanceDay, getDaySchedule, isMatchDay pure functions.
 *
 * Covers:
 *  - advanceDay with drill applies one drill session and increments currentDay
 *  - advanceDay with 'rest' increments currentDay without attribute changes
 *  - advanceDay at match day throws (cannot advance past match day)
 *  - advanceDay accumulates trainingDeltas across multiple days
 *  - getDaySchedule returns correct descriptors with past/current/future status
 *  - isMatchDay returns true when currentDay === TRAINING_DAYS_PER_MATCHDAY
 */

import { describe, it, expect } from 'vitest';
import { advanceDay, getDaySchedule, isMatchDay } from './dayLoop.ts';
import type { DayAdvanceResult, DayDescriptor } from './dayLoop.ts';
import { TRAINING_DAYS_PER_MATCHDAY, DrillType } from './training.ts';
import type { SeasonState, SeasonTeam } from './season.ts';
import type { PlayerState, PlayerAttributes, PersonalityVector } from '../simulation/types.ts';
import { Duty } from '../simulation/types.ts';
import { Vec2 } from '../simulation/math/vec2.ts';
import type { TeamRecord } from './leagueTable.ts';
import type { TransferMarketState } from './transferMarket.ts';
import type { InboxState } from './inbox.ts';
import type { PlayerSeasonStats } from './playerStats.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDefaultAttributes(overrides?: Partial<PlayerAttributes>): PlayerAttributes {
  return {
    pace: 0.50,
    strength: 0.50,
    stamina: 0.50,
    dribbling: 0.50,
    passing: 0.50,
    shooting: 0.50,
    tackling: 0.50,
    aerial: 0.50,
    positioning: 0.50,
    vision: 0.50,
    acceleration: 0.50,
    crossing: 0.50,
    finishing: 0.50,
    agility: 0.50,
    heading: 0.50,
    concentration: 0.50,
    reflexes: 0.40,
    handling: 0.40,
    oneOnOnes: 0.40,
    distribution: 0.50,
    ...overrides,
  };
}

function makeDefaultPersonality(overrides?: Partial<PersonalityVector>): PersonalityVector {
  return {
    directness: 0.5,
    risk_appetite: 0.5,
    composure: 0.5,
    creativity: 0.5,
    work_rate: 0.5,
    aggression: 0.5,
    anticipation: 0.5,
    flair: 0.5,
    ...overrides,
  };
}

function makePlayer(id: string, attrOverrides?: Partial<PlayerAttributes>): PlayerState {
  return {
    id,
    teamId: 'player-team',
    position: Vec2.zero(),
    velocity: Vec2.zero(),
    formationAnchor: Vec2.zero(),
    attributes: makeDefaultAttributes(attrOverrides),
    personality: makeDefaultPersonality(),
    fatigue: 0,
    role: 'CM',
    duty: Duty.SUPPORT,
    age: 25,
  };
}

function makeMinimalSeasonState(overrides?: {
  currentDay?: number;
  trainingSchedule?: Record<number, string>;
  squad?: PlayerState[];
}): SeasonState {
  const squad = overrides?.squad ?? [
    makePlayer('player-1'),
    makePlayer('player-2'),
  ];

  const playerTeam: SeasonTeam = {
    id: 'player-team',
    name: 'Test FC',
    tier: 'mid',
    squad,
    isPlayerTeam: true,
  };

  const emptyTable: TeamRecord[] = [];
  const emptyStats = new Map<string, PlayerSeasonStats>();
  const emptyFatigue = new Map<string, number>();
  for (const p of squad) {
    emptyFatigue.set(p.id, 0);
  }

  const transferMarket: TransferMarketState = {
    listings: [],
    bids: [],
    freeAgents: [],
    playerValues: new Map(),
    teamBudgets: new Map(),
  };

  const inbox: InboxState = {
    messages: [],
    unreadCount: 0,
  };

  return {
    seasonNumber: 1,
    playerTeamId: 'player-team',
    teams: [playerTeam],
    fixtures: [],
    table: emptyTable,
    currentMatchday: 1,
    fatigueMap: emptyFatigue,
    playerSeasonStats: emptyStats,
    transferMarket,
    inbox,
    seed: 'test-seed',
    currentDay: overrides?.currentDay ?? 0,
    trainingSchedule: overrides?.trainingSchedule as Record<number, import('./season.ts').TrainingDayPlan> | undefined,
  };
}

// ---------------------------------------------------------------------------
// isMatchDay
// ---------------------------------------------------------------------------

describe('isMatchDay', () => {
  it('returns false when currentDay is 0 (first training day)', () => {
    const state = makeMinimalSeasonState({ currentDay: 0 });
    expect(isMatchDay(state)).toBe(false);
  });

  it('returns false when currentDay is 1', () => {
    const state = makeMinimalSeasonState({ currentDay: 1 });
    expect(isMatchDay(state)).toBe(false);
  });

  it('returns false when currentDay is 2 (last training day)', () => {
    const state = makeMinimalSeasonState({ currentDay: 2 });
    expect(isMatchDay(state)).toBe(false);
  });

  it('returns true when currentDay equals TRAINING_DAYS_PER_MATCHDAY (3)', () => {
    const state = makeMinimalSeasonState({ currentDay: TRAINING_DAYS_PER_MATCHDAY });
    expect(isMatchDay(state)).toBe(true);
  });

  it('returns true when currentDay exceeds TRAINING_DAYS_PER_MATCHDAY', () => {
    const state = makeMinimalSeasonState({ currentDay: TRAINING_DAYS_PER_MATCHDAY + 1 });
    expect(isMatchDay(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// advanceDay — drill session
// ---------------------------------------------------------------------------

describe('advanceDay — training day with drill', () => {
  it('increments currentDay by 1', () => {
    const state = makeMinimalSeasonState({
      currentDay: 0,
      trainingSchedule: { 0: 'passing' },
    });
    const result = advanceDay(state);
    expect(result.state.currentDay).toBe(1);
  });

  it('returns isMatchDay=false when not reaching match day', () => {
    const state = makeMinimalSeasonState({
      currentDay: 0,
      trainingSchedule: { 0: 'passing' },
    });
    const result = advanceDay(state);
    expect(result.isMatchDay).toBe(false);
  });

  it('applies drill and improves targeted attributes on all squad players', () => {
    const state = makeMinimalSeasonState({
      currentDay: 0,
      trainingSchedule: { 0: 'passing' },
    });
    const beforePassing = state.teams.find(t => t.isPlayerTeam)!.squad[0]!.attributes.passing;
    const result = advanceDay(state);
    const afterPassing = result.state.teams.find(t => t.isPlayerTeam)!.squad[0]!.attributes.passing;
    expect(afterPassing).toBeGreaterThan(beforePassing);
  });

  it('does not mutate the original state (pure function)', () => {
    const state = makeMinimalSeasonState({
      currentDay: 0,
      trainingSchedule: { 0: 'passing' },
    });
    const originalDay = state.currentDay;
    const originalPassing = state.teams[0]!.squad[0]!.attributes.passing;

    advanceDay(state);

    expect(state.currentDay).toBe(originalDay);
    expect(state.teams[0]!.squad[0]!.attributes.passing).toBe(originalPassing);
  });

  it('accumulates trainingDeltas — drill gains recorded for each player', () => {
    const state = makeMinimalSeasonState({
      currentDay: 0,
      trainingSchedule: { 0: 'passing' },
    });
    const result = advanceDay(state);
    const deltas = result.state.trainingDeltas;
    expect(deltas).toBeDefined();
    expect(deltas!.has('player-1')).toBe(true);
    expect(deltas!.has('player-2')).toBe(true);
    // passing drill should produce passing delta > 0
    expect(deltas!.get('player-1')!['passing']).toBeGreaterThan(0);
  });

  it('accumulates trainingDeltas additively across multiple days', () => {
    const state = makeMinimalSeasonState({
      currentDay: 0,
      trainingSchedule: { 0: 'passing', 1: 'passing' },
    });
    const afterDay1 = advanceDay(state);
    const afterDay2 = advanceDay(afterDay1.state);

    const deltaAfterDay1 = afterDay1.state.trainingDeltas!.get('player-1')!['passing'] ?? 0;
    const deltaAfterDay2 = afterDay2.state.trainingDeltas!.get('player-1')!['passing'] ?? 0;

    // After two passing days, accumulated delta should be larger
    expect(deltaAfterDay2).toBeGreaterThan(deltaAfterDay1);
  });
});

// ---------------------------------------------------------------------------
// advanceDay — rest day
// ---------------------------------------------------------------------------

describe('advanceDay — training day with rest', () => {
  it('increments currentDay by 1', () => {
    const state = makeMinimalSeasonState({
      currentDay: 1,
      trainingSchedule: { 1: 'rest' },
    });
    const result = advanceDay(state);
    expect(result.state.currentDay).toBe(2);
  });

  it('does not change any player attributes on rest day', () => {
    const state = makeMinimalSeasonState({
      currentDay: 1,
      trainingSchedule: { 1: 'rest' },
    });
    const beforeAttrs = JSON.stringify(state.teams[0]!.squad[0]!.attributes);
    const result = advanceDay(state);
    const afterAttrs = JSON.stringify(result.state.teams[0]!.squad[0]!.attributes);
    expect(afterAttrs).toBe(beforeAttrs);
  });

  it('no trainingSchedule defaults to rest — no attribute changes', () => {
    const state = makeMinimalSeasonState({ currentDay: 0 });
    const beforeAttrs = JSON.stringify(state.teams[0]!.squad[0]!.attributes);
    const result = advanceDay(state);
    const afterAttrs = JSON.stringify(result.state.teams[0]!.squad[0]!.attributes);
    expect(afterAttrs).toBe(beforeAttrs);
  });
});

// ---------------------------------------------------------------------------
// advanceDay — reaches match day
// ---------------------------------------------------------------------------

describe('advanceDay — last training day before match day', () => {
  it('returns isMatchDay=true when advancing from day 2 (last training day)', () => {
    const state = makeMinimalSeasonState({
      currentDay: TRAINING_DAYS_PER_MATCHDAY - 1,
      trainingSchedule: { [TRAINING_DAYS_PER_MATCHDAY - 1]: 'passing' },
    });
    const result = advanceDay(state);
    expect(result.isMatchDay).toBe(true);
    expect(result.state.currentDay).toBe(TRAINING_DAYS_PER_MATCHDAY);
  });
});

// ---------------------------------------------------------------------------
// advanceDay — cannot advance past match day
// ---------------------------------------------------------------------------

describe('advanceDay — match day guard', () => {
  it('throws Error when currentDay is already at TRAINING_DAYS_PER_MATCHDAY', () => {
    const state = makeMinimalSeasonState({ currentDay: TRAINING_DAYS_PER_MATCHDAY });
    expect(() => advanceDay(state)).toThrow('Cannot advance past match day');
  });

  it('throws Error when currentDay exceeds TRAINING_DAYS_PER_MATCHDAY', () => {
    const state = makeMinimalSeasonState({ currentDay: TRAINING_DAYS_PER_MATCHDAY + 1 });
    expect(() => advanceDay(state)).toThrow('Cannot advance past match day');
  });
});

// ---------------------------------------------------------------------------
// getDaySchedule
// ---------------------------------------------------------------------------

describe('getDaySchedule', () => {
  it('returns an array of TRAINING_DAYS_PER_MATCHDAY + 1 descriptors (3 training + 1 match)', () => {
    const state = makeMinimalSeasonState({ currentDay: 0 });
    const schedule = getDaySchedule(state);
    expect(schedule).toHaveLength(TRAINING_DAYS_PER_MATCHDAY + 1);
  });

  it('with currentDay=0: first entry is current, rest are future', () => {
    const state = makeMinimalSeasonState({ currentDay: 0 });
    const schedule = getDaySchedule(state);

    expect(schedule[0]!.status).toBe('current');
    expect(schedule[1]!.status).toBe('future');
    expect(schedule[2]!.status).toBe('future');
    expect(schedule[3]!.status).toBe('future');
  });

  it('with currentDay=0: descriptors have correct dayIndex values (0, 1, 2, 3)', () => {
    const state = makeMinimalSeasonState({ currentDay: 0 });
    const schedule = getDaySchedule(state);

    expect(schedule[0]!.dayIndex).toBe(0);
    expect(schedule[1]!.dayIndex).toBe(1);
    expect(schedule[2]!.dayIndex).toBe(2);
    expect(schedule[3]!.dayIndex).toBe(3);
  });

  it('with currentDay=0: descriptors have correct labels', () => {
    const state = makeMinimalSeasonState({ currentDay: 0 });
    const schedule = getDaySchedule(state);

    expect(schedule[0]!.label).toBe('Day 1');
    expect(schedule[1]!.label).toBe('Day 2');
    expect(schedule[2]!.label).toBe('Day 3');
    expect(schedule[3]!.label).toBe('Match Day');
  });

  it('with currentDay=0: training days have type=training, match entry has type=match', () => {
    const state = makeMinimalSeasonState({ currentDay: 0 });
    const schedule = getDaySchedule(state);

    expect(schedule[0]!.type).toBe('training');
    expect(schedule[1]!.type).toBe('training');
    expect(schedule[2]!.type).toBe('training');
    expect(schedule[3]!.type).toBe('match');
  });

  it('with currentDay=2: Day 1 and Day 2 are past, Day 3 is current, Match Day is future', () => {
    const state = makeMinimalSeasonState({ currentDay: 2 });
    const schedule = getDaySchedule(state);

    expect(schedule[0]!.status).toBe('past');    // Day 1 (index 0) — past
    expect(schedule[1]!.status).toBe('past');    // Day 2 (index 1) — past
    expect(schedule[2]!.status).toBe('current'); // Day 3 (index 2) — current
    expect(schedule[3]!.status).toBe('future');  // Match Day — future
  });

  it('with currentDay=TRAINING_DAYS_PER_MATCHDAY (match day): all training days are past, match is current', () => {
    const state = makeMinimalSeasonState({ currentDay: TRAINING_DAYS_PER_MATCHDAY });
    const schedule = getDaySchedule(state);

    expect(schedule[0]!.status).toBe('past');    // Day 1 — past
    expect(schedule[1]!.status).toBe('past');    // Day 2 — past
    expect(schedule[2]!.status).toBe('past');    // Day 3 — past
    expect(schedule[3]!.status).toBe('current'); // Match Day — current
  });

  it('with currentDay=1: Day 1 is past, Day 2 is current, Day 3 and Match Day are future', () => {
    const state = makeMinimalSeasonState({ currentDay: 1 });
    const schedule = getDaySchedule(state);

    expect(schedule[0]!.status).toBe('past');
    expect(schedule[1]!.status).toBe('current');
    expect(schedule[2]!.status).toBe('future');
    expect(schedule[3]!.status).toBe('future');
  });
});
