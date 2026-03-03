import type { MatchStats, ActionIntent, TeamId, PlayerState } from '../types.ts';

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
   * Only records intents that aren't tracked as discrete events elsewhere.
   * Shots and passes are recorded via recordShot/recordPass when the kick actually executes.
   */
  recordIntent(_intent: ActionIntent, _teamId: TeamId): void {
    // Shots and passes are now recorded as discrete kick events (recordShot/recordPass).
    // This method is kept for API compatibility but no longer increments shot/pass counters.
  }

  /** Record an actual shot (ball kicked toward goal). */
  recordShot(teamId: TeamId): void {
    if (teamId === 'home') this.homeShots++;
    else this.awayShots++;
  }

  /** Record an actual pass (ball kicked to teammate). */
  recordPass(teamId: TeamId): void {
    if (teamId === 'home') this.homePasses++;
    else this.awayPasses++;
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
  _intents: readonly ActionIntent[],
  ballCarrierTeamId: TeamId | null,
  _players: readonly PlayerState[],
): MatchStats {
  // Shots, passes, and tackles are recorded as discrete events via the engine,
  // not from intents. This function only updates possession.
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
    shots: current.shots,
    passes: current.passes,
    tackles: current.tackles,
  };
}
