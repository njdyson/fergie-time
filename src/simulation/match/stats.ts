import type { MatchStats, ActionIntent, ActionType, TeamId, PlayerState } from '../types.ts';
import { ActionType as AT } from '../types.ts';

/**
 * Returns a zero-initialized MatchStats object.
 */
export function createEmptyStats(): MatchStats {
  return {
    possession: [0, 0],
    shots: [0, 0],
    passes: [0, 0],
    tackles: [0, 0],
  };
}

/**
 * Mutable accumulator that tracks raw counts and produces immutable MatchStats snapshots.
 *
 * Usage:
 *   const acc = new StatsAccumulator();
 *   // Each tick:
 *   acc.recordPossession(ballCarrierTeamId);
 *   for (const intent of intents) {
 *     const teamId = players.find(p => p.id === intent.agentId)?.teamId;
 *     if (teamId) acc.recordIntent(intent, teamId);
 *   }
 *   // Snapshot for SimSnapshot:
 *   const stats = acc.getSnapshot();
 */
export class StatsAccumulator {
  private homeShots = 0;
  private awayShots = 0;
  private homePasses = 0;
  private awayPasses = 0;
  private homeTackles = 0;
  private awayTackles = 0;
  private homePossessionTicks = 0;
  private awayPossessionTicks = 0;

  /**
   * Record an action intent from an agent's team.
   * Increments the appropriate counter based on action type.
   */
  recordIntent(intent: ActionIntent, teamId: TeamId): void {
    const action: ActionType = intent.action;
    const isHome = teamId === 'home';

    if (action === AT.SHOOT) {
      if (isHome) this.homeShots++;
      else this.awayShots++;
    } else if (action === AT.PASS_FORWARD || action === AT.PASS_SAFE) {
      if (isHome) this.homePasses++;
      else this.awayPasses++;
    }
    // Note: tackles are recorded separately via recordTackle() — only on actual in-range attempts
    // DRIBBLE, HOLD_SHIELD, MOVE_TO_POSITION, MAKE_RUN are not tracked
  }

  /**
   * Record an actual tackle attempt (defender within range of ball carrier).
   */
  recordTackle(teamId: TeamId): void {
    if (teamId === 'home') this.homeTackles++;
    else this.awayTackles++;
  }

  /**
   * Record possession for a tick.
   * Pass null for a loose ball tick — neither team gains possession.
   *
   * Possession percentage is computed as:
   *   homeTicksWithBall / (homeTicksWithBall + awayTicksWithBall) * 100
   */
  recordPossession(teamId: TeamId | null): void {
    if (teamId === 'home') {
      this.homePossessionTicks++;
    } else if (teamId === 'away') {
      this.awayPossessionTicks++;
    }
    // null = loose ball; neither team gains a tick
  }

  /**
   * Returns an immutable MatchStats snapshot from the current accumulated counts.
   */
  getSnapshot(): MatchStats {
    const totalPossessionTicks = this.homePossessionTicks + this.awayPossessionTicks;
    let homePct = 0;
    let awayPct = 0;

    if (totalPossessionTicks > 0) {
      homePct = (this.homePossessionTicks / totalPossessionTicks) * 100;
      awayPct = (this.awayPossessionTicks / totalPossessionTicks) * 100;
    }

    return {
      possession: [homePct, awayPct],
      shots: [this.homeShots, this.awayShots],
      passes: [this.homePasses, this.awayPasses],
      tackles: [this.homeTackles, this.awayTackles],
    };
  }
}

/**
 * Functional API: accumulates stats from a batch of intents and returns updated MatchStats.
 *
 * This creates a temporary accumulator seeded from the current stats (preserving counts)
 * and applies the new tick's intents plus the ball carrier possession tick.
 *
 * Note: Because MatchStats only stores percentages (not raw counts), this function
 * internally uses approximate reconstruction from percentages when totals are unknown.
 * For accurate accumulation across a full match, use StatsAccumulator directly.
 *
 * @param current - Current MatchStats snapshot (used as a base)
 * @param intents - Action intents from all agents this tick
 * @param ballCarrierTeamId - Which team currently has the ball (null = loose)
 * @param players - All player states (used to look up teamId from agentId)
 */
export function accumulateStats(
  current: MatchStats,
  intents: readonly ActionIntent[],
  ballCarrierTeamId: TeamId | null,
  players: readonly PlayerState[],
): MatchStats {
  // Build a player lookup map
  const playerTeam = new Map<string, TeamId>();
  for (const p of players) {
    playerTeam.set(p.id, p.teamId);
  }

  // We accumulate deltas and add to current snapshot values
  // Since current.shots/passes/tackles are counts, we add to them
  // For possession, we need to recalculate from accumulated ticks
  // We approximate by treating current possession as an existing tick count
  // using a base of 100 ticks to preserve existing percentage

  // Simple approach: increment count stats and recalculate possession
  const homeShots = current.shots[0];
  const awayShots = current.shots[1];
  const homePasses = current.passes[0];
  const awayPasses = current.passes[1];
  const homeTackles = current.tackles[0];
  const awayTackles = current.tackles[1];

  let dHomeShots = 0, dAwayShots = 0;
  let dHomePasses = 0, dAwayPasses = 0;
  let dHomeTackles = 0, dAwayTackles = 0;

  for (const intent of intents) {
    const teamId = playerTeam.get(intent.agentId);
    if (!teamId) continue;
    const isHome = teamId === 'home';

    if (intent.action === AT.SHOOT) {
      if (isHome) dHomeShots++;
      else dAwayShots++;
    } else if (intent.action === AT.PASS_FORWARD || intent.action === AT.PASS_SAFE) {
      if (isHome) dHomePasses++;
      else dAwayPasses++;
    } else if (intent.action === AT.PRESS) {
      if (isHome) dHomeTackles++;
      else dAwayTackles++;
    }
  }

  // For possession: we reconstruct existing ticks from percentage with a base of 100
  // then add the new tick
  const BASE = 100;
  const existingHomeTicks = (current.possession[0] / 100) * BASE;
  const existingAwayTicks = (current.possession[1] / 100) * BASE;
  let newHomeTicks = existingHomeTicks;
  let newAwayTicks = existingAwayTicks;

  if (ballCarrierTeamId === 'home') newHomeTicks++;
  else if (ballCarrierTeamId === 'away') newAwayTicks++;

  const totalTicks = newHomeTicks + newAwayTicks;
  const homePct = totalTicks > 0 ? (newHomeTicks / totalTicks) * 100 : 0;
  const awayPct = totalTicks > 0 ? (newAwayTicks / totalTicks) * 100 : 0;

  return {
    possession: [homePct, awayPct],
    shots: [homeShots + dHomeShots, awayShots + dAwayShots],
    passes: [homePasses + dHomePasses, awayPasses + dAwayPasses],
    tackles: [homeTackles + dHomeTackles, awayTackles + dAwayTackles],
  };
}
