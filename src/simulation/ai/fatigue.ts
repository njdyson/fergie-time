import type { PersonalityVector, PlayerAttributes } from '../types.ts';

// ---------------------------------------------------------------------------
// Conservative defaults — where personality erodes toward under fatigue
// ---------------------------------------------------------------------------

/**
 * The conservative personality vector that fatigued players trend toward.
 * Represents cautious, low-risk, low-energy decision-making under physical stress.
 * Source: plan spec design values.
 */
export const CONSERVATIVE_DEFAULTS: PersonalityVector = {
  directness: 0.3,
  risk_appetite: 0.2,
  composure: 0.4,
  creativity: 0.3,
  work_rate: 0.3,
  aggression: 0.3,
  anticipation: 0.5,
  flair: 0.2,
} as const;

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/**
 * Physical attribute attenuation at fatigue=1.0.
 * At full fatigue, physical attributes (pace, strength, stamina) are reduced by 50%.
 * Formula: effectiveAttr = baseAttr * (1 - fatigue * ATTENUATION_FACTOR)
 */
export const ATTENUATION_FACTOR = 0.5;

/**
 * Maximum fraction of personality erosion at fatigue=1.0.
 * At full fatigue, each personality trait is shifted 60% of the way toward its
 * conservative default. A maverick with directness=0.9 → effective 0.54.
 * Formula: lerp(base, conservative, fatigue * EROSION_FACTOR)
 */
export const EROSION_FACTOR = 0.6;

// ---------------------------------------------------------------------------
// Fatigue accumulation — glycogen-depletion curve
// ---------------------------------------------------------------------------

/**
 * Accumulates fatigue for a single simulation tick.
 *
 * Design:
 * - Gradual rate (baseRate = 0.004 per match-minute) for the first 60 minutes
 * - Steep rate (baseRate = 0.012 per match-minute) after 60 minutes
 * - staminaMod = 1.5 - stamina → stamina=1.0 → 0.5x rate; stamina=0.0 → 1.5x rate
 * - workRateMod = 0.8 + workRate * 0.4 → work_rate=1.0 → 1.2x rate
 * - dt in milliseconds; divide by 1000 to convert to seconds, divide by 60 for per-minute rate
 *
 * @param currentFatigue - Current fatigue value [0..1]
 * @param tick - Current tick number (1 tick = 1 match-second)
 * @param stamina - Player stamina attribute [0..1]
 * @param workRate - Player work_rate personality trait [0..1]
 * @param dt - Elapsed time in milliseconds for this tick
 * @returns New fatigue value clamped to [0, 1]
 */
export function accumulateFatigue(
  currentFatigue: number,
  tick: number,
  stamina: number,
  workRate: number,
  dt: number
): number {
  // Determine base rate by match phase
  // 60 match-minutes = 3600 ticks (1 tick = 1 match-second)
  const matchMinute = tick / 60;
  const baseRate = matchMinute < 60 ? 0.004 : 0.012;

  // Stamina modifier: high stamina → slower fatigue
  const staminaMod = 1.5 - stamina;

  // Work rate modifier: high work rate → faster fatigue
  const workRateMod = 0.8 + workRate * 0.4;

  // dt is in ms; divide by 1000 for seconds, divide by 60 for per-minute units
  const dtMinutes = dt / 1000 / 60;

  const delta = baseRate * staminaMod * workRateMod * dtMinutes;
  return Math.max(0, Math.min(1, currentFatigue + delta));
}

// ---------------------------------------------------------------------------
// Attribute attenuation
// ---------------------------------------------------------------------------

/**
 * Applies fatigue penalties to a player's attributes.
 *
 * Physical attributes (pace, strength, stamina) are penalised by ATTENUATION_FACTOR * fatigue.
 * Technical attributes (dribbling, passing, shooting, tackling, aerial, positioning)
 * suffer a milder penalty (0.2 * fatigue) — fatigue makes you slow, not unskilled,
 * but tired players do miscontrol slightly.
 *
 * @param base - Base (unmodified) attributes
 * @param fatigue - Current fatigue level [0..1]
 * @returns New PlayerAttributes with effective values (immutable)
 */
export function applyFatigueToAttributes(
  base: PlayerAttributes,
  fatigue: number
): PlayerAttributes {
  const physFactor = 1 - fatigue * ATTENUATION_FACTOR;   // 0.5 at full fatigue
  const techFactor = 1 - fatigue * 0.2;                  // 0.2 at full fatigue

  return {
    // Physical attributes
    pace: base.pace * physFactor,
    strength: base.strength * physFactor,
    stamina: base.stamina * physFactor,
    // Technical attributes
    dribbling: base.dribbling * techFactor,
    passing: base.passing * techFactor,
    shooting: base.shooting * techFactor,
    tackling: base.tackling * techFactor,
    aerial: base.aerial * techFactor,
    positioning: base.positioning * techFactor,
  };
}

// ---------------------------------------------------------------------------
// Personality erosion
// ---------------------------------------------------------------------------

/**
 * Linear interpolation helper.
 */
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * Applies fatigue-driven personality erosion.
 *
 * Each trait is interpolated toward CONSERVATIVE_DEFAULTS by (fatigue * EROSION_FACTOR).
 * At fatigue=1.0 with EROSION_FACTOR=0.6: traits shift 60% toward conservative defaults.
 * Erosion is computed from the base values each tick — it is NOT cumulative.
 *
 * @param base - The player's base personality vector
 * @param fatigue - Current fatigue level [0..1]
 * @returns New PersonalityVector with eroded traits (immutable)
 */
export function applyFatigueToPersonality(
  base: PersonalityVector,
  fatigue: number
): PersonalityVector {
  const t = fatigue * EROSION_FACTOR;

  return {
    directness: lerp(base.directness, CONSERVATIVE_DEFAULTS.directness, t),
    risk_appetite: lerp(base.risk_appetite, CONSERVATIVE_DEFAULTS.risk_appetite, t),
    composure: lerp(base.composure, CONSERVATIVE_DEFAULTS.composure, t),
    creativity: lerp(base.creativity, CONSERVATIVE_DEFAULTS.creativity, t),
    work_rate: lerp(base.work_rate, CONSERVATIVE_DEFAULTS.work_rate, t),
    aggression: lerp(base.aggression, CONSERVATIVE_DEFAULTS.aggression, t),
    anticipation: lerp(base.anticipation, CONSERVATIVE_DEFAULTS.anticipation, t),
    flair: lerp(base.flair, CONSERVATIVE_DEFAULTS.flair, t),
  };
}
