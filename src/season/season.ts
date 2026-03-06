/**
 * Season state machine — the single authoritative owner of all season-level state.
 * Coordinates matchdays, league table, AI teams, and fatigue.
 */

import seedrandom from 'seedrandom';
import type { PlayerState } from '../simulation/types.ts';
import type { TeamTier } from './teamGen.ts';
import { createAITeam } from './teamGen.ts';
import type { Fixture } from './fixtures.ts';
import { generateFixtures } from './fixtures.ts';
import type { TeamRecord } from './leagueTable.ts';
import { createInitialTable, updateTable, sortTable } from './leagueTable.ts';
import { quickSimMatch } from './quickSim.ts';

// --- Types ---

export interface SquadSelection {
  starters: PlayerState[];  // 11 players
  bench: PlayerState[];     // 5 players
}

export interface SeasonTeam {
  id: string;
  name: string;
  tier: TeamTier;
  squad: PlayerState[];     // 16 players
  isPlayerTeam: boolean;
}

export interface SeasonConfig {
  playerTeamId: string;
  playerTeamName: string;
  seed: string;
}

export interface SeasonState {
  readonly seasonNumber: number;
  readonly playerTeamId: string;
  teams: SeasonTeam[];
  fixtures: Fixture[];
  table: TeamRecord[];
  currentMatchday: number;   // 1..38; > 38 means season complete
  fatigueMap: Map<string, number>;  // playerId -> current fatigue (0..1)
  readonly seed: string;
}

// --- AI Team Names ---

const AI_TEAM_NAMES: string[] = [
  'North City',
  'Westbrook United',
  'Riverside Athletic',
  'Crestwood FC',
  'Ashford Town',
  'Ironbridge Rovers',
  'Stonewall City',
  'Lakeside Borough',
  'Thornfield United',
  'Heathgate FC',
  'Millbrook Rangers',
  'Kingswood Athletic',
  'Darkmoor Town',
  'Blackwater FC',
  'Copperdale United',
  'Oakridge City',
  'Fairhaven Wanderers',
  'Redstone Borough',
  'Whitehall Town',
];

// --- Tier Distribution ---
// 20 teams total: player team + 19 AI
// AI distribution: 4 strong, 10 mid, 5 weak (player occupies 1 slot from weak tier conceptually)

function getAITierDistribution(): TeamTier[] {
  const tiers: TeamTier[] = [];
  for (let i = 0; i < 4; i++) tiers.push('strong');
  for (let i = 0; i < 10; i++) tiers.push('mid');
  for (let i = 0; i < 5; i++) tiers.push('weak');
  return tiers;
}

// --- Fatigue Recovery ---

export function recoverFatigue(currentFatigue: number, daysSinceLastMatch: number): number {
  const recoveryRate = Math.min(0.75, daysSinceLastMatch * 0.12);
  return Math.max(0, currentFatigue * (1 - recoveryRate));
}

// --- Season Functions ---

export function createSeason(
  playerTeamId: string,
  playerTeamName: string,
  playerSquad: PlayerState[],
  seed: string,
): SeasonState {
  const rng = seedrandom(seed);
  const tiers = getAITierDistribution();

  // Build AI teams
  const aiTeams: SeasonTeam[] = tiers.map((tier, index) => {
    const teamId = `ai-team-${index}`;
    const teamName = AI_TEAM_NAMES[index]!;
    const squad = createAITeam(tier, teamId, teamName, rng);
    return { id: teamId, name: teamName, tier, squad, isPlayerTeam: false };
  });

  // Player team
  const playerTeam: SeasonTeam = {
    id: playerTeamId,
    name: playerTeamName,
    tier: 'mid' as TeamTier,  // Player team has no inherent tier
    squad: playerSquad,
    isPlayerTeam: true,
  };

  const teams: SeasonTeam[] = [playerTeam, ...aiTeams];

  // Generate fixtures
  const teamIds = teams.map(t => t.id);
  const fixtures = generateFixtures(teamIds);

  // Create initial league table
  const table = createInitialTable(teams.map(t => ({ id: t.id, name: t.name })));

  // Initialize fatigue map
  const fatigueMap = new Map<string, number>();
  for (const team of teams) {
    for (const player of team.squad) {
      fatigueMap.set(player.id, 0);
    }
  }

  return {
    seasonNumber: 1,
    playerTeamId,
    teams,
    fixtures,
    table,
    currentMatchday: 1,
    fatigueMap,
    seed,
  };
}

export function validateSquadSelection(
  selection: SquadSelection,
): { valid: boolean; reason?: string } {
  if (selection.starters.length !== 11) {
    return { valid: false, reason: `Expected 11 starters, got ${selection.starters.length}` };
  }

  const hasGK = selection.starters.some(p => p.role === 'GK');
  if (!hasGK) {
    return { valid: false, reason: 'No GK in starters — at least one goalkeeper is required' };
  }

  if (selection.bench.length !== 5) {
    return { valid: false, reason: `Expected 5 bench players, got ${selection.bench.length}` };
  }

  return { valid: true };
}

export function advanceMatchday(
  state: SeasonState,
  playerResult: { homeGoals: number; awayGoals: number },
  playerWasHome: boolean,
): SeasonState {
  const rng = seedrandom(`${state.seed}-md-${state.currentMatchday}`);
  const md = state.currentMatchday;

  // Get all fixtures for this matchday
  const mdFixtures = state.fixtures.filter(f => f.matchday === md);

  // Find the player's fixture
  const playerFixture = mdFixtures.find(
    f => f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId
  );

  let updatedTable = [...state.table.map(r => ({ ...r }))];
  const updatedFixtures = [...state.fixtures];

  // Record player result
  if (playerFixture) {
    const fixtureIndex = updatedFixtures.indexOf(
      updatedFixtures.find(f =>
        f.matchday === md &&
        (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId)
      )!
    );

    if (fixtureIndex >= 0) {
      // Determine correct home/away goals based on whether player was home
      const homeGoals = playerWasHome ? playerResult.homeGoals : playerResult.awayGoals;
      const awayGoals = playerWasHome ? playerResult.awayGoals : playerResult.homeGoals;

      updatedFixtures[fixtureIndex] = {
        ...updatedFixtures[fixtureIndex]!,
        result: { homeGoals, awayGoals },
      };

      updatedTable = updateTable(
        updatedTable,
        updatedFixtures[fixtureIndex]!.homeTeamId,
        updatedFixtures[fixtureIndex]!.awayTeamId,
        homeGoals,
        awayGoals,
      );
    }
  }

  // Simulate AI fixtures
  const aiFixtures = mdFixtures.filter(
    f => f.homeTeamId !== state.playerTeamId && f.awayTeamId !== state.playerTeamId
  );

  for (const fixture of aiFixtures) {
    const homeTeam = state.teams.find(t => t.id === fixture.homeTeamId);
    const awayTeam = state.teams.find(t => t.id === fixture.awayTeamId);

    if (homeTeam && awayTeam) {
      // Apply fatigue from fatigueMap to squads for simulation
      const homeSquad = homeTeam.squad.map(p => ({
        ...p,
        fatigue: state.fatigueMap.get(p.id) ?? 0,
      }));
      const awaySquad = awayTeam.squad.map(p => ({
        ...p,
        fatigue: state.fatigueMap.get(p.id) ?? 0,
      }));

      const result = quickSimMatch(homeSquad, awaySquad, rng);

      // Record result on fixture
      const fixtureIndex = updatedFixtures.findIndex(
        f => f.matchday === md && f.homeTeamId === fixture.homeTeamId && f.awayTeamId === fixture.awayTeamId
      );
      if (fixtureIndex >= 0) {
        updatedFixtures[fixtureIndex] = {
          ...updatedFixtures[fixtureIndex]!,
          result,
        };
      }

      updatedTable = updateTable(
        updatedTable,
        fixture.homeTeamId,
        fixture.awayTeamId,
        result.homeGoals,
        result.awayGoals,
      );
    }
  }

  // Apply fatigue recovery (7 days between matchdays)
  const updatedFatigueMap = new Map<string, number>();
  for (const [playerId, currentFatigue] of state.fatigueMap) {
    updatedFatigueMap.set(playerId, recoverFatigue(currentFatigue, 7));
  }

  return {
    ...state,
    fixtures: updatedFixtures,
    table: updatedTable,
    currentMatchday: md + 1,
    fatigueMap: updatedFatigueMap,
  };
}

export function isSeasonComplete(state: SeasonState): boolean {
  return state.currentMatchday > 38;
}

export function getChampion(state: SeasonState): TeamRecord {
  return sortTable(state.table)[0]!;
}

export function startNewSeason(
  state: SeasonState,
  playerSquad: PlayerState[],
): SeasonState {
  const newSeed = `${state.seed}-s${state.seasonNumber + 1}`;
  const rng = seedrandom(newSeed);

  // Regenerate AI teams with new seed
  const tiers = getAITierDistribution();
  const newTeams: SeasonTeam[] = state.teams.map((team, index) => {
    if (team.isPlayerTeam) {
      return { ...team, squad: playerSquad };
    }
    const aiIndex = index - 1; // offset because player team is at 0
    const tier = tiers[aiIndex]!;
    const newSquad = createAITeam(tier, team.id, team.name, rng);
    return { ...team, tier, squad: newSquad };
  });

  // Generate fresh fixtures with same team IDs
  const teamIds = newTeams.map(t => t.id);
  const fixtures = generateFixtures(teamIds);

  // Reset table
  const table = createInitialTable(newTeams.map(t => ({ id: t.id, name: t.name })));

  // Reset fatigue map
  const fatigueMap = new Map<string, number>();
  for (const team of newTeams) {
    for (const player of team.squad) {
      fatigueMap.set(player.id, 0);
    }
  }

  return {
    seasonNumber: state.seasonNumber + 1,
    playerTeamId: state.playerTeamId,
    teams: newTeams,
    fixtures,
    table,
    currentMatchday: 1,
    fatigueMap,
    seed: newSeed,
  };
}
