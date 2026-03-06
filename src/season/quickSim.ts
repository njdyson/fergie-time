/**
 * Quick match simulation for AI vs AI fixtures.
 * Drives SimulationEngine headlessly to FULL_TIME and returns the score.
 *
 * Performance target: < 500ms per match. 19 matches ~ 5-10s total —
 * run after player's match, before Hub navigation.
 */

import { SimulationEngine } from '../simulation/engine.ts';
import type { MatchConfig } from '../simulation/engine.ts';
import { MatchPhase } from '../simulation/types.ts';

const FIXED_DT_MS = 1000 / 30;
const MAX_TICKS = 6000; // safety guard: 5400 ticks normal + buffer

export interface QuickSimResult {
  homeGoals: number;
  awayGoals: number;
}

/**
 * Run a full headless match simulation and return the final score.
 * Uses the real SimulationEngine driven tick-by-tick to FULL_TIME.
 * Handles the halftime latch automatically by calling startSecondHalf().
 */
export function quickSimMatch(config: MatchConfig): QuickSimResult {
  const engine = new SimulationEngine(config);
  let snap = engine.tick(FIXED_DT_MS);
  let guard = 1;
  while (snap.matchPhase !== MatchPhase.FULL_TIME && guard < MAX_TICKS) {
    // Handle halftime latch — engine pauses at halftime until explicitly continued
    if (engine.isHalftimeLatched()) {
      engine.startSecondHalf();
    }
    snap = engine.tick(FIXED_DT_MS);
    guard++;
  }
  return { homeGoals: snap.score[0], awayGoals: snap.score[1] };
}
