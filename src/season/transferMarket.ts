/**
 * Transfer market state, listing, bidding, free agent generation, and value updates.
 */

import type { PlayerState, Role } from '../simulation/types.ts';
import { Duty } from '../simulation/types.ts';
import { Vec2 } from '../simulation/math/vec2.ts';
import { generatePlayerName } from './nameGen.ts';
import type { PlayerSeasonStats } from './playerStats.ts';
import type { SeasonTeam } from './season.ts';
import { calculatePlayerValue, calculatePlayerRating, getSquadDepth } from './playerAnalysis.ts';
import type { InboxState } from './inbox.ts';
import { sendMessage } from './inbox.ts';

// --- Types ---

export interface TransferListing {
  readonly playerId: string;
  readonly teamId: string;          // 'free-agent' for free agents
  readonly askingPrice: number;
  readonly listedAt: number;        // matchday listed
}

export interface Bid {
  readonly id: string;
  readonly fromTeamId: string;
  readonly toTeamId: string;        // or 'free-agent'
  readonly playerId: string;
  readonly amount: number;
  readonly status: 'pending' | 'accepted' | 'rejected';
  readonly matchday: number;
}

export interface TransferMarketState {
  freeAgents: PlayerState[];
  listings: TransferListing[];
  bids: Bid[];
  playerValues: Map<string, number>;
  teamBudgets: Map<string, number>;
}

// --- Free Agent Generation ---

/** Subset of roles for free agents (weighted like a full squad minus some depth). */
const FREE_AGENT_ROLES: Role[] = [
  'GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST',
];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function generateAttribute(base: number, spread: number, rng: () => number): number {
  return clamp(base + (rng() - 0.5) * 2 * spread, 0, 1);
}

function generateFreeAgentAttributes(base: number, spread: number, rng: () => number, role: Role): PlayerState['attributes'] {
  // Re-use teamGen's ROLE_BOOSTS logic inline (simpler than exporting internals)
  const ROLE_BOOSTS: Partial<Record<Role, Partial<Record<keyof PlayerState['attributes'], number>>>> = {
    GK:  { positioning: 0.10, aerial: 0.08, reflexes: 0.15, handling: 0.14, oneOnOnes: 0.12, distribution: 0.10, concentration: 0.08 },
    CB:  { tackling: 0.12, strength: 0.10, aerial: 0.10, heading: 0.12, concentration: 0.08 },
    LB:  { pace: 0.10, stamina: 0.08, crossing: 0.10, acceleration: 0.06 },
    RB:  { pace: 0.10, stamina: 0.08, crossing: 0.10, acceleration: 0.06 },
    CDM: { tackling: 0.10, positioning: 0.10, passing: 0.05, concentration: 0.08 },
    CM:  { passing: 0.10, stamina: 0.08, vision: 0.08, concentration: 0.05 },
    CAM: { vision: 0.12, passing: 0.10, dribbling: 0.08, agility: 0.08, finishing: 0.05 },
    LW:  { pace: 0.12, dribbling: 0.10, acceleration: 0.10, crossing: 0.10, agility: 0.08 },
    RW:  { pace: 0.12, dribbling: 0.10, acceleration: 0.10, crossing: 0.10, agility: 0.08 },
    ST:  { shooting: 0.15, pace: 0.08, dribbling: 0.05, finishing: 0.15, acceleration: 0.08, heading: 0.08 },
  };

  const boosts = ROLE_BOOSTS[role] ?? {};
  const isGK = role === 'GK';
  return {
    pace: generateAttribute(base + (boosts.pace ?? 0), spread, rng),
    strength: generateAttribute(base + (boosts.strength ?? 0), spread, rng),
    stamina: generateAttribute(base + (boosts.stamina ?? 0), spread, rng),
    dribbling: generateAttribute(base + (boosts.dribbling ?? 0), spread, rng),
    passing: generateAttribute(base + (boosts.passing ?? 0), spread, rng),
    shooting: generateAttribute(base + (boosts.shooting ?? 0), spread, rng),
    tackling: generateAttribute(base + (boosts.tackling ?? 0), spread, rng),
    aerial: generateAttribute(base + (boosts.aerial ?? 0), spread, rng),
    positioning: generateAttribute(base + (boosts.positioning ?? 0), spread, rng),
    vision: generateAttribute(base + (boosts.vision ?? 0), spread, rng),
    acceleration: generateAttribute(base + (boosts.acceleration ?? 0), spread, rng),
    crossing: generateAttribute(base + (boosts.crossing ?? 0), spread, rng),
    finishing: generateAttribute(base + (boosts.finishing ?? 0), spread, rng),
    agility: generateAttribute(base + (boosts.agility ?? 0), spread, rng),
    heading: generateAttribute(base + (boosts.heading ?? 0), spread, rng),
    concentration: generateAttribute(base + (boosts.concentration ?? 0), spread, rng),
    reflexes: generateAttribute((isGK ? base : base * 0.6) + (boosts.reflexes ?? 0), spread, rng),
    handling: generateAttribute((isGK ? base : base * 0.6) + (boosts.handling ?? 0), spread, rng),
    oneOnOnes: generateAttribute((isGK ? base : base * 0.6) + (boosts.oneOnOnes ?? 0), spread, rng),
    distribution: generateAttribute((isGK ? base : base * 0.6) + (boosts.distribution ?? 0), spread, rng),
  };
}

function generatePersonality(rng: () => number): PlayerState['personality'] {
  return {
    directness: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    risk_appetite: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    composure: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    creativity: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    work_rate: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    aggression: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    anticipation: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    flair: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
  };
}

const defaultNats = ['GB', 'ES', 'FR', 'DE', 'BR'];

/**
 * Generate a pool of free agent players across three archetypes:
 *  - Mid-range squad fillers (~50%): solid players to fill gaps
 *  - Young prospects (~30%): lower ability now but younger
 *  - Veteran stop-gaps (~20%): experienced, reliable older players
 */
export function generateFreeAgents(count: number, rng: () => number): PlayerState[] {
  const agents: PlayerState[] = [];

  // Distribute archetypes
  const midCount = Math.round(count * 0.5);
  const youthCount = Math.round(count * 0.3);
  const vetCount = count - midCount - youthCount;

  interface Archetype { base: number; spread: number; ageMin: number; ageMax: number }
  const archetypes: Array<{ type: Archetype; n: number }> = [
    { type: { base: 0.55, spread: 0.12, ageMin: 24, ageMax: 30 }, n: midCount },
    { type: { base: 0.42, spread: 0.14, ageMin: 17, ageMax: 21 }, n: youthCount },
    { type: { base: 0.60, spread: 0.10, ageMin: 31, ageMax: 35 }, n: vetCount },
  ];

  let idx = 0;
  for (const { type, n } of archetypes) {
    for (let i = 0; i < n; i++) {
      const role = FREE_AGENT_ROLES[idx % FREE_AGENT_ROLES.length]!;
      const age = Math.floor(rng() * (type.ageMax - type.ageMin + 1)) + type.ageMin;
      const nationality = defaultNats[Math.floor(rng() * defaultNats.length)]!;

      agents.push({
        id: `free-agent-${idx}`,
        teamId: 'home', // placeholder, not used for free agents
        position: Vec2.zero(),
        velocity: Vec2.zero(),
        attributes: generateFreeAgentAttributes(type.base, type.spread, rng, role),
        personality: generatePersonality(rng),
        fatigue: 0,
        role,
        duty: Duty.SUPPORT,
        formationAnchor: Vec2.zero(),
        name: generatePlayerName(rng),
        age,
        height: Math.floor(rng() * 36) + 165,
        shirtNumber: idx + 1,
        nationality,
      });
      idx++;
    }
  }

  return agents;
}

// --- Initial Budgets ---

const TIER_BUDGETS: Record<string, number> = {
  strong: 500_000,
  mid: 300_000,
  weak: 150_000,
};

export const PLAYER_STARTING_BUDGET = 250_000;

/**
 * Initialize the transfer market for a new season.
 */
export function createTransferMarket(
  teams: SeasonTeam[],
  playerTeamId: string,
  freeAgents: PlayerState[],
  playerSeasonStats: Map<string, PlayerSeasonStats>,
  currentMatchday: number,
): TransferMarketState {
  // Calculate initial player values
  const playerValues = new Map<string, number>();
  for (const team of teams) {
    for (const player of team.squad) {
      const stats = playerSeasonStats.get(player.id) ?? null;
      playerValues.set(player.id, calculatePlayerValue(player, stats, currentMatchday));
    }
  }
  for (const agent of freeAgents) {
    playerValues.set(agent.id, calculatePlayerValue(agent, null, 0));
  }

  // Set team budgets
  const teamBudgets = new Map<string, number>();
  for (const team of teams) {
    if (team.id === playerTeamId) {
      teamBudgets.set(team.id, PLAYER_STARTING_BUDGET);
    } else {
      teamBudgets.set(team.id, TIER_BUDGETS[team.tier] ?? 200_000);
    }
  }

  // Auto-list all free agents
  const listings: TransferListing[] = freeAgents.map(agent => ({
    playerId: agent.id,
    teamId: 'free-agent',
    askingPrice: playerValues.get(agent.id) ?? 1000,
    listedAt: 0,
  }));

  return {
    freeAgents,
    listings,
    bids: [],
    playerValues,
    teamBudgets,
  };
}

// --- Transfer Listing ---

/**
 * Add a player to the transfer list.
 */
export function transferListPlayer(
  market: TransferMarketState,
  playerId: string,
  teamId: string,
  matchday: number,
): TransferMarketState {
  // Don't double-list
  if (market.listings.some(l => l.playerId === playerId)) return market;

  const value = market.playerValues.get(playerId) ?? 1000;
  const listing: TransferListing = {
    playerId,
    teamId,
    askingPrice: value,
    listedAt: matchday,
  };

  return {
    ...market,
    listings: [...market.listings, listing],
  };
}

/**
 * Remove a player from the transfer list.
 */
export function removeFromTransferList(market: TransferMarketState, playerId: string): TransferMarketState {
  return {
    ...market,
    listings: market.listings.filter(l => l.playerId !== playerId),
  };
}

// --- Bidding ---

let _bidCounter = 0;

/**
 * Submit a player bid as pending. Reserves the bid amount from the buyer's budget immediately.
 * Does NOT evaluate or execute the transfer — that happens in processPendingBids.
 * Returns updated market only (no teams/inbox changes).
 */
export function submitPlayerBid(
  market: TransferMarketState,
  bid: { fromTeamId: string; toTeamId: string; playerId: string; amount: number; matchday: number },
): TransferMarketState {
  const bidId = `bid-${Date.now()}-${++_bidCounter}`;
  const bidRecord: Bid = {
    id: bidId,
    fromTeamId: bid.fromTeamId,
    toTeamId: bid.toTeamId,
    playerId: bid.playerId,
    amount: bid.amount,
    status: 'pending',
    matchday: bid.matchday,
  };

  // Reserve funds from buyer's budget
  const currentBudget = market.teamBudgets.get(bid.fromTeamId) ?? 0;
  const updatedBudgets = new Map(market.teamBudgets);
  updatedBudgets.set(bid.fromTeamId, currentBudget - bid.amount);

  return {
    ...market,
    bids: [...market.bids, bidRecord],
    teamBudgets: updatedBudgets,
  };
}

/**
 * Resolve all pending bids. Evaluates each via evaluateBid, executes accepted transfers,
 * updates bid statuses, sends accept/reject inbox messages.
 * For rejected bids, refunds the reserved amount back to the buyer's budget.
 * Returns updated { market, teams, inbox }.
 */
export function processPendingBids(
  market: TransferMarketState,
  teams: SeasonTeam[],
  playerSeasonStats: Map<string, PlayerSeasonStats>,
  inbox: InboxState,
  rng: () => number,
): { market: TransferMarketState; teams: SeasonTeam[]; inbox: InboxState } {
  const pendingBids = market.bids.filter(b => b.status === 'pending');
  if (pendingBids.length === 0) {
    return { market, teams, inbox };
  }

  let updatedMarket = { ...market };
  let updatedTeams = [...teams];
  let updatedInbox = { ...inbox };

  for (const bid of pendingBids) {
    // Find player info for messages
    let playerName = 'Unknown Player';
    let playerObj: PlayerState | undefined;
    let sellingTeamName = 'Free Agent';

    if (bid.toTeamId === 'free-agent') {
      playerObj = updatedMarket.freeAgents.find(p => p.id === bid.playerId);
      playerName = playerObj?.name ?? playerName;
    } else {
      const sellingTeam = updatedTeams.find(t => t.id === bid.toTeamId);
      sellingTeamName = sellingTeam?.name ?? sellingTeamName;
      playerObj = sellingTeam?.squad.find(p => p.id === bid.playerId);
      playerName = playerObj?.name ?? playerName;
    }

    const result = evaluateBid(bid, updatedMarket, updatedTeams, playerSeasonStats, rng);

    if (result === 'accepted' && playerObj) {
      // Execute the transfer (budget already reserved, so don't double-deduct)
      // We need to refund the reserved amount first, then let executeTransfer deduct normally
      const refundedBudgets = new Map(updatedMarket.teamBudgets);
      refundedBudgets.set(bid.fromTeamId, (refundedBudgets.get(bid.fromTeamId) ?? 0) + bid.amount);
      updatedMarket = { ...updatedMarket, teamBudgets: refundedBudgets };

      const transferResult = executeTransfer(updatedMarket, updatedTeams, bid.fromTeamId, bid.toTeamId, bid.playerId, bid.amount);
      updatedMarket = transferResult.market;
      updatedTeams = transferResult.teams;

      const isFreeAgent = bid.toTeamId === 'free-agent';
      updatedInbox = sendMessage(updatedInbox, {
        subject: `Transfer Complete: ${playerName}`,
        body: isFreeAgent
          ? `${playerName} has signed for your club as a free agent.`
          : `${sellingTeamName} have accepted your £${formatMoney(bid.amount)} bid for ${playerName}. The player has joined your squad.`,
        from: 'Transfer Committee',
        matchday: bid.matchday,
        category: 'transfer',
      });
    } else {
      // Rejected — refund the reserved amount
      const refundedBudgets = new Map(updatedMarket.teamBudgets);
      refundedBudgets.set(bid.fromTeamId, (refundedBudgets.get(bid.fromTeamId) ?? 0) + bid.amount);
      updatedMarket = { ...updatedMarket, teamBudgets: refundedBudgets };

      updatedInbox = sendMessage(updatedInbox, {
        subject: `Bid Rejected: ${playerName}`,
        body: `${sellingTeamName} have rejected your £${formatMoney(bid.amount)} bid for ${playerName}.`,
        from: 'Transfer Committee',
        matchday: bid.matchday,
        category: 'transfer',
      });
    }

    // Update bid status in market
    updatedMarket = {
      ...updatedMarket,
      bids: updatedMarket.bids.map(b =>
        b.id === bid.id ? { ...b, status: result } : b
      ),
    };
  }

  return { market: updatedMarket, teams: updatedTeams, inbox: updatedInbox };
}

/**
 * Evaluate whether a bid should be accepted or rejected.
 */
export function evaluateBid(
  bid: { fromTeamId: string; toTeamId: string; playerId: string; amount: number },
  market: TransferMarketState,
  teams: SeasonTeam[],
  playerSeasonStats: Map<string, PlayerSeasonStats>,
  rng: () => number,
): 'accepted' | 'rejected' {
  const playerValue = market.playerValues.get(bid.playerId) ?? 1000;
  const listing = market.listings.find(l => l.playerId === bid.playerId);
  const isListed = !!listing;

  // Free agents: always accept if bid >= asking price (or sign for free)
  if (bid.toTeamId === 'free-agent') {
    return 'accepted';
  }

  // Find the selling team and player
  const sellingTeam = teams.find(t => t.id === bid.toTeamId);
  if (!sellingTeam) return 'rejected';

  const player = sellingTeam.squad.find(p => p.id === bid.playerId);
  if (!player) return 'rejected';

  // Player stats for pecking order analysis
  const stats = playerSeasonStats.get(bid.playerId);
  const appearances = stats?.appearances ?? 0;

  // Squad depth at this position
  const depth = getSquadDepth(sellingTeam.squad);
  const positionPlayers = depth.get(player.role as Role) ?? [];
  const positionCount = positionPlayers.length;

  // Pecking order: player ranked by rating within their position
  const positionRank = positionPlayers.findIndex(p => p.id === player.id); // 0 = best

  // Base acceptance probability
  let acceptProb = 0;

  if (isListed) {
    const askingPrice = listing!.askingPrice;
    if (bid.amount >= askingPrice) {
      return 'accepted'; // Asking price always accepted for listed players
    }
    // Under asking: scale probability by how close to asking price
    const ratio = bid.amount / askingPrice;
    acceptProb = ratio * 0.6; // 60% at asking, 30% at half
  } else {
    // Not listed: much harder to buy
    const valueRatio = bid.amount / playerValue;
    if (valueRatio < 1.5) {
      acceptProb = 0.05; // Very unlikely under 1.5x value
    } else if (valueRatio < 2.0) {
      acceptProb = 0.15;
    } else if (valueRatio < 3.0) {
      acceptProb = 0.40;
    } else {
      acceptProb = 0.70;
    }
  }

  // Modifiers

  // Squad depth: more willing to sell if many players in that position
  if (positionCount >= 4) acceptProb += 0.15;
  else if (positionCount >= 3) acceptProb += 0.05;
  else if (positionCount <= 1) acceptProb -= 0.20; // Can't leave position empty

  // Pecking order: low-ranked players more likely to be sold
  if (positionRank >= 2) acceptProb += 0.10;
  if (appearances === 0) acceptProb += 0.15;

  // Never sell if squad would be too small
  if (sellingTeam.squad.length <= 20) acceptProb -= 0.30;

  // Clamp and roll
  acceptProb = Math.max(0, Math.min(0.95, acceptProb));
  return rng() < acceptProb ? 'accepted' : 'rejected';
}

/**
 * Process a bid from the player's team. Returns updated market, teams, and inbox.
 */
export function processPlayerBid(
  market: TransferMarketState,
  teams: SeasonTeam[],
  playerSeasonStats: Map<string, PlayerSeasonStats>,
  inbox: InboxState,
  bid: { fromTeamId: string; toTeamId: string; playerId: string; amount: number; matchday: number },
  rng: () => number,
): { market: TransferMarketState; teams: SeasonTeam[]; inbox: InboxState } {
  const bidId = `bid-${Date.now()}-${++_bidCounter}`;
  const result = evaluateBid(bid, market, teams, playerSeasonStats, rng);

  // Find player info for messages
  let playerName = 'Unknown Player';
  let playerObj: PlayerState | undefined;
  let sellingTeamName = 'Free Agent';

  if (bid.toTeamId === 'free-agent') {
    playerObj = market.freeAgents.find(p => p.id === bid.playerId);
    playerName = playerObj?.name ?? playerName;
  } else {
    const sellingTeam = teams.find(t => t.id === bid.toTeamId);
    sellingTeamName = sellingTeam?.name ?? sellingTeamName;
    playerObj = sellingTeam?.squad.find(p => p.id === bid.playerId);
    playerName = playerObj?.name ?? playerName;
  }

  // Record the bid
  const bidRecord: Bid = {
    id: bidId,
    fromTeamId: bid.fromTeamId,
    toTeamId: bid.toTeamId,
    playerId: bid.playerId,
    amount: bid.amount,
    status: result,
    matchday: bid.matchday,
  };
  let updatedMarket = { ...market, bids: [...market.bids, bidRecord] };

  let updatedTeams = teams;

  if (result === 'accepted' && playerObj) {
    // Execute the transfer
    const transferResult = executeTransfer(updatedMarket, updatedTeams, bid.fromTeamId, bid.toTeamId, bid.playerId, bid.amount);
    updatedMarket = transferResult.market;
    updatedTeams = transferResult.teams;

    // Send acceptance message
    const isFreeAgent = bid.toTeamId === 'free-agent';
    inbox = sendMessage(inbox, {
      subject: `Transfer Complete: ${playerName}`,
      body: isFreeAgent
        ? `${playerName} has signed for your club as a free agent.`
        : `${sellingTeamName} have accepted your £${formatMoney(bid.amount)} bid for ${playerName}. The player has joined your squad.`,
      from: 'Transfer Committee',
      matchday: bid.matchday,
      category: 'transfer',
    });
  } else {
    // Send rejection message
    inbox = sendMessage(inbox, {
      subject: `Bid Rejected: ${playerName}`,
      body: `${sellingTeamName} have rejected your £${formatMoney(bid.amount)} bid for ${playerName}.`,
      from: 'Transfer Committee',
      matchday: bid.matchday,
      category: 'transfer',
    });
  }

  return { market: updatedMarket, teams: updatedTeams, inbox };
}

/**
 * Execute a transfer: move player between squads, update budgets.
 */
export function executeTransfer(
  market: TransferMarketState,
  teams: SeasonTeam[],
  buyingTeamId: string,
  sellingTeamId: string,
  playerId: string,
  amount: number,
): { market: TransferMarketState; teams: SeasonTeam[] } {
  let player: PlayerState | undefined;
  let updatedTeams = [...teams];
  let updatedMarket = { ...market };

  if (sellingTeamId === 'free-agent') {
    // Sign from free agent pool
    player = market.freeAgents.find(p => p.id === playerId);
    if (!player) return { market, teams };

    updatedMarket = {
      ...updatedMarket,
      freeAgents: updatedMarket.freeAgents.filter(p => p.id !== playerId),
    };
  } else {
    // Remove from selling team's squad
    const sellingIdx = updatedTeams.findIndex(t => t.id === sellingTeamId);
    if (sellingIdx < 0) return { market, teams };

    const sellingTeam = updatedTeams[sellingIdx]!;
    player = sellingTeam.squad.find(p => p.id === playerId);
    if (!player) return { market, teams };

    updatedTeams[sellingIdx] = {
      ...sellingTeam,
      squad: sellingTeam.squad.filter(p => p.id !== playerId),
    };

    // Credit the selling team
    const sellerBudget = (updatedMarket.teamBudgets.get(sellingTeamId) ?? 0) + amount;
    updatedMarket.teamBudgets = new Map(updatedMarket.teamBudgets);
    updatedMarket.teamBudgets.set(sellingTeamId, sellerBudget);
  }

  // Add to buying team's squad
  const buyingIdx = updatedTeams.findIndex(t => t.id === buyingTeamId);
  if (buyingIdx < 0) return { market, teams };

  const buyingTeam = updatedTeams[buyingIdx]!;

  // If squad is full (25), release worst-rated player
  let releasedPlayer: PlayerState | undefined;
  let squadToAdd = [...buyingTeam.squad];
  if (squadToAdd.length >= 25) {
    // Find worst-rated non-GK (keep at least 1 GK)
    const sorted = [...squadToAdd].sort(
      (a, b) => calculatePlayerRating(a) - calculatePlayerRating(b)
    );
    const gkCount = squadToAdd.filter(p => p.role === 'GK').length;
    releasedPlayer = sorted.find(p => !(p.role === 'GK' && gkCount <= 1));
    if (releasedPlayer) {
      squadToAdd = squadToAdd.filter(p => p.id !== releasedPlayer!.id);
    }
  }

  // Re-assign player's teamId and shirt number
  const newShirtNumber = squadToAdd.length + 1;
  const transferredPlayer: PlayerState = {
    ...player,
    id: player.id, // keep original ID for stat tracking
    teamId: buyingTeam.id as any,
    shirtNumber: newShirtNumber,
  };

  squadToAdd.push(transferredPlayer);
  updatedTeams[buyingIdx] = { ...buyingTeam, squad: squadToAdd };

  // Debit the buying team
  const buyerBudget = (updatedMarket.teamBudgets.get(buyingTeamId) ?? 0) - amount;
  updatedMarket.teamBudgets = new Map(updatedMarket.teamBudgets);
  updatedMarket.teamBudgets.set(buyingTeamId, buyerBudget);

  // Remove from transfer list
  updatedMarket = removeFromTransferList(updatedMarket, playerId);

  // If a player was released, add them to free agents
  if (releasedPlayer) {
    updatedMarket.freeAgents = [...updatedMarket.freeAgents, releasedPlayer];
    // List them automatically
    const releasedValue = updatedMarket.playerValues.get(releasedPlayer.id) ?? 1000;
    updatedMarket.listings = [...updatedMarket.listings, {
      playerId: releasedPlayer.id,
      teamId: 'free-agent',
      askingPrice: releasedValue,
      listedAt: 0,
    }];
  }

  return { market: updatedMarket, teams: updatedTeams };
}

// --- Value Updates ---

/**
 * Recalculate market values for all players.
 */
export function updateAllPlayerValues(
  teams: SeasonTeam[],
  freeAgents: PlayerState[],
  playerSeasonStats: Map<string, PlayerSeasonStats>,
  currentMatchday: number,
): Map<string, number> {
  const values = new Map<string, number>();
  for (const team of teams) {
    for (const player of team.squad) {
      const stats = playerSeasonStats.get(player.id) ?? null;
      values.set(player.id, calculatePlayerValue(player, stats, currentMatchday));
    }
  }
  for (const agent of freeAgents) {
    values.set(agent.id, calculatePlayerValue(agent, null, 0));
  }
  return values;
}

// --- Helpers ---

export function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
  return `${amount}`;
}

/**
 * Find which team a player belongs to (or 'free-agent').
 */
export function findPlayerTeam(teams: SeasonTeam[], freeAgents: PlayerState[], playerId: string): string {
  for (const team of teams) {
    if (team.squad.some(p => p.id === playerId)) return team.id;
  }
  if (freeAgents.some(p => p.id === playerId)) return 'free-agent';
  return 'unknown';
}

/**
 * Find a player object across all teams and free agents.
 */
export function findPlayer(teams: SeasonTeam[], freeAgents: PlayerState[], playerId: string): PlayerState | undefined {
  for (const team of teams) {
    const p = team.squad.find(pl => pl.id === playerId);
    if (p) return p;
  }
  return freeAgents.find(p => p.id === playerId);
}
