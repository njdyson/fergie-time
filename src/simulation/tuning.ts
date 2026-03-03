/**
 * Live-tuneable parameters for the simulation engine.
 * All values are mutable — the settings panel writes directly to this object
 * and the engine/actions read from it every tick.
 */
export const TUNING = {
  // ── Agent decisions ─────────────────────────────────────────────────
  /** Bonus added to previous action score to prevent flip-flopping */
  hysteresisBonus: 0.12,
  /** Gaussian noise scale — multiplied by (1 - composure) */
  noiseScale: 0.12,

  // ── MOVE_TO_POSITION curve ──────────────────────────────────────────
  /** Score at 0m drift ("hold position" strength). Higher = harder to lure away */
  moveToPosIntercept: 0.25,
  /** Score slope per normalised distance. Controls urgency to return */
  moveToPosSlope: 0.65,

  // ── PRESS curve ─────────────────────────────────────────────────────
  /** Exponential decay rate. Higher = only very close players press */
  pressDecayK: 2.5,
  /** Distance normalization (metres). Higher = pressing reaches further */
  pressNorm: 25,
  /** Press rank decay — score multiplied by this^(closerTeammates). Lower = fewer pressers */
  pressRankDecay: 0.3,

  // ── Ball control ────────────────────────────────────────────────────
  /** How close (metres) a player must be to pick up a loose ball */
  controlRadius: 2.5,
  /** Pass kick speed (m/s) */
  passSpeed: 14.0,
  /** Shot kick speed (m/s) */
  shootSpeed: 22.0,

  // ── Movement ────────────────────────────────────────────────────────
  /** Minimum distance between players before separation force kicks in */
  separationRadius: 2.0,
  /** Separation force multiplier */
  separationScale: 0.5,
  /** Base player speed (m/s) — multiplied by pace attribute */
  playerBaseSpeed: 8.0,
  /** Dribble speed as fraction of max speed */
  dribbleSpeedRatio: 0.7,
};

/** Type for the tuning config — used by the settings panel */
export type TuningConfig = typeof TUNING;
