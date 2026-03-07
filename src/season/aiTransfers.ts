/**
 * AI transfer behaviour — listing players and buying to fill squad gaps.
 *
 * Called during finalizeMatchday() to process all AI team transfer activity.
 */

import type { SeasonState } from './season.ts';
import { sendMessage } from './inbox.ts';
import { analyzeSquadGaps, calculatePlayerRating } from './playerAnalysis.ts';
import {
  transferListPlayer,
  executeTransfer,
  formatMoney,
} from './transferMarket.ts';
import type { TransferMarketState } from './transferMarket.ts';
import type { Role } from '../simulation/types.ts';

// --- Constants ---

/** Average probability of an AI team listing a player per matchday. */
const LISTING_PROBABILITY = 0.2;

/** Minimum squad size before AI stops selling/listing. */
const MIN_SQUAD_SIZE = 20;

/** Rating gap threshold to trigger buying (team avg - position best). */
const GAP_THRESHOLD = 3;

// --- Main Entry Point ---

export interface AITransferResult {
  market: TransferMarketState;
  teams: SeasonState['teams'];
  inbox: SeasonState['inbox'];
}

/**
 * Process all AI transfer activity for the current matchday.
 */
export function processAITransfers(state: SeasonState, rng: () => number): AITransferResult {
  let market = { ...state.transferMarket };
  let teams = [...state.teams];
  let inbox = { ...state.inbox };

  const matchday = state.currentMatchday;
  const playerStats = state.playerSeasonStats;

  // Phase 1: AI teams list players
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i]!;
    if (team.isPlayerTeam) continue;
    if (team.squad.length <= MIN_SQUAD_SIZE) continue;

    // ~0.2 probability per matchday
    if (rng() >= LISTING_PROBABILITY) continue;

    // Pick a player to list, biased toward low-appearance players
    const player = pickPlayerToList(team.squad, playerStats, rng);
    if (!player) continue;

    // Don't list if already listed
    if (market.listings.some(l => l.playerId === player.id)) continue;

    // List with asking price = value * random factor (0.9..1.1)
    const value = market.playerValues.get(player.id) ?? 1000;
    const askFactor = 0.9 + rng() * 0.2;
    market = transferListPlayer(market, player.id, team.id, matchday);
    // Update asking price
    const listIdx = market.listings.findIndex(l => l.playerId === player.id);
    if (listIdx >= 0) {
      const listings = [...market.listings];
      listings[listIdx] = { ...listings[listIdx]!, askingPrice: Math.round(value * askFactor / 100) * 100 };
      market = { ...market, listings };
    }

    // Notify player
    inbox = sendMessage(inbox, {
      subject: `Transfer Listed: ${player.name ?? 'Unknown'}`,
      body: `${team.name} have transfer listed ${player.name ?? 'Unknown'} (${player.role}) for £${formatMoney(Math.round(value * askFactor / 100) * 100)}.`,
      from: 'Transfer News',
      matchday,
      category: 'transfer',
    });
  }

  // Phase 2: AI teams buy players to fill gaps
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i]!;
    if (team.isPlayerTeam) continue;

    const budget = market.teamBudgets.get(team.id) ?? 0;
    if (budget <= 0) continue;

    // Analyze squad gaps
    const gaps = analyzeSquadGaps(team.squad);
    const significantGap = gaps.find(g => g.gap > GAP_THRESHOLD);
    if (!significantGap) continue;

    // Search for a suitable player on the transfer list or free agents
    const targetRole = significantGap.role;
    const candidate = findBestCandidate(market, teams, targetRole, significantGap.bestRating, budget, team.id);
    if (!candidate) continue;

    // Execute the purchase
    const { playerId, fromTeamId, cost } = candidate;

    const result = executeTransfer(market, teams, team.id, fromTeamId, playerId, cost);
    market = result.market;
    teams = result.teams;

    // Find player name for notification
    const playerName = candidate.playerName;
    const isFreeAgent = fromTeamId === 'free-agent';
    const fromTeamName = isFreeAgent ? 'free agency' : (teams.find(t => t.id === fromTeamId)?.name ?? 'another club');

    inbox = sendMessage(inbox, {
      subject: `Transfer Complete: ${playerName}`,
      body: `${team.name} have signed ${playerName} (${targetRole}) from ${fromTeamName}${isFreeAgent ? '' : ` for £${formatMoney(cost)}`}.`,
      from: 'Transfer News',
      matchday,
      category: 'transfer',
    });
  }

  return { market, teams, inbox };
}

// --- Helpers ---

/**
 * Pick a player to list from an AI team, biased toward unused/low-appearance players.
 */
function pickPlayerToList(
  squad: SeasonState['teams'][0]['squad'],
  playerStats: Map<string, import('./playerStats.ts').PlayerSeasonStats>,
  rng: () => number,
): SeasonState['teams'][0]['squad'][0] | null {
  // Assign weights: players with fewer appearances get higher weight
  const weights: number[] = squad.map(p => {
    const stats = playerStats.get(p.id);
    const apps = stats?.appearances ?? 0;
    // Inverse weight: 0 appearances = weight 10, 1 = 5, 5+ = 1
    return Math.max(1, 10 - apps * 2);
  });

  // Don't list GKs if only 2 left
  const gkCount = squad.filter(p => p.role === 'GK').length;

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * totalWeight;
  for (let i = 0; i < squad.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) {
      const player = squad[i]!;
      // Skip if GK and we can't afford to lose one
      if (player.role === 'GK' && gkCount <= 2) continue;
      return player;
    }
  }

  return null;
}

interface BuyCandidate {
  playerId: string;
  fromTeamId: string;
  cost: number;
  rating: number;
  playerName: string;
}

/**
 * Find the best available player for a given role on the transfer list/free agents.
 */
function findBestCandidate(
  market: TransferMarketState,
  teams: SeasonState['teams'],
  targetRole: Role,
  currentBestRating: number,
  budget: number,
  buyingTeamId: string,
): BuyCandidate | null {
  const candidates: BuyCandidate[] = [];

  for (const listing of market.listings) {
    // Don't buy from yourself
    if (listing.teamId === buyingTeamId) continue;

    // Find the player
    let player;
    if (listing.teamId === 'free-agent') {
      player = market.freeAgents.find(p => p.id === listing.playerId);
    } else {
      const team = teams.find(t => t.id === listing.teamId);
      player = team?.squad.find(p => p.id === listing.playerId);
    }

    if (!player) continue;
    if (player.role !== targetRole) continue;

    const rating = calculatePlayerRating(player);
    if (rating <= currentBestRating) continue; // Must be an improvement

    const cost = listing.teamId === 'free-agent' ? 0 : listing.askingPrice;
    if (cost > budget) continue;

    candidates.push({
      playerId: player.id,
      fromTeamId: listing.teamId,
      cost,
      rating,
      playerName: player.name ?? 'Unknown',
    });
  }

  if (candidates.length === 0) return null;

  // Pick the best-rated affordable candidate
  candidates.sort((a, b) => b.rating - a.rating);
  return candidates[0]!;
}
