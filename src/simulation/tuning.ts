/**
 * Live-tuneable parameters for the simulation engine.
 * All values are mutable — the settings panel writes directly to this object
 * and the engine/actions read from it every tick.
 */
export const TUNING = {
  // ── Agent decisions ─────────────────────────────────────────────────
  /** Bonus added to previous action score to prevent flip-flopping */
  hysteresisBonus: 0.36,
  /** Flat bonus added to PASS_FORWARD and PASS_SAFE scores. Higher = more passing */
  passBias: 0.15,
  /** Proximity-scaled bonus for SHOOT and DRIBBLE near opponent goal. Higher = more direct attacking */
  goalUrgency: 0.35,
  /** Gaussian noise scale — multiplied by (1 - composure) */
  noiseScale: 0.06,

  // ── MOVE_TO_POSITION curve ──────────────────────────────────────────
  /** Score at 0m drift ("hold position" strength). Higher = harder to lure away */
  moveToPosIntercept: 0.04,
  /** Score slope per normalised distance. Controls urgency to return */
  moveToPosSlope: 0.65,

  // ── PRESS curve ─────────────────────────────────────────────────────
  /** Exponential decay rate. Higher = only very close players press */
  pressDecayK: 2.1,
  /** Distance normalization (metres). Higher = pressing reaches further */
  pressNorm: 25,
  /** Press rank decay — score multiplied by this^(closerTeammates). Lower = fewer pressers */
  pressRankDecay: 0.3,
  /** Multiplier for pressNorm when ball is loose (no carrier). Higher = chase from further */
  looseBallPressBoost: 2.6,

  // ── Ball control ────────────────────────────────────────────────────
  /** How close (metres) a player must be to pick up a loose ball */
  controlRadius: 2.5,
  /** Ticks a player must hold the ball before they can kick (pass/shoot) again */
  kickLockoutTicks: 15,
  /** Pass kick speed (m/s) */
  passSpeed: 24,
  /** Shot kick speed (m/s) */
  shootSpeed: 22,

  // ── Movement ────────────────────────────────────────────────────────
  /** Minimum distance between players before separation force kicks in */
  separationRadius: 2.8,
  /** Separation force multiplier */
  separationScale: 2.2,
  /** Base player speed (m/s) — multiplied by pace attribute */
  playerBaseSpeed: 8.0,
  /** Dribble speed as fraction of max speed */
  dribbleSpeedRatio: 0.7,

  // ── Off-ball movement ─────────────────────────────────────────────
  /** How strongly off-ball teammates pull toward the ball carrier when in possession (0-1) */
  supportPull: 0.25,
};

/** Type for the tuning config — used by the settings panel */
export type TuningConfig = typeof TUNING;
