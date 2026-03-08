/**
 * Season state machine — the single authoritative owner of all season-level state.
 * Coordinates matchdays, league table, AI teams, and fatigue.
 */

import seedrandom from 'seedrandom';
import type { PlayerState, PlayerAttributes, FormationId } from '../simulation/types.ts';
import type { SavedTactic } from '../ui/tacticStore.ts';
import type { DrillType } from './training.ts';
import type { TeamTier } from './teamGen.ts';
import { createAITeam } from './teamGen.ts';
import type { PlayerName } from './nameService.ts';
import type { Fixture, FixtureMatchStats, FixtureReportPlayer } from './fixtures.ts';
import { generateFixtures } from './fixtures.ts';
import { createFixtureMatchStats } from './fixtures.ts';
import type { TeamRecord } from './leagueTable.ts';
import { createInitialTable, updateTable, sortTable } from './leagueTable.ts';
import type { MatchConfig } from '../simulation/engine.ts';
import { quickSimMatch } from './quickSim.ts';
import { pickAssistantLineup, buildFormationTacticalConfig } from './assistantPicks.ts';
import { choosePreferredBuiltInTacticName, loadBuiltInTacticSystem, getDefaultBuiltInTacticName } from './tacticalPresets.ts';
import type { PlayerSeasonStats } from './playerStats.ts';
import { mergeAllMatchStats } from './playerStats.ts';
import type { TransferMarketState } from './transferMarket.ts';
import { generateFreeAgents, createTransferMarket, updateAllPlayerValues } from './transferMarket.ts';
import type { InboxState } from './inbox.ts';
import { createInbox, sendMessage } from './inbox.ts';
import { processAITransfers } from './aiTransfers.ts';

// --- Types ---

/** Per-matchday training slot: the drill type assigned, or 'rest'. */
export type TrainingDayPlan = DrillType | 'rest';

/**
 * Training schedule for the block between two matchdays.
 * Key: day index within the block (0-based, 0 = first day after last match).
 * Value: 'rest' or a DrillType string.
 */
export type TrainingSchedule = Record<number, TrainingDayPlan>;

/**
 * Attribute deltas accumulated during the last completed training block.
 * Key: playerId. Value: partial record of attribute name → delta gained.
 * Cleared at the start of each new training block.
 */
export type TrainingDeltas = Map<string, Partial<Record<keyof PlayerAttributes, number>>>;

export interface SquadSelection {
  starters: PlayerState[];  // 11 players
  bench: PlayerState[];     // 7 players
}

export interface SeasonTeam {
  id: string;
  name: string;
  tier: TeamTier;
  preferredFormation?: FormationId;
  preferredTacticName?: string;
  squad: PlayerState[];     // 25 players
  isPlayerTeam: boolean;
}

export interface SeasonConfig {
  playerTeamId: string;
  playerTeamName: string;
  seed: string;
}

/** Per-player squad slot: role string (starter), 'bench', or 'not-selected', plus optional formation slot index. */
export interface SquadSlot {
  state: string;       // e.g. 'GK', 'CB', 'bench', 'not-selected'
  slotIndex?: number;  // formation slot index (0-10) for starters
}

export interface SeasonState {
  readonly seasonNumber: number;
  readonly playerTeamId: string;
  teams: SeasonTeam[];
  fixtures: Fixture[];
  table: TeamRecord[];
  currentMatchday: number;   // 1..38; > 38 means season complete
  currentDay: number;        // position in training block: 0-2 = training, 3 = match day (TRAINING_DAYS_PER_MATCHDAY)
  fatigueMap: Map<string, number>;  // playerId -> current fatigue (0..1)
  squadSelectionMap?: Map<string, SquadSlot>;  // playerId -> selection state (player team only)
  homeTacticPresetName?: string;  // currently selected tactic name in dropdown (player team)
  homeTacticState?: SavedTactic;  // full player-team tactic snapshot (in/out phases + instructions)
  playerSeasonStats: Map<string, PlayerSeasonStats>;  // playerId -> accumulated season stats
  transferMarket: TransferMarketState;
  inbox: InboxState;
  readonly seed: string;
  trainingSchedule?: TrainingSchedule;   // current block plan — keyed by day slot
  trainingDeltas?: TrainingDeltas;       // last block's per-player attribute gains
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
  names?: PlayerName[] | string[],
): SeasonState {
  const rng = seedrandom(seed);
  const tiers = getAITierDistribution();

  // Build AI teams
  const aiTeams: SeasonTeam[] = tiers.map((tier, index) => {
    const teamId = `ai-team-${index}`;
    const teamName = AI_TEAM_NAMES[index]!;
    const squad = createAITeam(tier, teamId, teamName, rng, names?.slice(index * 25, (index + 1) * 25));
    const preferredTacticName = choosePreferredBuiltInTacticName(tier, rng);
    const system = loadBuiltInTacticSystem(preferredTacticName);
    return {
      id: teamId,
      name: teamName,
      tier,
      preferredTacticName,
      preferredFormation: system?.inPossessionFormation ?? '4-4-2',
      squad,
      isPlayerTeam: false,
    };
  });

  // Player team
  const playerTeam: SeasonTeam = {
    id: playerTeamId,
    name: playerTeamName,
    tier: 'mid' as TeamTier,  // Player team has no inherent tier
    preferredTacticName: getDefaultBuiltInTacticName(),
    preferredFormation: '4-4-2',
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

  // Generate free agents and initialize transfer market
  const freeAgents = generateFreeAgents(100, rng);
  const emptyStats = new Map<string, PlayerSeasonStats>();
  const transferMarket = createTransferMarket(teams, playerTeamId, freeAgents, emptyStats, 0);

  // Initialize inbox with welcome message
  let inbox = createInbox();
  inbox = sendMessage(inbox, {
    subject: 'Welcome to the Transfer Market',
    body: 'The transfer market is now open. You can browse free agents, bid for players from other clubs, and transfer list your own players. Good luck with your squad building!',
    from: 'Board of Directors',
    matchday: 0,
    category: 'general',
  });

  return {
    seasonNumber: 1,
    playerTeamId,
    teams,
    fixtures,
    table,
    currentMatchday: 1,
    currentDay: 0,
    fatigueMap,
    playerSeasonStats: emptyStats,
    transferMarket,
    inbox,
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

  if (selection.bench.length !== 7) {
    return { valid: false, reason: `Expected 7 bench players, got ${selection.bench.length}` };
  }

  return { valid: true };
}

/** Result of recording the player's match before AI sims run. */
export interface MatchdayProgress {
  state: SeasonState;
  aiFixtures: Fixture[];
}

/** Info emitted after each AI fixture is simulated. */
export interface AIFixtureResult {
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
}

/**
 * Step 1: Record the player's result and return the list of AI fixtures to sim.
 */
export function recordPlayerResult(
  state: SeasonState,
  playerResult: { homeGoals: number; awayGoals: number },
  playerWasHome: boolean,
  matchStats?: FixtureMatchStats,
): MatchdayProgress {
  const md = state.currentMatchday;
  const mdFixtures = state.fixtures.filter(f => f.matchday === md);

  let updatedTable = [...state.table.map(r => ({ ...r }))];
  const updatedFixtures = [...state.fixtures];

  const fixtureIndex = updatedFixtures.findIndex(
    f => f.matchday === md &&
      (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId)
  );

  if (fixtureIndex >= 0) {
    const homeGoals = playerWasHome ? playerResult.homeGoals : playerResult.awayGoals;
    const awayGoals = playerWasHome ? playerResult.awayGoals : playerResult.homeGoals;

    updatedFixtures[fixtureIndex] = {
      ...updatedFixtures[fixtureIndex]!,
      result: { homeGoals, awayGoals },
      ...(matchStats ? { matchStats } : {}),
    };

    updatedTable = updateTable(
      updatedTable,
      updatedFixtures[fixtureIndex]!.homeTeamId,
      updatedFixtures[fixtureIndex]!.awayTeamId,
      homeGoals,
      awayGoals,
    );
  }

  const aiFixtures = mdFixtures.filter(
    f => f.homeTeamId !== state.playerTeamId && f.awayTeamId !== state.playerTeamId
  );

  return {
    state: { ...state, fixtures: updatedFixtures, table: updatedTable },
    aiFixtures,
  };
}

/**
 * Step 2: Simulate a single AI fixture and return the updated state + result info.
 */
export function simOneAIFixture(
  state: SeasonState,
  fixture: Fixture,
): { state: SeasonState; result: AIFixtureResult } {
  const md = state.currentMatchday;
  const homeTeam = state.teams.find(t => t.id === fixture.homeTeamId);
  const awayTeam = state.teams.find(t => t.id === fixture.awayTeamId);

  if (!homeTeam || !awayTeam) return { state, result: { homeName: '', awayName: '', homeGoals: 0, awayGoals: 0 } };

  // Home advantage: small attribute boost for home team (~5%)
  const HOME_BOOST = 0.05;
  const homeSquad = homeTeam.squad.map(p => {
    const boosted = { ...p.attributes };
    for (const key of Object.keys(boosted) as (keyof typeof boosted)[]) {
      boosted[key] = Math.min(1, boosted[key] + HOME_BOOST);
    }
    return { ...p, attributes: boosted, fatigue: state.fatigueMap.get(p.id) ?? 0 };
  });
  const awaySquad = awayTeam.squad.map(p => ({
    ...p, fatigue: state.fatigueMap.get(p.id) ?? 0,
  }));

  const homeSystem = homeTeam.preferredTacticName ? loadBuiltInTacticSystem(homeTeam.preferredTacticName) : null;
  const awaySystem = awayTeam.preferredTacticName ? loadBuiltInTacticSystem(awayTeam.preferredTacticName) : null;
  const homeFormation = homeSystem?.inPossessionFormation ?? homeTeam.preferredFormation ?? '4-4-2';
  const awayFormation = awaySystem?.inPossessionFormation ?? awayTeam.preferredFormation ?? '4-4-2';
  const homeLineup = pickAssistantLineup(homeSquad, homeFormation, state.fatigueMap);
  const awayLineup = pickAssistantLineup(awaySquad, awayFormation, state.fatigueMap);

  const matchConfig: MatchConfig = {
    seed: `${state.seed}-md-${md}-${fixture.homeTeamId}-${fixture.awayTeamId}`,
    homeRoster: homeLineup.starters,
    awayRoster: awayLineup.starters,
    homeBench: homeLineup.bench,
    awayBench: awayLineup.bench,
    homeTacticalConfig: homeSystem?.inPossession ?? buildFormationTacticalConfig(homeFormation),
    homeTacticalConfigOOP: homeSystem?.outOfPossession ?? buildFormationTacticalConfig(homeFormation),
    awayTacticalConfig: awaySystem?.inPossession ?? buildFormationTacticalConfig(awayFormation),
    awayTacticalConfigOOP: awaySystem?.outOfPossession ?? buildFormationTacticalConfig(awayFormation),
  };
  const simResult = quickSimMatch(matchConfig);
  const reportPlayers: FixtureReportPlayer[] = [
    ...homeLineup.starters.map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
      role: p.role,
      teamId: 'home' as const,
      shirtNumber: p.shirtNumber,
    })),
    ...awayLineup.starters.map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
      role: p.role,
      teamId: 'away' as const,
      shirtNumber: p.shirtNumber,
    })),
  ];
  const matchStats = createFixtureMatchStats(reportPlayers, simResult.playerStats ?? new Map());

  const updatedFixtures = [...state.fixtures];
  const fixtureIndex = updatedFixtures.findIndex(
    f => f.matchday === md && f.homeTeamId === fixture.homeTeamId && f.awayTeamId === fixture.awayTeamId
  );
  if (fixtureIndex >= 0) {
    updatedFixtures[fixtureIndex] = {
      ...updatedFixtures[fixtureIndex]!,
      result: { homeGoals: simResult.homeGoals, awayGoals: simResult.awayGoals },
      matchStats,
    };
  }

  const updatedTable = updateTable(
    [...state.table.map(r => ({ ...r }))],
    fixture.homeTeamId, fixture.awayTeamId,
    simResult.homeGoals, simResult.awayGoals,
  );

  // Merge AI fixture player stats into season stats (guard against missing stats in tests/mocks)
  const goalsConceded: Record<string, number> = {
    [fixture.homeTeamId]: simResult.awayGoals,
    [fixture.awayTeamId]: simResult.homeGoals,
  };
  const matchPlayerStats = simResult.playerStats ?? new Map();
  const updatedPlayerSeasonStats = mergeAllMatchStats(
    state.playerSeasonStats,
    matchPlayerStats,
    goalsConceded,
  );

  return {
    state: { ...state, fixtures: updatedFixtures, table: updatedTable, playerSeasonStats: updatedPlayerSeasonStats },
    result: {
      homeName: homeTeam.name,
      awayName: awayTeam.name,
      homeGoals: simResult.homeGoals,
      awayGoals: simResult.awayGoals,
    },
  };
}

/**
 * Step 3: Finalize the matchday — apply fatigue recovery, process transfers, update values, and advance.
 */
export function finalizeMatchday(state: SeasonState): SeasonState {
  const updatedFatigueMap = new Map<string, number>();
  for (const [playerId, currentFatigue] of state.fatigueMap) {
    updatedFatigueMap.set(playerId, recoverFatigue(currentFatigue, 7));
  }

  let updated: SeasonState = { ...state, fatigueMap: updatedFatigueMap };

  // Update all player valuations
  const newValues = updateAllPlayerValues(
    updated.teams,
    updated.transferMarket.freeAgents,
    updated.playerSeasonStats,
    updated.currentMatchday,
  );
  updated = {
    ...updated,
    transferMarket: { ...updated.transferMarket, playerValues: newValues },
  };

  // Process AI transfer activity
  const transferRng = seedrandom(`${state.seed}-transfers-md-${state.currentMatchday}`);
  const aiResult = processAITransfers(updated, transferRng);
  updated = {
    ...updated,
    transferMarket: aiResult.market,
    teams: aiResult.teams,
    inbox: aiResult.inbox,
  };

  // Add new players to fatigue map (from transfers)
  const finalFatigueMap = new Map(updated.fatigueMap);
  for (const team of updated.teams) {
    for (const player of team.squad) {
      if (!finalFatigueMap.has(player.id)) {
        finalFatigueMap.set(player.id, 0);
      }
    }
  }

  return { ...updated, currentMatchday: updated.currentMatchday + 1, currentDay: 0, fatigueMap: finalFatigueMap, trainingDeltas: new Map() };
}

/**
 * Legacy all-in-one advanceMatchday (used by tests).
 */
export function advanceMatchday(
  state: SeasonState,
  playerResult: { homeGoals: number; awayGoals: number },
  playerWasHome: boolean,
): SeasonState {
  let { state: current, aiFixtures } = recordPlayerResult(state, playerResult, playerWasHome);
  for (const fixture of aiFixtures) {
    const step = simOneAIFixture(current, fixture);
    current = step.state;
  }
  return finalizeMatchday(current);
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
      return {
        ...team,
        squad: playerSquad,
        preferredTacticName: team.preferredTacticName ?? getDefaultBuiltInTacticName(),
        preferredFormation: team.preferredFormation ?? '4-4-2',
      };
    }
    const aiIndex = index - 1; // offset because player team is at 0
    const tier = tiers[aiIndex]!;
    const newSquad = createAITeam(tier, team.id, team.name, rng);
    const preferredTacticName = choosePreferredBuiltInTacticName(tier, rng);
    const system = loadBuiltInTacticSystem(preferredTacticName);
    return {
      ...team,
      tier,
      preferredTacticName,
      preferredFormation: system?.inPossessionFormation ?? '4-4-2',
      squad: newSquad,
    };
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

  // Generate fresh free agents and transfer market
  const freeAgents = generateFreeAgents(100, rng);
  const emptyStats = new Map<string, PlayerSeasonStats>();
  const transferMarket = createTransferMarket(newTeams, state.playerTeamId, freeAgents, emptyStats, 0);

  // Carry over budget from previous season (with a top-up)
  const prevBudgets = state.transferMarket.teamBudgets;
  for (const team of newTeams) {
    const prevBudget = prevBudgets.get(team.id) ?? 0;
    const topUp = team.isPlayerTeam ? 200_000 : (team.tier === 'strong' ? 400_000 : team.tier === 'mid' ? 250_000 : 100_000);
    transferMarket.teamBudgets.set(team.id, prevBudget + topUp);
  }

  // Fresh inbox (keep no messages from previous season)
  const inbox = createInbox();

  return {
    seasonNumber: state.seasonNumber + 1,
    playerTeamId: state.playerTeamId,
    teams: newTeams,
    fixtures,
    table,
    currentMatchday: 1,
    currentDay: 0,
    fatigueMap,
    playerSeasonStats: emptyStats,
    transferMarket,
    inbox,
    seed: newSeed,
  };
}
