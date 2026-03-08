/**
 * Day Loop state machine — pure functions for day-by-day training progression.
 *
 * Each press of Continue advances exactly one day (training or match day).
 * This is the data layer; the UI wiring lives in Plan 02.
 *
 * Key design: all functions are PURE — they return new state, never mutate input.
 * This matches the project's functional state pattern (recordPlayerResult, simOneAIFixture, etc.)
 */

import type { SeasonState, TrainingDeltas } from './season.ts';
import { applyDrill, TRAINING_DAYS_PER_MATCHDAY, DRILL_ATTRIBUTE_MAP } from './training.ts';
import type { DrillType } from './training.ts';
import type { PlayerAttributes } from '../simulation/types.ts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Descriptor for a single day slot in the training block + match day display.
 * Used to render the day progress bar in the Hub UI.
 */
export interface DayDescriptor {
  dayIndex: number;          // 0-based: 0, 1, 2 = training days; 3 = match day
  label: string;             // 'Day 1', 'Day 2', 'Day 3', 'Match Day'
  type: 'training' | 'match';
  status: 'past' | 'current' | 'future';
}

/**
 * Result returned by advanceDay.
 * Contains the updated state and a flag indicating whether the new day is match day.
 */
export interface DayAdvanceResult {
  state: SeasonState;     // updated state with incremented currentDay (and possibly updated squad/deltas)
  isMatchDay: boolean;    // true if the NEW currentDay equals TRAINING_DAYS_PER_MATCHDAY
}

// ---------------------------------------------------------------------------
// isMatchDay
// ---------------------------------------------------------------------------

/**
 * Returns true when the current day is match day (i.e., all training days are done).
 * Match day = currentDay >= TRAINING_DAYS_PER_MATCHDAY.
 */
export function isMatchDay(state: SeasonState): boolean {
  return state.currentDay >= TRAINING_DAYS_PER_MATCHDAY;
}

// ---------------------------------------------------------------------------
// getDaySchedule
// ---------------------------------------------------------------------------

/**
 * Returns an array of TRAINING_DAYS_PER_MATCHDAY + 1 day descriptors
 * (3 training days + 1 match day), each marked as past/current/future
 * based on state.currentDay.
 */
export function getDaySchedule(state: SeasonState): DayDescriptor[] {
  const total = TRAINING_DAYS_PER_MATCHDAY + 1; // e.g., 4: days 0,1,2 + match day at index 3
  const descriptors: DayDescriptor[] = [];

  for (let i = 0; i < total; i++) {
    const isTraining = i < TRAINING_DAYS_PER_MATCHDAY;

    let status: 'past' | 'current' | 'future';
    if (i < state.currentDay) {
      status = 'past';
    } else if (i === state.currentDay) {
      status = 'current';
    } else {
      status = 'future';
    }

    const label = isTraining ? `Day ${i + 1}` : 'Match Day';

    descriptors.push({
      dayIndex: i,
      label,
      type: isTraining ? 'training' : 'match',
      status,
    });
  }

  return descriptors;
}

// ---------------------------------------------------------------------------
// advanceDay
// ---------------------------------------------------------------------------

/**
 * Advances the season state by exactly one day.
 *
 * Pure function — returns a new SeasonState, never mutates the input.
 *
 * Behaviour:
 *  - If isMatchDay(state), throws Error('Cannot advance past match day').
 *  - Reads the training plan for the current day from state.trainingSchedule.
 *  - If the plan is a drill, applies it to the player team's squad and accumulates
 *    per-player attribute deltas into state.trainingDeltas (additive across days).
 *  - If the plan is 'rest' (or undefined), no attribute changes.
 *  - Returns the updated state with currentDay incremented by 1, and isMatchDay flag.
 */
export function advanceDay(state: SeasonState): DayAdvanceResult {
  if (isMatchDay(state)) {
    throw new Error('Cannot advance past match day');
  }

  const dayPlan = state.trainingSchedule?.[state.currentDay] ?? 'rest';

  // Find the player team (the only team whose squad is trained day-by-day)
  const playerTeamIndex = state.teams.findIndex(t => t.isPlayerTeam);
  const playerTeam = state.teams[playerTeamIndex];

  if (!playerTeam) {
    // Should never happen in normal game flow; return incremented day with no changes
    const newDay = state.currentDay + 1;
    return {
      state: { ...state, currentDay: newDay },
      isMatchDay: newDay >= TRAINING_DAYS_PER_MATCHDAY,
    };
  }

  let updatedSquad = playerTeam.squad;
  let mergedDeltas: TrainingDeltas = new Map(state.trainingDeltas ?? new Map());

  if (dayPlan !== 'rest') {
    const drill = dayPlan as DrillType;
    const beforeSquad = playerTeam.squad;
    updatedSquad = applyDrill(beforeSquad, drill);

    // Compute per-player attribute deltas and merge into existing deltas (additive)
    const targets = DRILL_ATTRIBUTE_MAP[drill];

    for (let i = 0; i < updatedSquad.length; i++) {
      const prev = beforeSquad[i]!;
      const next = updatedSquad[i]!;
      const existingPlayerDeltas = mergedDeltas.get(prev.id) ?? {};
      const playerDeltas = { ...existingPlayerDeltas };

      for (const attr of targets) {
        const gain = next.attributes[attr] - prev.attributes[attr];
        if (gain > 0) {
          (playerDeltas as Record<keyof PlayerAttributes, number>)[attr] =
            ((playerDeltas as Record<keyof PlayerAttributes, number>)[attr] ?? 0) + gain;
        }
      }

      mergedDeltas.set(prev.id, playerDeltas);
    }
  }

  // Rebuild teams array with the updated player team squad
  const updatedTeams = state.teams.map((team, idx) =>
    idx === playerTeamIndex ? { ...team, squad: updatedSquad } : team
  );

  const newDay = state.currentDay + 1;

  return {
    state: {
      ...state,
      currentDay: newDay,
      teams: updatedTeams,
      trainingDeltas: mergedDeltas,
    },
    isMatchDay: newDay >= TRAINING_DAYS_PER_MATCHDAY,
  };
}
