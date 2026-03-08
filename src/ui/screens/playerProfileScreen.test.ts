/**
 * Player profile screen tests.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerProfileScreen } from './playerProfileScreen.ts';
import type { PlayerState, PlayerAttributes, PersonalityVector } from '../../simulation/types.ts';
import { Duty } from '../../simulation/types.ts';
import { Vec2 } from '../../simulation/math/vec2.ts';
import type { PlayerSeasonStats } from '../../season/playerStats.ts';
import type { SeasonTeam } from '../../season/season.ts';

vi.mock('../portrait/portraitCache.ts', () => ({
  getOrGeneratePortrait: vi.fn(),
}));

function makeAttributes(overrides?: Partial<PlayerAttributes>): PlayerAttributes {
  return {
    pace: 0.82,
    strength: 0.66,
    stamina: 0.74,
    dribbling: 0.78,
    passing: 0.81,
    shooting: 0.69,
    tackling: 0.58,
    aerial: 0.61,
    positioning: 0.72,
    vision: 0.84,
    acceleration: 0.8,
    crossing: 0.7,
    finishing: 0.67,
    agility: 0.76,
    heading: 0.55,
    concentration: 0.71,
    reflexes: 0.36,
    handling: 0.38,
    oneOnOnes: 0.35,
    distribution: 0.42,
    ...overrides,
  };
}

function makePersonality(): PersonalityVector {
  return {
    directness: 0.5,
    risk_appetite: 0.58,
    composure: 0.62,
    creativity: 0.67,
    work_rate: 0.73,
    aggression: 0.49,
    anticipation: 0.64,
    flair: 0.71,
  };
}

function makePlayer(): PlayerState {
  return {
    id: 'player-1',
    teamId: 'home',
    position: Vec2.zero(),
    velocity: Vec2.zero(),
    formationAnchor: Vec2.zero(),
    attributes: makeAttributes(),
    personality: makePersonality(),
    fatigue: 0,
    role: 'CM',
    duty: Duty.SUPPORT,
    name: 'Test Midfielder',
    age: 24,
    shirtNumber: 8,
    height: 181,
    nationality: 'GB',
  };
}

function makeTeam(): SeasonTeam {
  return {
    id: 'team-1',
    name: 'Test FC',
    tier: 'mid',
    squad: [makePlayer()],
    isPlayerTeam: true,
  };
}

function makeSeasonStats(): PlayerSeasonStats {
  return {
    goals: 7,
    assists: 9,
    appearances: 14,
    shots: 33,
    shotsOnTarget: 16,
    passes: 620,
    passesCompleted: 542,
    tacklesWon: 21,
    tacklesAttempted: 28,
    yellowCards: 3,
    redCards: 0,
    cleanSheets: 0,
    minutesPlayed: 1170,
  };
}

describe('PlayerProfileScreen', () => {
  let container: HTMLElement;
  let screen: PlayerProfileScreen;

  beforeEach(() => {
    container = document.createElement('div');
    screen = new PlayerProfileScreen(container);
  });

  it('renders a grouped radar chart alongside the grouped attribute boxes', () => {
    screen.update(makePlayer(), makeTeam(), makeSeasonStats(), 3);

    const radar = container.querySelector('[data-profile-radar-chart]');
    const groups = container.querySelector('[data-profile-attribute-groups]');
    const coachReport = container.querySelector('[data-profile-coach-report]');
    expect(radar).not.toBeNull();
    expect(groups).not.toBeNull();
    expect(coachReport).not.toBeNull();
    expect(container.textContent).toContain('Attribute Radar');
    expect(container.textContent).toContain('Coach Report');
    expect(container.textContent).toContain('Physical');
    expect(container.textContent).toContain('Goalkeeping');

    const circles = radar?.querySelectorAll('circle') ?? [];
    expect(circles.length).toBe(21);
  });

  it('renders season stats in a table row instead of stat cards', () => {
    screen.update(makePlayer(), makeTeam(), makeSeasonStats(), 3);

    const table = container.querySelector('[data-profile-season-stats-table]');
    expect(table).not.toBeNull();
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(1);
    expect(table?.textContent).toContain('Season 3');
    expect(table?.textContent).toContain('1170');
    expect(table?.textContent).toContain('87%');
    expect(table?.textContent).toContain('75%');
  });
});
