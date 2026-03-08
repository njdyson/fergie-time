/**
 * Hub Screen tests — Plan 02
 *
 * Verifies Continue vs Kick Off button rendering based on isMatchDay state.
 * Uses jsdom (via vitest) — document.createElement as container.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HubScreen } from './hubScreen.ts';
import { TRAINING_DAYS_PER_MATCHDAY } from '../../season/training.ts';
import type { SeasonState, SeasonTeam } from '../../season/season.ts';
import type { PlayerState, PlayerAttributes, PersonalityVector } from '../../simulation/types.ts';
import { Duty } from '../../simulation/types.ts';
import { Vec2 } from '../../simulation/math/vec2.ts';
import type { TeamRecord } from '../../season/leagueTable.ts';
import type { TransferMarketState } from '../../season/transferMarket.ts';
import type { InboxState } from '../../season/inbox.ts';
import type { PlayerSeasonStats } from '../../season/playerStats.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDefaultAttributes(): PlayerAttributes {
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
  };
}

function makeDefaultPersonality(): PersonalityVector {
  return {
    directness: 0.5,
    risk_appetite: 0.5,
    composure: 0.5,
    creativity: 0.5,
    work_rate: 0.5,
    aggression: 0.5,
    anticipation: 0.5,
    flair: 0.5,
  };
}

function makePlayer(id: string): PlayerState {
  return {
    id,
    teamId: 'home',
    position: Vec2.zero(),
    velocity: Vec2.zero(),
    formationAnchor: Vec2.zero(),
    attributes: makeDefaultAttributes(),
    personality: makeDefaultPersonality(),
    fatigue: 0,
    role: 'CM',
    duty: Duty.SUPPORT,
    age: 25,
  };
}

function makeSeasonState(currentDay: number): SeasonState {
  const squad = [makePlayer('player-1'), makePlayer('player-2')];

  const playerTeam: SeasonTeam = {
    id: 'player-team',
    name: 'Test FC',
    tier: 'mid',
    squad,
    isPlayerTeam: true,
  };

  // One upcoming fixture so the schedule card renders
  const nextFixture = {
    id: 'fixture-1',
    homeTeamId: 'player-team',
    awayTeamId: 'opponent-team',
    matchday: 1,
  };

  const opponentTeam: SeasonTeam = {
    id: 'opponent-team',
    name: 'Opponent FC',
    tier: 'mid',
    squad: [],
    isPlayerTeam: false,
  };

  const emptyStats = new Map<string, PlayerSeasonStats>();
  const emptyFatigue = new Map<string, number>();
  const emptyTable: TeamRecord[] = [];

  const transferMarket: TransferMarketState = {
    listings: [],
    bids: [],
    freeAgents: [],
    playerValues: new Map(),
    teamBudgets: new Map(),
  };

  const inbox: InboxState = {
    messages: [],
  };

  const base: SeasonState = {
    seasonNumber: 1,
    playerTeamId: 'player-team',
    teams: [playerTeam, opponentTeam],
    fixtures: [nextFixture],
    table: emptyTable,
    currentMatchday: 1,
    fatigueMap: emptyFatigue,
    playerSeasonStats: emptyStats,
    transferMarket,
    inbox,
    seed: 'test-seed',
    currentDay,
  };

  return base;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HubScreen button rendering', () => {
  let container: HTMLElement;
  let screen: HubScreen;

  beforeEach(() => {
    container = document.createElement('div');
    screen = new HubScreen(container);
  });

  it('renders #hub-continue-btn and NOT #hub-kickoff-btn when not on match day', () => {
    const state = makeSeasonState(0); // currentDay=0, not match day
    screen.update(state, 'Test FC');

    const continueBtn = container.querySelector('#hub-continue-btn');
    const kickoffBtn = container.querySelector('#hub-kickoff-btn');

    expect(continueBtn).not.toBeNull();
    expect(kickoffBtn).toBeNull();
  });

  it('renders #hub-kickoff-btn and NOT #hub-continue-btn when on match day', () => {
    const state = makeSeasonState(TRAINING_DAYS_PER_MATCHDAY); // currentDay=3, match day
    screen.update(state, 'Test FC');

    const continueBtn = container.querySelector('#hub-continue-btn');
    const kickoffBtn = container.querySelector('#hub-kickoff-btn');

    expect(kickoffBtn).not.toBeNull();
    expect(continueBtn).toBeNull();
  });

  it('still shows Kick Off at currentDay > TRAINING_DAYS_PER_MATCHDAY (already on match day)', () => {
    const state = makeSeasonState(TRAINING_DAYS_PER_MATCHDAY + 1);
    screen.update(state, 'Test FC');

    expect(container.querySelector('#hub-kickoff-btn')).not.toBeNull();
    expect(container.querySelector('#hub-continue-btn')).toBeNull();
  });

  it('fires continueCallbacks when Continue is clicked', () => {
    const state = makeSeasonState(0);
    screen.update(state, 'Test FC');

    let called = false;
    screen.onContinue(() => { called = true; });

    // Need to re-render after registering callback (callbacks are stored, not re-registered on re-render)
    // Actually callbacks are stored — just click the button
    const btn = container.querySelector('#hub-continue-btn') as HTMLButtonElement;
    btn?.click();

    expect(called).toBe(true);
  });

  it('fires kickoffCallbacks when Kick Off is clicked', () => {
    const state = makeSeasonState(TRAINING_DAYS_PER_MATCHDAY);
    screen.update(state, 'Test FC');

    let called = false;
    screen.onKickoff(() => { called = true; });

    // Re-render after registering callback (buttons re-wired on each update)
    screen.update(state, 'Test FC');
    const btn = container.querySelector('#hub-kickoff-btn') as HTMLButtonElement;
    btn?.click();

    expect(called).toBe(true);
  });
});
