import { MatchPhase } from '../types.ts';
import type { MatchEvent } from '../types.ts';

// Simulation time compression:
// A "90-minute" match runs for 5400 ticks (3 real minutes at 30 ticks/sec).
// Each tick represents ~1 second of match time.
export const TICKS_PER_HALF = 2700;
export const TOTAL_MATCH_TICKS = 5400;

export interface PhaseResult {
  readonly phase: MatchPhase;
  readonly events: MatchEvent[];
}

/**
 * Advance the match phase based on current phase, tick count, and whether a goal was just scored.
 *
 * Transitions:
 *   KICKOFF (tick 0) → stays KICKOFF
 *   KICKOFF (tick 1+) → FIRST_HALF (kickoff event emitted)
 *   FIRST_HALF (tick < 2700) → stays FIRST_HALF
 *   FIRST_HALF (tick >= 2700, no goal) → HALFTIME (halftime event emitted)
 *   HALFTIME (tick <= 2700) → stays HALFTIME
 *   HALFTIME (tick > 2700) → SECOND_HALF
 *   SECOND_HALF (tick < 5400, no goal) → stays SECOND_HALF
 *   SECOND_HALF (tick >= 5400) → FULL_TIME (fulltime event emitted)
 *   FULL_TIME → terminal, stays FULL_TIME
 *
 *   Goal during FIRST_HALF or SECOND_HALF → KICKOFF restart (goal event emitted, takes priority over halftime)
 *
 * Pure function — no side effects.
 */
export function advancePhase(
  currentPhase: MatchPhase,
  tick: number,
  justScored: boolean,
): PhaseResult {
  const events: MatchEvent[] = [];

  switch (currentPhase) {
    case MatchPhase.KICKOFF: {
      if (tick === 0) {
        return { phase: MatchPhase.KICKOFF, events: [] };
      }
      // Tick 1+: kickoff is processed, transition to first half
      events.push({ tick, type: 'kickoff' });
      return { phase: MatchPhase.FIRST_HALF, events };
    }

    case MatchPhase.FIRST_HALF: {
      // Goal takes priority over halftime transition
      if (justScored) {
        events.push({ tick, type: 'goal' });
        return { phase: MatchPhase.KICKOFF, events };
      }
      if (tick >= TICKS_PER_HALF) {
        events.push({ tick, type: 'halftime' });
        return { phase: MatchPhase.HALFTIME, events };
      }
      return { phase: MatchPhase.FIRST_HALF, events: [] };
    }

    case MatchPhase.HALFTIME: {
      if (tick > TICKS_PER_HALF) {
        return { phase: MatchPhase.SECOND_HALF, events: [] };
      }
      return { phase: MatchPhase.HALFTIME, events: [] };
    }

    case MatchPhase.SECOND_HALF: {
      // Goal takes priority over fulltime transition
      if (justScored) {
        events.push({ tick, type: 'goal' });
        return { phase: MatchPhase.KICKOFF, events };
      }
      if (tick >= TOTAL_MATCH_TICKS) {
        events.push({ tick, type: 'fulltime' });
        return { phase: MatchPhase.FULL_TIME, events };
      }
      return { phase: MatchPhase.SECOND_HALF, events: [] };
    }

    case MatchPhase.FULL_TIME: {
      return { phase: MatchPhase.FULL_TIME, events: [] };
    }

    default: {
      // Exhaustive check — TypeScript should catch unreachable code
      const _exhaustive: never = currentPhase;
      return { phase: _exhaustive, events: [] };
    }
  }
}
