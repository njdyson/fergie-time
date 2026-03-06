/**
 * Quick match simulation for AI vs AI fixtures.
 * Stub — full implementation in Plan 05.
 */

import type { PlayerState } from '../simulation/types.ts';

export interface QuickSimResult {
  homeGoals: number;
  awayGoals: number;
}

/**
 * Simulate a match between two AI squads using simplified logic.
 * Returns a score result without running the full physics engine.
 */
export function quickSimMatch(
  _homeSquad: PlayerState[],
  _awaySquad: PlayerState[],
  _rng: () => number,
): QuickSimResult {
  // Stub: Plan 05 will implement full quick-sim logic.
  // For now, return a deterministic result.
  return { homeGoals: 1, awayGoals: 0 };
}
