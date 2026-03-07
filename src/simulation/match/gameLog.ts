import type { TeamId } from '../types.ts';
import { TUNING } from '../tuning.ts';

/**
 * Per-player match statistics computed from the game log.
 */
export interface PlayerLogStats {
  playerId: string;
  role: string;
  teamId: TeamId;
  passes: number;
  passesCompleted: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  tacklesWon: number;
  tacklesAttempted: number;
  yellowCards: number;
  redCards: number;
}

/**
 * A discrete game event with full context for post-match analysis.
 */
export interface GameLogEntry {
  readonly tick: number;
  readonly matchMinute: number;
  readonly type: 'pass' | 'shot' | 'goal' | 'tackle' | 'foul' | 'yellow_card' | 'red_card' | 'offside' | 'possession_change' | 'kickoff' | 'halftime' | 'fulltime' | 'throw_in' | 'corner' | 'goal_kick' | 'free_kick';
  readonly teamId: TeamId;
  readonly playerId?: string;
  readonly playerRole?: string;
  readonly position?: { x: number; y: number };
  readonly data?: Record<string, unknown>;
}

/**
 * Structured game event log that records discrete events during a match.
 * Events are recorded when they actually happen (ball kicked, goal scored),
 * not when a player intends to do something.
 */
export class GameEventLog {
  private entries: GameLogEntry[] = [];

  // Per-player completion tracking (not event-based — resolved after the fact)
  private playerPassCompletions = new Map<string, number>();
  private playerShotsOnTarget = new Map<string, number>();

  /** Ticks per match half — used to compute match minute. */
  private readonly ticksPerHalf: number;

  constructor(ticksPerHalf: number = 2700) {
    this.ticksPerHalf = ticksPerHalf;
  }

  /** Record a completed pass for a player (teammate received the ball). */
  recordPassCompletion(playerId: string): void {
    this.playerPassCompletions.set(playerId, (this.playerPassCompletions.get(playerId) ?? 0) + 1);
  }

  /** Record a shot on target for a player. */
  recordShotOnTarget(playerId: string): void {
    this.playerShotsOnTarget.set(playerId, (this.playerShotsOnTarget.get(playerId) ?? 0) + 1);
  }

  private toMinute(tick: number): number {
    return Math.floor((tick / (this.ticksPerHalf * 2)) * 90);
  }

  recordPass(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    fromX: number, fromY: number, toX: number, toY: number,
    targetPlayerId: string, passType: 'forward' | 'safe', distance: number): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'pass',
      teamId,
      playerId,
      playerRole,
      position: { x: fromX, y: fromY },
      data: { toX, toY, targetPlayerId, passType, distance: Math.round(distance) },
    });
  }

  recordShot(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number, distanceToGoal: number): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'shot',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
      data: { distanceToGoal: Math.round(distanceToGoal) },
    });
  }

  recordGoal(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number, score: [number, number]): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'goal',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
      data: { score: [...score] },
    });
  }

  recordTackle(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number, targetPlayerId: string, success: boolean): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'tackle',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
      data: { targetPlayerId, success },
    });
  }

  recordPossessionChange(tick: number, teamId: TeamId, fromTeamId: TeamId | null): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'possession_change',
      teamId,
      data: { fromTeamId },
    });
  }

  recordThrowIn(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'throw_in',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
    });
  }

  recordCorner(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'corner',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
    });
  }

  recordGoalKick(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'goal_kick',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
    });
  }

  recordFreeKick(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'free_kick',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
    });
  }

  recordFoul(tick: number, awardedTeamId: TeamId, foulerId: string, foulerRole: string,
    victimPlayerId: string, x: number, y: number): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'foul',
      teamId: awardedTeamId,
      playerId: foulerId,
      playerRole: foulerRole,
      position: { x, y },
      data: { victimPlayerId },
    });
  }

  recordYellowCard(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'yellow_card',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
    });
  }

  recordRedCard(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number, secondYellow: boolean): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'red_card',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
      data: { secondYellow },
    });
  }

  recordOffside(tick: number, teamId: TeamId, playerId: string, playerRole: string,
    x: number, y: number): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type: 'offside',
      teamId,
      playerId,
      playerRole,
      position: { x, y },
    });
  }

  recordPhase(tick: number, type: 'kickoff' | 'halftime' | 'fulltime'): void {
    this.entries.push({
      tick,
      matchMinute: this.toMinute(tick),
      type,
      teamId: 'home', // placeholder — phase events are team-neutral
    });
  }

  getEntries(): readonly GameLogEntry[] {
    return this.entries;
  }

  /**
   * Compute per-player stats from the log for post-match display.
   * Returns a map of playerId → stats.
   */
  getPlayerStats(): Map<string, PlayerLogStats> {
    const stats = new Map<string, PlayerLogStats>();

    const ensure = (id: string, role: string, teamId: TeamId): PlayerLogStats => {
      let s = stats.get(id);
      if (!s) {
        s = { playerId: id, role, teamId, passes: 0, passesCompleted: 0, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, tacklesWon: 0, tacklesAttempted: 0, yellowCards: 0, redCards: 0 };
        stats.set(id, s);
      }
      return s;
    };

    // Build goal list for assist detection
    const goals: { tick: number; teamId: TeamId; playerId: string }[] = [];
    for (const e of this.entries) {
      if (e.type === 'goal' && e.playerId) {
        goals.push({ tick: e.tick, teamId: e.teamId, playerId: e.playerId });
      }
    }

    // Find last passer before each goal (same team) for assists
    const assistMap = new Map<number, string>(); // goalTick → assistPlayerId
    for (const goal of goals) {
      // Walk backwards to find the last pass by the same team before this goal
      let lastPasser: string | null = null;
      for (let i = this.entries.length - 1; i >= 0; i--) {
        const e = this.entries[i]!;
        if (e.tick >= goal.tick) continue;
        if (e.tick < goal.tick - 300) break; // only look back ~10 seconds
        if (e.type === 'pass' && e.teamId === goal.teamId && e.playerId && e.playerId !== goal.playerId) {
          lastPasser = e.playerId;
          break;
        }
      }
      if (lastPasser) assistMap.set(goal.tick, lastPasser);
    }

    for (const e of this.entries) {
      if (!e.playerId || !e.playerRole) continue;
      const s = ensure(e.playerId, e.playerRole, e.teamId);

      switch (e.type) {
        case 'pass':
          s.passes++;
          break;
        case 'shot':
          s.shots++;
          break;
        case 'goal':
          s.goals++;
          break;
        case 'tackle':
          s.tacklesAttempted++;
          if (e.data?.success) s.tacklesWon++;
          break;
        case 'yellow_card':
          s.yellowCards++;
          break;
        case 'red_card':
          s.redCards++;
          break;
      }
    }

    // Apply assists
    for (const [, assistId] of assistMap) {
      const s = stats.get(assistId);
      if (s) s.assists++;
    }

    // Merge per-player completion data
    for (const [id, count] of this.playerPassCompletions) {
      const s = stats.get(id);
      if (s) s.passesCompleted = count;
    }
    for (const [id, count] of this.playerShotsOnTarget) {
      const s = stats.get(id);
      if (s) s.shotsOnTarget = count;
    }

    return stats;
  }

  /** Export full log as JSON string for download/analysis. */
  toJSON(): string {
    const summary = this.getSummary();
    return JSON.stringify({ summary, tuning: { ...TUNING }, events: this.entries }, null, 2);
  }

  /** Compute a summary of the log for quick overview. */
  getSummary(): Record<string, unknown> {
    const passes = this.entries.filter(e => e.type === 'pass');
    const shots = this.entries.filter(e => e.type === 'shot');
    const goals = this.entries.filter(e => e.type === 'goal');
    const tackles = this.entries.filter(e => e.type === 'tackle');

    const homePasses = passes.filter(e => e.teamId === 'home');
    const awayPasses = passes.filter(e => e.teamId === 'away');
    const homeShots = shots.filter(e => e.teamId === 'home');
    const awayShots = shots.filter(e => e.teamId === 'away');

    // Pass distance analysis
    const passDistances = passes.map(e => (e.data?.distance as number) ?? 0);
    const avgPassDist = passDistances.length > 0
      ? passDistances.reduce((a, b) => a + b, 0) / passDistances.length : 0;

    // Shot distance analysis
    const shotDistances = shots.map(e => (e.data?.distanceToGoal as number) ?? 0);
    const avgShotDist = shotDistances.length > 0
      ? shotDistances.reduce((a, b) => a + b, 0) / shotDistances.length : 0;

    // Pass type breakdown
    const forwardPasses = passes.filter(e => e.data?.passType === 'forward').length;
    const safePasses = passes.filter(e => e.data?.passType === 'safe').length;

    // Passes by role
    const passesByRole: Record<string, number> = {};
    for (const p of passes) {
      const role = p.playerRole ?? 'unknown';
      passesByRole[role] = (passesByRole[role] ?? 0) + 1;
    }

    // Shots by role
    const shotsByRole: Record<string, number> = {};
    for (const s of shots) {
      const role = s.playerRole ?? 'unknown';
      shotsByRole[role] = (shotsByRole[role] ?? 0) + 1;
    }

    // Pass distance breakdown: short (<15m), medium (15-30m), long (>30m)
    const shortPasses = passes.filter(e => ((e.data?.distance as number) ?? 0) < 15).length;
    const mediumPasses = passes.filter(e => {
      const d = (e.data?.distance as number) ?? 0;
      return d >= 15 && d <= 30;
    }).length;
    const longPasses = passes.filter(e => ((e.data?.distance as number) ?? 0) > 30).length;

    return {
      totalEvents: this.entries.length,
      passes: { home: homePasses.length, away: awayPasses.length, total: passes.length },
      shots: { home: homeShots.length, away: awayShots.length, total: shots.length },
      goals: { home: goals.filter(e => e.teamId === 'home').length, away: goals.filter(e => e.teamId === 'away').length },
      tackles: { home: tackles.filter(e => e.teamId === 'home').length, away: tackles.filter(e => e.teamId === 'away').length, total: tackles.length },
      avgPassDistance: Math.round(avgPassDist),
      passDistanceBreakdown: { short: shortPasses, medium: mediumPasses, long: longPasses },
      avgShotDistance: Math.round(avgShotDist),
      passTypes: { forward: forwardPasses, safe: safePasses },
      passesByRole,
      shotsByRole,
    };
  }
}
