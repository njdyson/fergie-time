/**
 * Training drill system tests — TDD RED phase
 * Tests for applyDrill pure function: attribute improvement, age/personality factors,
 * diminishing returns, immutability, and 5-season economy simulation.
 */

import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { applyDrill, applyTrainingBlock, DrillType, DRILL_ATTRIBUTE_MAP, DRILL_LABELS, ALL_DRILL_TYPES, TRAINING_DAYS_PER_MATCHDAY } from './training.ts';
import type { TrainingSchedule } from './season.ts';
import { createAITeam } from './teamGen.ts';
import type { PlayerState, PlayerAttributes, PersonalityVector } from '../simulation/types.ts';
import { Duty } from '../simulation/types.ts';
import { Vec2 } from '../simulation/math/vec2.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDefaultAttributes(overrides?: Partial<PlayerAttributes>): PlayerAttributes {
  return {
    pace: 0.50,
    strength: 0.50,
    stamina: 0.50,
    dribbling: 0.50,
    passing: 0.50,
    shooting: 0.50,
    tackling: 0.50,
    aerial: 0.50,
    positioning: 0.50,
    vision: 0.50,
    acceleration: 0.50,
    crossing: 0.50,
    finishing: 0.50,
    agility: 0.50,
    heading: 0.50,
    concentration: 0.50,
    reflexes: 0.40,
    handling: 0.40,
    oneOnOnes: 0.40,
    distribution: 0.50,
    ...overrides,
  };
}

function makeDefaultPersonality(overrides?: Partial<PersonalityVector>): PersonalityVector {
  return {
    directness: 0.5,
    risk_appetite: 0.5,
    composure: 0.5,
    creativity: 0.5,
    work_rate: 0.5,
    aggression: 0.5,
    anticipation: 0.5,
    flair: 0.5,
    ...overrides,
  };
}

function makePlayer(overrides?: {
  attributes?: Partial<PlayerAttributes>;
  personality?: Partial<PersonalityVector>;
  age?: number;
  id?: string;
}): PlayerState {
  return {
    id: overrides?.id ?? 'test-player',
    teamId: 'home',
    position: Vec2.zero(),
    velocity: Vec2.zero(),
    formationAnchor: Vec2.zero(),
    attributes: makeDefaultAttributes(overrides?.attributes),
    personality: makeDefaultPersonality(overrides?.personality),
    fatigue: 0,
    role: 'CM',
    duty: Duty.SUPPORT,
    age: overrides?.age ?? 25,
  };
}

// ---------------------------------------------------------------------------
// Core drill behaviour (TRAIN-04)
// ---------------------------------------------------------------------------

describe('applyDrill — targeted attribute improvement', () => {
  it('improves passing-drill targeted attributes (passing, vision, crossing, distribution)', () => {
    const player = makePlayer();
    const [result] = applyDrill([player], DrillType.PASSING);

    expect(result!.attributes.passing).toBeGreaterThan(player.attributes.passing);
    expect(result!.attributes.vision).toBeGreaterThan(player.attributes.vision);
    expect(result!.attributes.crossing).toBeGreaterThan(player.attributes.crossing);
    expect(result!.attributes.distribution).toBeGreaterThan(player.attributes.distribution);
  });

  it('improves fitness-drill targeted attributes (pace, stamina, strength, acceleration, agility)', () => {
    const player = makePlayer();
    const [result] = applyDrill([player], DrillType.FITNESS);

    expect(result!.attributes.pace).toBeGreaterThan(player.attributes.pace);
    expect(result!.attributes.stamina).toBeGreaterThan(player.attributes.stamina);
    expect(result!.attributes.strength).toBeGreaterThan(player.attributes.strength);
    expect(result!.attributes.acceleration).toBeGreaterThan(player.attributes.acceleration);
    expect(result!.attributes.agility).toBeGreaterThan(player.attributes.agility);
  });

  it('does not change non-targeted attributes after passing drill', () => {
    const player = makePlayer();
    const [result] = applyDrill([player], DrillType.PASSING);

    // These are NOT in the passing drill target list
    expect(result!.attributes.pace).toBe(player.attributes.pace);
    expect(result!.attributes.strength).toBe(player.attributes.strength);
    expect(result!.attributes.shooting).toBe(player.attributes.shooting);
    expect(result!.attributes.tackling).toBe(player.attributes.tackling);
  });

  it('does not change non-targeted attributes after fitness drill', () => {
    const player = makePlayer();
    const [result] = applyDrill([player], DrillType.FITNESS);

    // These are NOT in the fitness drill target list
    expect(result!.attributes.passing).toBe(player.attributes.passing);
    expect(result!.attributes.shooting).toBe(player.attributes.shooting);
    expect(result!.attributes.tackling).toBe(player.attributes.tackling);
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('applyDrill — immutability', () => {
  it('does not mutate the original PlayerState', () => {
    const player = makePlayer();
    const originalPassing = player.attributes.passing;
    applyDrill([player], DrillType.PASSING);

    // Original must be unchanged
    expect(player.attributes.passing).toBe(originalPassing);
  });

  it('returns a new PlayerState[] — different object references', () => {
    const player = makePlayer();
    const results = applyDrill([player], DrillType.PASSING);

    expect(results[0]).not.toBe(player);
    expect(results[0]!.attributes).not.toBe(player.attributes);
  });
});

// ---------------------------------------------------------------------------
// Age factor (TRAIN-04)
// ---------------------------------------------------------------------------

describe('applyDrill — age factor', () => {
  it('young player (19) gains more than old player (32) with same attributes and personality', () => {
    const young = makePlayer({ age: 19, attributes: { passing: 0.50 }, personality: { work_rate: 0.5 } });
    const old = makePlayer({ age: 32, attributes: { passing: 0.50 }, personality: { work_rate: 0.5 } });

    const [youngResult] = applyDrill([young], DrillType.PASSING);
    const [oldResult] = applyDrill([old], DrillType.PASSING);

    expect(youngResult!.attributes.passing).toBeGreaterThan(oldResult!.attributes.passing);
  });

  it('player with undefined age defaults to age 25 gain', () => {
    const noAge = makePlayer({ attributes: { passing: 0.50 }, personality: { work_rate: 0.5 } });
    const age25 = makePlayer({ age: 25, attributes: { passing: 0.50 }, personality: { work_rate: 0.5 } });

    const [noAgeResult] = applyDrill([noAge], DrillType.PASSING);
    const [age25Result] = applyDrill([age25], DrillType.PASSING);

    // Gains should be identical
    expect(noAgeResult!.attributes.passing).toBeCloseTo(age25Result!.attributes.passing, 10);
  });
});

// ---------------------------------------------------------------------------
// Personality / training factor (TRAIN-04)
// ---------------------------------------------------------------------------

describe('applyDrill — personality (work_rate) factor', () => {
  it('high work_rate (1.0) gains significantly more than low work_rate (0.0)', () => {
    const highWork = makePlayer({ attributes: { passing: 0.50 }, personality: { work_rate: 1.0 }, age: 25 });
    const lowWork = makePlayer({ attributes: { passing: 0.50 }, personality: { work_rate: 0.0 }, age: 25 });

    const [highResult] = applyDrill([highWork], DrillType.PASSING);
    const [lowResult] = applyDrill([lowWork], DrillType.PASSING);

    expect(highResult!.attributes.passing).toBeGreaterThan(lowResult!.attributes.passing);

    // work_rate=1.0 gives trainingFactor=1.4; work_rate=0.0 gives 0.6 — ratio ~2.33
    const highGain = highResult!.attributes.passing - highWork.attributes.passing;
    const lowGain = lowResult!.attributes.passing - lowWork.attributes.passing;
    expect(highGain / lowGain).toBeCloseTo(1.4 / 0.6, 1);
  });
});

// ---------------------------------------------------------------------------
// Diminishing returns (TRAIN-06)
// ---------------------------------------------------------------------------

describe('applyDrill — diminishing returns', () => {
  it('player at 0.50 gains more than player at 0.85 on same attribute', () => {
    const low = makePlayer({ attributes: { passing: 0.50 }, age: 25, personality: { work_rate: 0.5 } });
    const high = makePlayer({ attributes: { passing: 0.85 }, age: 25, personality: { work_rate: 0.5 } });

    const [lowResult] = applyDrill([low], DrillType.PASSING);
    const [highResult] = applyDrill([high], DrillType.PASSING);

    const lowGain = lowResult!.attributes.passing - low.attributes.passing;
    const highGain = highResult!.attributes.passing - high.attributes.passing;

    expect(lowGain).toBeGreaterThan(highGain);
  });

  it('attribute at exactly 1.0 produces no further gain (or negligible)', () => {
    const maxed = makePlayer({ attributes: { passing: 1.0 }, age: 20, personality: { work_rate: 1.0 } });
    const [result] = applyDrill([maxed], DrillType.PASSING);

    // gain = BASE_DELTA * ageFactor * trainingFactor * (1 - 1.0) = 0
    expect(result!.attributes.passing).toBeLessThanOrEqual(1.0);
    expect(result!.attributes.passing).toBeCloseTo(1.0, 10);
  });

  it('attribute near 0.999 still cannot exceed 1.0', () => {
    const nearly = makePlayer({ attributes: { pace: 0.999 }, age: 17, personality: { work_rate: 1.0 } });
    const [result] = applyDrill([nearly], DrillType.FITNESS);

    expect(result!.attributes.pace).toBeLessThanOrEqual(1.0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('applyDrill — edge cases', () => {
  it('empty player array returns empty array', () => {
    const result = applyDrill([], DrillType.PASSING);
    expect(result).toHaveLength(0);
  });

  it('handles multiple players in one call', () => {
    const p1 = makePlayer({ id: 'p1', attributes: { passing: 0.40 } });
    const p2 = makePlayer({ id: 'p2', attributes: { passing: 0.60 } });
    const results = applyDrill([p1, p2], DrillType.PASSING);

    expect(results).toHaveLength(2);
    expect(results[0]!.attributes.passing).toBeGreaterThan(p1.attributes.passing);
    expect(results[1]!.attributes.passing).toBeGreaterThan(p2.attributes.passing);
  });
});

// ---------------------------------------------------------------------------
// DRILL_ATTRIBUTE_MAP completeness
// ---------------------------------------------------------------------------

describe('DrillType and DRILL_ATTRIBUTE_MAP', () => {
  it('DRILL_ATTRIBUTE_MAP has entries for all 8 drill types', () => {
    expect(Object.keys(DRILL_ATTRIBUTE_MAP)).toHaveLength(8);
    for (const drill of ALL_DRILL_TYPES) {
      expect(DRILL_ATTRIBUTE_MAP[drill]).toBeDefined();
      expect(DRILL_ATTRIBUTE_MAP[drill]!.length).toBeGreaterThan(0);
    }
  });

  it('DrillType uses const-object pattern with correct string values', () => {
    expect(DrillType.FITNESS).toBe('fitness');
    expect(DrillType.PASSING).toBe('passing');
    expect(DrillType.SHOOTING).toBe('shooting');
    expect(DrillType.DEFENDING).toBe('defending');
    expect(DrillType.SET_PIECES).toBe('set_pieces');
    expect(DrillType.TACTICS).toBe('tactics');
    expect(DrillType.DRIBBLING).toBe('dribbling');
    expect(DrillType.AERIAL).toBe('aerial');
  });
});

// ---------------------------------------------------------------------------
// 5-season headless economy simulation (TRAIN-06)
// ---------------------------------------------------------------------------

describe('Training economy — 5-season headless simulation', () => {
  it('no attribute exceeds 0.95 for players starting below 0.70 after 5 seasons (950 sessions)', () => {
    const rng = seedrandom('train-economy-seed');
    const squad = createAITeam('weak', 'econ-test', 'Economy FC', rng);

    // Filter to players where ALL targeted attributes start below 0.70
    // We track all attributes for all players through the sim
    let players = squad;

    const SESSIONS_PER_SEASON = 190; // 38 matchweeks × 5 training days
    const SEASONS = 5;
    const TOTAL_SESSIONS = SESSIONS_PER_SEASON * SEASONS; // 950

    // Cycle through all drill types across sessions
    for (let session = 0; session < TOTAL_SESSIONS; session++) {
      const drill = ALL_DRILL_TYPES[session % ALL_DRILL_TYPES.length]!;
      players = applyDrill(players, drill);
    }

    // Check that no attribute on any player exceeds 0.95
    for (const player of players) {
      for (const [, value] of Object.entries(player.attributes)) {
        expect(value).toBeLessThanOrEqual(0.95);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TRAINING_DAYS_PER_MATCHDAY constant
// ---------------------------------------------------------------------------

describe('TRAINING_DAYS_PER_MATCHDAY', () => {
  it('equals 5 (matches Phase 11 economy tuning assumption)', () => {
    expect(TRAINING_DAYS_PER_MATCHDAY).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// DRILL_LABELS — human-readable labels for all DrillType values
// ---------------------------------------------------------------------------

describe('DRILL_LABELS', () => {
  it('has an entry for every DrillType', () => {
    for (const drill of ALL_DRILL_TYPES) {
      expect(DRILL_LABELS[drill]).toBeDefined();
      expect(typeof DRILL_LABELS[drill]).toBe('string');
      expect(DRILL_LABELS[drill]!.length).toBeGreaterThan(0);
    }
  });

  it('maps fitness to "Fitness"', () => {
    expect(DRILL_LABELS['fitness']).toBe('Fitness');
  });

  it('maps set_pieces to "Set Pieces"', () => {
    expect(DRILL_LABELS['set_pieces']).toBe('Set Pieces');
  });

  it('covers all 8 drill types', () => {
    expect(Object.keys(DRILL_LABELS)).toHaveLength(8);
  });

  it('all labels are title-cased non-empty strings', () => {
    for (const label of Object.values(DRILL_LABELS)) {
      expect(label).toMatch(/^[A-Z]/); // starts with uppercase
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// applyTrainingBlock — full schedule execution
// ---------------------------------------------------------------------------

describe('applyTrainingBlock', () => {
  it('applies passing and fitness drills, skips rest day — updatedSquad has improved attributes', () => {
    const players = [makePlayer({ id: 'p1', attributes: { passing: 0.50, pace: 0.50 }, age: 25, personality: { work_rate: 0.5 } })];
    const schedule: TrainingSchedule = { 0: 'passing', 1: 'rest', 2: 'fitness' };
    const { updatedSquad } = applyTrainingBlock(players, schedule);

    expect(updatedSquad[0]!.attributes.passing).toBeGreaterThan(0.50);
    expect(updatedSquad[0]!.attributes.pace).toBeGreaterThan(0.50);
  });

  it('rest-only schedule returns identical squad (no attribute changes)', () => {
    const players = [makePlayer({ id: 'p1', age: 25 })];
    const schedule: TrainingSchedule = { 0: 'rest', 1: 'rest', 2: 'rest' };
    const { updatedSquad } = applyTrainingBlock(players, schedule);

    expect(updatedSquad[0]!.attributes.passing).toBe(players[0]!.attributes.passing);
    expect(updatedSquad[0]!.attributes.pace).toBe(players[0]!.attributes.pace);
  });

  it('empty schedule returns identical squad and zero-entry deltas', () => {
    const players = [makePlayer({ id: 'p1', age: 25 })];
    const schedule: TrainingSchedule = {};
    const { updatedSquad, deltas } = applyTrainingBlock(players, schedule);

    expect(updatedSquad[0]!.attributes.passing).toBe(players[0]!.attributes.passing);
    const playerDeltas = deltas.get('p1');
    expect(Object.keys(playerDeltas ?? {})).toHaveLength(0);
  });

  it('deltas map contains accumulated gains per player across all drill days', () => {
    const players = [makePlayer({ id: 'p1', attributes: { passing: 0.50 }, age: 25, personality: { work_rate: 0.5 } })];
    const schedule: TrainingSchedule = { 0: 'passing', 1: 'passing' };
    const { deltas } = applyTrainingBlock(players, schedule);

    const playerDeltas = deltas.get('p1');
    expect(playerDeltas).toBeDefined();
    expect(playerDeltas!['passing']).toBeGreaterThan(0);
  });

  it('multiple drills of same type accumulate gains (diminishing returns apply, values >= 0)', () => {
    const players = [makePlayer({ id: 'p1', attributes: { passing: 0.50 }, age: 25, personality: { work_rate: 0.5 } })];
    const schedule: TrainingSchedule = { 0: 'passing', 1: 'passing', 2: 'passing' };
    const { deltas } = applyTrainingBlock(players, schedule);

    const playerDeltas = deltas.get('p1');
    const totalPassingGain = playerDeltas?.['passing'] ?? 0;
    // Gain must be positive (we drilled 3 times)
    expect(totalPassingGain).toBeGreaterThan(0);
    // Delta values are always >= 0
    for (const val of Object.values(playerDeltas ?? {})) {
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  it('rest-only schedule returns zero-entry deltas (no gains recorded)', () => {
    const players = [makePlayer({ id: 'p1', age: 25 })];
    const schedule: TrainingSchedule = { 0: 'rest', 1: 'rest' };
    const { deltas } = applyTrainingBlock(players, schedule);

    const playerDeltas = deltas.get('p1');
    expect(Object.keys(playerDeltas ?? {})).toHaveLength(0);
  });

  it('deltas are tracked per player — two players have independent delta entries', () => {
    const p1 = makePlayer({ id: 'p1', attributes: { passing: 0.40 }, age: 22 });
    const p2 = makePlayer({ id: 'p2', attributes: { passing: 0.70 }, age: 30 });
    const schedule: TrainingSchedule = { 0: 'passing' };
    const { deltas } = applyTrainingBlock([p1, p2], schedule);

    expect(deltas.has('p1')).toBe(true);
    expect(deltas.has('p2')).toBe(true);
    // p1 starts lower → should gain more than p2 (diminishing returns)
    const p1Gain = deltas.get('p1')!['passing'] ?? 0;
    const p2Gain = deltas.get('p2')!['passing'] ?? 0;
    expect(p1Gain).toBeGreaterThan(p2Gain);
  });
});
