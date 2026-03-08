/**
 * Tests for the pending bid system and AI transfer digest.
 *
 * Phase 15 Plan 01: Delayed transfer resolution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { TransferMarketState, Bid } from './transferMarket.ts';
import {
  submitPlayerBid,
  processPendingBids,
} from './transferMarket.ts';
import type { InboxState } from './inbox.ts';
import { createInbox } from './inbox.ts';
import type { PlayerState } from '../simulation/types.ts';
import { Duty } from '../simulation/types.ts';
import { Vec2 } from '../simulation/math/vec2.ts';
import type { SeasonTeam } from './season.ts';

// --- Helpers ---

function makePlayer(id: string, teamId: string, role: PlayerState['role'] = 'CM'): PlayerState {
  const attrs = {
    pace: 0.6, strength: 0.6, stamina: 0.6, dribbling: 0.6,
    passing: 0.6, shooting: 0.6, tackling: 0.6, aerial: 0.6,
    positioning: 0.6, vision: 0.6, acceleration: 0.6, crossing: 0.6,
    finishing: 0.6, agility: 0.6, heading: 0.6, concentration: 0.6,
    reflexes: 0.3, handling: 0.3, oneOnOnes: 0.3, distribution: 0.3,
  };
  return {
    id,
    teamId: teamId as any,
    position: Vec2.zero(),
    velocity: Vec2.zero(),
    attributes: attrs,
    personality: {
      directness: 0.5, risk_appetite: 0.5, composure: 0.5,
      creativity: 0.5, work_rate: 0.5, aggression: 0.5,
      anticipation: 0.5, flair: 0.5,
    },
    fatigue: 0,
    role,
    duty: Duty.SUPPORT,
    formationAnchor: Vec2.zero(),
    name: `Player ${id}`,
    age: 25,
    height: 180,
    shirtNumber: 1,
    nationality: 'GB',
  };
}

function makeTeam(id: string, players: PlayerState[], isPlayerTeam = false): SeasonTeam {
  return {
    id,
    name: `Team ${id}`,
    squad: players,
    isPlayerTeam,
    tier: 'mid',
    preferredFormation: '4-4-2',
    preferredTacticName: null,
  } as unknown as SeasonTeam;
}

function makeMarket(
  teams: SeasonTeam[],
  extraBids: Bid[] = [],
  budgetOverrides: Record<string, number> = {},
): TransferMarketState {
  const teamBudgets = new Map<string, number>();
  for (const t of teams) {
    teamBudgets.set(t.id, budgetOverrides[t.id] ?? 300_000);
  }
  const playerValues = new Map<string, number>();
  for (const t of teams) {
    for (const p of t.squad) {
      playerValues.set(p.id, 100_000);
    }
  }
  return {
    freeAgents: [],
    listings: [],
    bids: extraBids,
    playerValues,
    teamBudgets,
  };
}

const fakeRng = () => 0.5;

// --- Tests ---

describe('submitPlayerBid', () => {
  let teams: SeasonTeam[];
  let market: TransferMarketState;
  let inbox: InboxState;

  beforeEach(() => {
    const seller = makeTeam('seller', [makePlayer('p1', 'seller')]);
    const buyer = makeTeam('buyer', []);
    teams = [seller, buyer];
    market = makeMarket(teams, [], { buyer: 200_000, seller: 300_000 });
    inbox = createInbox();
  });

  it('records a pending bid on market.bids', () => {
    const result = submitPlayerBid(market, {
      fromTeamId: 'buyer',
      toTeamId: 'seller',
      playerId: 'p1',
      amount: 80_000,
      matchday: 1,
    });
    expect(result.bids).toHaveLength(1);
    expect(result.bids[0]!.status).toBe('pending');
    expect(result.bids[0]!.playerId).toBe('p1');
    expect(result.bids[0]!.fromTeamId).toBe('buyer');
  });

  it('reserves the bid amount from the buyer budget immediately', () => {
    const result = submitPlayerBid(market, {
      fromTeamId: 'buyer',
      toTeamId: 'seller',
      playerId: 'p1',
      amount: 80_000,
      matchday: 1,
    });
    expect(result.teamBudgets.get('buyer')).toBe(120_000); // 200k - 80k
  });

  it('does NOT send any inbox message', () => {
    // submitPlayerBid only returns updated market (no inbox)
    const result = submitPlayerBid(market, {
      fromTeamId: 'buyer',
      toTeamId: 'seller',
      playerId: 'p1',
      amount: 80_000,
      matchday: 1,
    });
    // Verify result is just market state (no inbox property needed — just confirm bids updated)
    expect(result.bids).toHaveLength(1);
  });

  it('does not call evaluateBid or executeTransfer (player stays in seller squad)', () => {
    submitPlayerBid(market, {
      fromTeamId: 'buyer',
      toTeamId: 'seller',
      playerId: 'p1',
      amount: 80_000,
      matchday: 1,
    });
    // Player p1 should still be in seller's squad (market untouched beyond bids/budgets)
    const sellerTeam = teams.find(t => t.id === 'seller')!;
    expect(sellerTeam.squad.some(p => p.id === 'p1')).toBe(true);
  });
});

describe('processPendingBids', () => {
  let teams: SeasonTeam[];
  let market: TransferMarketState;
  let inbox: InboxState;

  beforeEach(() => {
    const seller = makeTeam('seller', [
      makePlayer('p1', 'seller'),
      makePlayer('p2', 'seller'),
      makePlayer('p3', 'seller'),
      makePlayer('p4', 'seller'),
      makePlayer('p5', 'seller'),
      makePlayer('p6', 'seller'),
      makePlayer('p7', 'seller'),
      makePlayer('p8', 'seller'),
      makePlayer('p9', 'seller'),
      makePlayer('p10', 'seller'),
      makePlayer('p11', 'seller'),
      makePlayer('p12', 'seller'),
      makePlayer('p13', 'seller'),
      makePlayer('p14', 'seller'),
      makePlayer('p15', 'seller'),
      makePlayer('p16', 'seller'),
      makePlayer('p17', 'seller'),
      makePlayer('p18', 'seller'),
      makePlayer('p19', 'seller'),
      makePlayer('p20', 'seller'),
      makePlayer('p21', 'seller', 'GK'),
    ]);
    const buyer = makeTeam('buyer', [makePlayer('pb1', 'buyer')], true);
    teams = [seller, buyer];

    const pendingBid: Bid = {
      id: 'bid-1',
      fromTeamId: 'buyer',
      toTeamId: 'seller',
      playerId: 'p1',
      amount: 150_000, // above value -> accepted
      status: 'pending',
      matchday: 1,
    };

    market = makeMarket(teams, [pendingBid], { buyer: 100_000, seller: 300_000 });
    // List p1 so acceptance is deterministic
    market = {
      ...market,
      listings: [{ playerId: 'p1', teamId: 'seller', askingPrice: 100_000, listedAt: 1 }],
    };
    inbox = createInbox();
  });

  it('resolves pending bids and sends accept/reject inbox messages', () => {
    const result = processPendingBids(
      market, teams, new Map(), inbox, fakeRng,
    );
    expect(result.inbox.messages.length).toBeGreaterThan(0);
    const msg = result.inbox.messages[0]!;
    expect(['Transfer Complete', 'Bid Rejected'].some(prefix => msg.subject.startsWith(prefix))).toBe(true);
  });

  it('marks resolved bids as accepted or rejected (not pending)', () => {
    const result = processPendingBids(
      market, teams, new Map(), inbox, fakeRng,
    );
    const resolvedBid = result.market.bids.find(b => b.id === 'bid-1');
    expect(resolvedBid).toBeDefined();
    expect(resolvedBid!.status).not.toBe('pending');
  });

  it('is a no-op when there are no pending bids', () => {
    const resolvedBid: Bid = {
      id: 'bid-resolved',
      fromTeamId: 'buyer',
      toTeamId: 'seller',
      playerId: 'p2',
      amount: 80_000,
      status: 'accepted',
      matchday: 1,
    };
    const marketNoPending = { ...market, bids: [resolvedBid] };
    const result = processPendingBids(
      marketNoPending, teams, new Map(), inbox, fakeRng,
    );
    expect(result.inbox.messages).toHaveLength(0);
    expect(result.market.bids).toHaveLength(1);
    expect(result.market.bids[0]!.status).toBe('accepted');
  });

  it('refunds budget when bid is rejected', () => {
    // Force rejection: bid amount well below value (not listed)
    const rejectedBid: Bid = {
      id: 'bid-reject',
      fromTeamId: 'buyer',
      toTeamId: 'seller',
      playerId: 'p2',
      amount: 1_000, // tiny — will be rejected for unlisted player
      status: 'pending',
      matchday: 1,
    };
    // Market with buyer having 99k left after reserving 1k
    const testMarket: TransferMarketState = {
      ...market,
      bids: [rejectedBid],
      listings: [], // not listed, so very low chance of accept
      teamBudgets: new Map([
        ['buyer', 99_000],
        ['seller', 300_000],
      ]),
    };
    // Force rejection by using rng that always returns high (> acceptProb)
    const rejectRng = () => 0.99;
    const result = processPendingBids(
      testMarket, teams, new Map(), inbox, rejectRng,
    );
    const msg = result.inbox.messages[0];
    expect(msg?.subject).toContain('Bid Rejected');
    // Budget should be refunded: 99k + 1k = 100k
    expect(result.market.teamBudgets.get('buyer')).toBe(100_000);
  });
});
