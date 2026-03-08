/**
 * Training drill system — pure functions only, no side effects.
 *
 * Key formula (TRAIN-06, no hidden ceiling):
 *   gain = BASE_DELTA * ageFactor * trainingFactor * (1 - currentValue)
 *
 * The (1 - currentValue) term provides asymptotic diminishing returns —
 * a player can always improve, but gains shrink as they approach 1.0.
 * There is NO potential cap, NO max ceiling.
 *
 * BASE_DELTA tuned to 0.0024 — verified by headless 5-season simulation:
 * players starting below 0.70 do not exceed 0.95 after 950 training sessions.
 */

import type { PlayerState, PlayerAttributes, PersonalityVector, Role } from '../simulation/types.ts';
import type { TrainingSchedule, TrainingDeltas } from './season.ts';

// ---------------------------------------------------------------------------
// DrillType — const-object pattern (project convention, per types.ts)
// ---------------------------------------------------------------------------

export const DrillType = {
  FITNESS:    'fitness',
  PASSING:    'passing',
  SHOOTING:   'shooting',
  DEFENDING:  'defending',
  SET_PIECES: 'set_pieces',
  TACTICS:    'tactics',
  DRIBBLING:  'dribbling',
  AERIAL:     'aerial',
} as const;

export type DrillType = (typeof DrillType)[keyof typeof DrillType];

// ---------------------------------------------------------------------------
// Drill → attribute mapping
// ---------------------------------------------------------------------------

/**
 * Maps each drill type to the player attributes it targets.
 * Only listed attributes improve during a drill session — all others remain unchanged.
 */
export const DRILL_ATTRIBUTE_MAP: Record<DrillType, Array<keyof PlayerAttributes>> = {
  fitness:    ['pace', 'stamina', 'strength', 'acceleration', 'agility'],
  passing:    ['passing', 'vision', 'crossing', 'distribution'],
  shooting:   ['shooting', 'finishing'],
  defending:  ['tackling', 'positioning', 'heading', 'concentration'],
  set_pieces: ['crossing', 'finishing', 'heading'],
  tactics:    ['positioning', 'vision', 'concentration'],
  dribbling:  ['dribbling', 'agility', 'acceleration'],
  aerial:     ['aerial', 'heading', 'strength'],
};

/**
 * Convenience array of all drill types — useful for cycling through drills
 * in the economy simulation and scheduler.
 */
export const ALL_DRILL_TYPES: DrillType[] = Object.values(DrillType);

/**
 * Human-readable label for each DrillType — used in the training scheduler UI
 * and the player profile delta panel.
 *
 * Single source of truth: both hub scheduler and profile deltas import from here
 * to avoid diverging formatting.
 */
export const DRILL_LABELS: Record<DrillType, string> = {
  fitness:    'Fitness',
  passing:    'Passing',
  shooting:   'Shooting',
  defending:  'Defending',
  set_pieces: 'Set Pieces',
  tactics:    'Tactics',
  dribbling:  'Dribbling',
  aerial:     'Aerial',
};

// ---------------------------------------------------------------------------
// Training groups — squad split for per-group drill assignment
// ---------------------------------------------------------------------------

export const TrainingGroup = {
  GK:  'GK',
  DEF: 'DEF',
  ATK: 'ATK',
} as const;

export type TrainingGroup = (typeof TrainingGroup)[keyof typeof TrainingGroup];

export const TRAINING_GROUP_LABELS: Record<TrainingGroup, string> = {
  GK:  'Goalkeepers',
  DEF: 'Defenders',
  ATK: 'Attackers',
};

/** Maps a player role to the default training group. */
export function roleToTrainingGroup(role: Role | string): TrainingGroup {
  switch (role) {
    case 'GK': return TrainingGroup.GK;
    case 'CB': case 'LB': case 'RB': case 'CDM': case 'CM': return TrainingGroup.DEF;
    case 'CAM': case 'LW': case 'RW': case 'ST': return TrainingGroup.ATK;
    default: return TrainingGroup.DEF;
  }
}

/** Returns the effective training group for a player, checking overrides first. */
export function getPlayerTrainingGroup(
  player: PlayerState,
  overrides?: Map<string, TrainingGroup>,
): TrainingGroup {
  return overrides?.get(player.id) ?? roleToTrainingGroup(player.role);
}

// ---------------------------------------------------------------------------
// Training Day Presets — slot-based schedule with per-group attribute picks
// ---------------------------------------------------------------------------

/** A single time slot within a training day — each group trains one attribute. */
export interface TrainingSlot {
  gk: keyof PlayerAttributes | 'rest';
  def: keyof PlayerAttributes | 'rest';
  atk: keyof PlayerAttributes | 'rest';
}

export interface TrainingDayPreset {
  id: string;
  name: string;
  slots: [TrainingSlot, TrainingSlot, TrainingSlot]; // Morning / Afternoon / Evening
  intensity: number;  // 1-5, default 3. Higher = faster gains but more fatigue.
}

/** All trainable attribute keys — used for dropdown options in the UI. */
export const ALL_TRAINABLE_ATTRS: Array<keyof PlayerAttributes> = [
  'pace', 'strength', 'stamina', 'acceleration', 'agility',
  'dribbling', 'passing', 'shooting', 'finishing', 'crossing',
  'tackling', 'aerial', 'heading', 'positioning', 'vision', 'concentration',
  'reflexes', 'handling', 'oneOnOnes', 'distribution',
];

/** Human-readable labels for attributes — used in training screen dropdowns. */
export const ATTR_LABELS: Record<keyof PlayerAttributes, string> = {
  pace: 'Pace', strength: 'Strength', stamina: 'Stamina',
  dribbling: 'Dribbling', passing: 'Passing', shooting: 'Shooting',
  tackling: 'Tackling', aerial: 'Aerial', positioning: 'Positioning',
  vision: 'Vision', acceleration: 'Acceleration', crossing: 'Crossing',
  finishing: 'Finishing', agility: 'Agility', heading: 'Heading',
  concentration: 'Concentration', reflexes: 'Reflexes', handling: 'Handling',
  oneOnOnes: '1v1s', distribution: 'Distribution',
};

export const SLOT_LABELS = ['Morning', 'Afternoon', 'Evening'] as const;

export const INTENSITY_LABELS: Record<number, string> = {
  1: 'Light', 2: 'Easy', 3: 'Moderate', 4: 'Hard', 5: 'Intense',
};

export const DEFAULT_PRESETS: TrainingDayPreset[] = [
  {
    id: 'preset-balanced', name: 'Balanced', intensity: 3,
    slots: [
      { gk: 'reflexes', def: 'pace', atk: 'pace' },
      { gk: 'handling', def: 'tackling', atk: 'shooting' },
      { gk: 'distribution', def: 'positioning', atk: 'finishing' },
    ],
  },
  {
    id: 'preset-match-prep', name: 'Match Prep', intensity: 3,
    slots: [
      { gk: 'positioning', def: 'concentration', atk: 'positioning' },
      { gk: 'oneOnOnes', def: 'positioning', atk: 'vision' },
      { gk: 'reflexes', def: 'tackling', atk: 'dribbling' },
    ],
  },
  {
    id: 'preset-physical', name: 'Physical', intensity: 4,
    slots: [
      { gk: 'pace', def: 'pace', atk: 'pace' },
      { gk: 'strength', def: 'strength', atk: 'strength' },
      { gk: 'stamina', def: 'stamina', atk: 'stamina' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/**
 * Number of training days available between consecutive matchdays.
 *
 * Set to 5 (Mon–Fri), with Saturday as match day and Sunday as enforced rest.
 * 38 matchdays × 5 training days = 190 sessions/season, 950 over 5 seasons.
 * Changing this constant requires re-running the headless sim and potentially
 * re-tuning BASE_DELTA to keep player growth below the 0.95 ceiling.
 */
export const TRAINING_DAYS_PER_MATCHDAY = 5;

/**
 * Base gain per training session, before age, personality, and intensity modifiers.
 * Tuned so players starting below 0.70 do not exceed 0.95 after 5 seasons
 * (950 sessions) when cycling all 8 drill types.
 *
 * Derivation: with ageFactor=1.0 (peak), trainingFactor=1.4 (work_rate=1.0),
 * intensityFactor=1.2 (intensity=3), and currentValue=0.50
 * → gain ≈ 0.0024 * 1.0 * 1.4 * 1.2 * 0.50 = 0.002016 per session.
 * Over 950 sessions at diminishing rate, a player peaks well below 0.95.
 */
export const BASE_DELTA = 0.0024;

// ---------------------------------------------------------------------------
// Age factor
// ---------------------------------------------------------------------------

/**
 * Returns a multiplier [0.15, 1.0] representing how efficiently a player
 * converts training into attribute gains based on their age.
 *
 * Age brackets:
 *   ≤20:    1.00 (peak learning rate)
 *   21-25:  linear 1.00 → 0.80
 *   26-30:  linear 0.80 → 0.50
 *   31-35:  linear 0.50 → 0.20
 *   36+:    0.15 (floor)
 */
export function getAgeFactor(age: number): number {
  if (age <= 20) return 1.0;
  if (age <= 25) return 1.0 - ((age - 20) / 5) * 0.20;   // 1.00 → 0.80
  if (age <= 30) return 0.80 - ((age - 25) / 5) * 0.30;  // 0.80 → 0.50
  if (age <= 35) return 0.50 - ((age - 30) / 5) * 0.30;  // 0.50 → 0.20
  return 0.15;
}

// ---------------------------------------------------------------------------
// Training / personality factor
// ---------------------------------------------------------------------------

/**
 * Returns a multiplier [0.6, 1.4] based on the player's work_rate personality trait.
 *
 * Formula: 0.6 + work_rate * 0.8
 *   work_rate=0.0 → 0.6 (reluctant trainer, gains 43% less than average)
 *   work_rate=0.5 → 1.0 (average)
 *   work_rate=1.0 → 1.4 (dedicated trainer, gains 40% more than average)
 *
 * A high work_rate player produces ~2.33x the gain of a low work_rate player.
 */
export function getTrainingFactor(personality: PersonalityVector): number {
  return 0.6 + personality.work_rate * 0.8;
}

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

/**
 * Applies a single drill session to one player.
 * Returns a new PlayerState — original is never mutated.
 */
function applyDrillToPlayer(player: PlayerState, drill: DrillType): PlayerState {
  const targets = DRILL_ATTRIBUTE_MAP[drill];
  const age = player.age ?? 25;  // undefined age defaults to 25
  const ageFactor = getAgeFactor(age);
  const trainingFactor = getTrainingFactor(player.personality);

  // Spread existing attributes — only targeted ones will be overwritten
  const newAttributes: PlayerAttributes = { ...player.attributes };

  for (const attr of targets) {
    const current = player.attributes[attr];
    // gain = BASE_DELTA * ageFactor * trainingFactor * (1 - currentValue)
    // (1 - currentValue) is the diminishing-returns term — asymptotes toward 1.0
    const gain = BASE_DELTA * ageFactor * trainingFactor * (1 - current);
    // Use type assertion to write to a readonly interface copy
    (newAttributes as Record<keyof PlayerAttributes, number>)[attr] = Math.min(1, current + gain);
  }

  return { ...player, attributes: newAttributes };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies a drill session to an entire squad.
 *
 * Pure function — no mutation, no external state, no side effects.
 *
 * @param players - The current squad state
 * @param drill   - The drill type to apply this session
 * @returns       - A new PlayerState[] with improved targeted attributes
 */
export function applyDrill(players: PlayerState[], drill: DrillType): PlayerState[] {
  return players.map(p => applyDrillToPlayer(p, drill));
}

/**
 * Applies a single-attribute training gain to one player.
 * Returns a new PlayerState — original is never mutated.
 */
function applyAttributeToPlayer(
  player: PlayerState,
  attr: keyof PlayerAttributes,
  intensityFactor: number = 1.0,
): PlayerState {
  const age = player.age ?? 25;
  const ageFactor = getAgeFactor(age);
  const trainingFactor = getTrainingFactor(player.personality);
  const current = player.attributes[attr];
  const gain = BASE_DELTA * ageFactor * trainingFactor * (1 - current) * intensityFactor;

  const newAttributes: PlayerAttributes = { ...player.attributes };
  (newAttributes as Record<keyof PlayerAttributes, number>)[attr] = Math.min(1, current + gain);
  return { ...player, attributes: newAttributes };
}

/**
 * Applies a full training day preset to a squad.
 * Each slot trains one attribute per group. 3 slots = 3 attribute gains per group per day.
 * Pure function — returns new PlayerState[], never mutates input.
 */
export function applyTrainingDay(
  players: PlayerState[],
  preset: TrainingDayPreset,
  groupOverrides?: Map<string, TrainingGroup>,
): PlayerState[] {
  let current = players;
  const intensityFactor = 0.6 + (preset.intensity ?? 3) * 0.2;
  const groupKey: Record<TrainingGroup, 'gk' | 'def' | 'atk'> = {
    GK: 'gk', DEF: 'def', ATK: 'atk',
  };

  for (const slot of preset.slots) {
    current = current.map(p => {
      const group = getPlayerTrainingGroup(p, groupOverrides);
      const attr = slot[groupKey[group]];
      if (attr === 'rest') return p;
      return applyAttributeToPlayer(p, attr as keyof PlayerAttributes, intensityFactor);
    });
  }

  return current;
}

/**
 * Applies a full training block (schedule of drill/rest days) to a squad.
 *
 * Pure function — processes each scheduled day in order, skipping rest days.
 * Accumulates per-player attribute deltas across all drill sessions.
 *
 * @param players  - The current squad state
 * @param schedule - Record keyed by day index (0-based) mapping to DrillType | 'rest'
 * @returns        - { updatedSquad: new PlayerState[], deltas: per-player attribute gains }
 */
export function applyTrainingBlock(
  players: PlayerState[],
  schedule: TrainingSchedule,
): { updatedSquad: PlayerState[]; deltas: TrainingDeltas } {
  const deltas: TrainingDeltas = new Map();

  // Initialize delta tracking — every player starts with an empty gains object
  for (const player of players) {
    deltas.set(player.id, {});
  }

  let current = players;

  // Sort entries by day index to ensure deterministic processing order
  const sortedEntries = Object.entries(schedule).sort(
    ([a], [b]) => Number(a) - Number(b),
  );

  for (const [, plan] of sortedEntries) {
    if (plan === 'rest') continue;

    const drill = plan as DrillType;
    const before = current;
    current = applyDrill(current, drill);

    // Accumulate per-attribute gains into deltas
    for (let i = 0; i < current.length; i++) {
      const prev = before[i]!;
      const next = current[i]!;
      const playerDeltas = deltas.get(prev.id) ?? {};

      for (const attr of DRILL_ATTRIBUTE_MAP[drill]) {
        const gain = next.attributes[attr] - prev.attributes[attr];
        if (gain > 0) {
          (playerDeltas as Record<keyof PlayerAttributes, number>)[attr] =
            ((playerDeltas as Record<keyof PlayerAttributes, number>)[attr] ?? 0) + gain;
        }
      }

      deltas.set(prev.id, playerDeltas);
    }
  }

  return { updatedSquad: current, deltas };
}
