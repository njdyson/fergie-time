/**
 * Player season statistics — accumulation and merge functions.
 *
 * PlayerSeasonStats aggregates per-player numbers across all matches in a season.
 * The schema is extensible: adding a new stat requires only adding to the interface
 * and including it in mergeMatchStats.
 */

import type { PlayerLogStats } from '../simulation/match/gameLog.ts';
import type { TeamId } from '../simulation/types.ts';

/**
 * Accumulated per-player stats for an entire season.
 * All fields are integers or floats; no nulls.
 */
export interface PlayerSeasonStats {
  goals: number;
  assists: number;
  appearances: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  tacklesWon: number;
  tacklesAttempted: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;
  minutesPlayed: number;
}

/** Returns a PlayerSeasonStats with all fields initialized to 0. */
export function createEmptySeasonStats(): PlayerSeasonStats {
  return {
    goals: 0,
    assists: 0,
    appearances: 0,
    shots: 0,
    shotsOnTarget: 0,
    passes: 0,
    passesCompleted: 0,
    tacklesWon: 0,
    tacklesAttempted: 0,
    yellowCards: 0,
    redCards: 0,
    cleanSheets: 0,
    minutesPlayed: 0,
  };
}

/**
 * Merge a single match's PlayerLogStats into a player's season accumulator.
 *
 * @param season     - The player's running season totals (immutable).
 * @param match      - The stats from one match (from gameLog.getPlayerStats()).
 * @param minutesPlayed - Minutes the player was on the pitch this match.
 * @param teamConceded  - Number of goals the player's team conceded this match.
 * @returns New PlayerSeasonStats with match stats merged in.
 */
export function mergeMatchStats(
  season: PlayerSeasonStats,
  match: PlayerLogStats,
  minutesPlayed: number,
  teamConceded: number,
): PlayerSeasonStats {
  const cleanSheetIncrement = match.role === 'GK' && teamConceded === 0 ? 1 : 0;

  return {
    goals: season.goals + match.goals,
    assists: season.assists + match.assists,
    appearances: season.appearances + 1,
    shots: season.shots + match.shots,
    shotsOnTarget: season.shotsOnTarget + match.shotsOnTarget,
    passes: season.passes + match.passes,
    passesCompleted: season.passesCompleted + match.passesCompleted,
    tacklesWon: season.tacklesWon + match.tacklesWon,
    tacklesAttempted: season.tacklesAttempted + match.tacklesAttempted,
    yellowCards: season.yellowCards + match.yellowCards,
    redCards: season.redCards + match.redCards,
    cleanSheets: season.cleanSheets + cleanSheetIncrement,
    minutesPlayed: season.minutesPlayed + minutesPlayed,
  };
}

/**
 * Merge all players' match stats into the season accumulator Map.
 *
 * @param seasonStats  - Current season stats for all players (may be empty).
 * @param matchStats   - Per-player stats from a single match.
 * @param goalsConceded - Goals conceded by each team in this match: { home, away }.
 * @returns New Map with updated season stats for all players in matchStats.
 */
export function mergeAllMatchStats(
  seasonStats: Map<string, PlayerSeasonStats>,
  matchStats: Map<string, PlayerLogStats>,
  goalsConceded: Record<TeamId, number>,
): Map<string, PlayerSeasonStats> {
  const updated = new Map<string, PlayerSeasonStats>(seasonStats);

  for (const [playerId, match] of matchStats) {
    const current = updated.get(playerId) ?? createEmptySeasonStats();
    const teamConceded = goalsConceded[match.teamId] ?? 0;
    updated.set(playerId, mergeMatchStats(current, match, 90, teamConceded));
  }

  return updated;
}
