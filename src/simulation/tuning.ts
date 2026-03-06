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
  passBias: 0.25,
  /** Proximity-scaled bonus for SHOOT and DRIBBLE near opponent goal. Higher = more direct attacking */
  goalUrgency: 0.45,
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
  controlRadius: 2.0,
  /** Ticks a player must hold the ball before they can kick (pass/shoot) again */
  kickLockoutTicks: 8,
  /** Per-tick XY velocity multiplier when ball is on the ground (0.975 ≈ ~32m range at 24 m/s) */
  ballGroundFriction: 0.962,
  /** Per-tick XY velocity multiplier when ball is airborne */
  ballAirDrag: 0.994,
  /** Pass kick speed (m/s) */
  passSpeed: 24,
  /** Lead-pass factor: fraction of receiver's travel distance to aim ahead (0=feet, 1=full lead) */
  passLeadFactor: 0.75,
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

  // ── Smooth adoption ──────────────────────────────────────────────
  /** Ticks over which anchors lerp to new positions after tactical change (~4s at 30 ticks/sec) */
  adoptionTicks: 120,

  // ── Dead ball pauses ────────────────────────────────────────────
  /** Ticks to pause for kickoff repositioning (~1.5s at 30 ticks/sec) */
  kickoffPauseTicks: 75,
  /** Ticks to pause for throw-in (~0.8s) */
  throwInPauseTicks: 25,
  /** Ticks to pause for corner kick (~1.2s) */
  cornerPauseTicks: 55,
  /** Ticks to pause for goal kick (~0.8s) */
  goalKickPauseTicks: 25,
  /** Ticks to pause for a free kick (~1.3s) */
  freeKickPauseTicks: 40,

  // ── Vision system ───────────────────────────────────────────────────
  /** Max teammate perception radius (metres) at vision=1.0 */
  teammateVisionRadiusMax: 58,
  /** Min teammate perception radius (metres) at vision=0.0 */
  teammateVisionRadiusMin: 30,
  /** Dot-product threshold for teammate blind spot */
  teammateVisionBlindSpotDot: -0.45,
  /** Max opponent perception radius (metres) at vision=1.0 */
  opponentVisionRadiusMax: 42,
  /** Min opponent perception radius (metres) at vision=0.0 */
  opponentVisionRadiusMin: 24,
  /** Dot-product threshold for opponent blind spot */
  opponentVisionBlindSpotDot: -0.15,
  /** Close range (metres) — always perceived regardless of facing */
  visionCloseRange: 9,
  /** Max ticks between vision refreshes (low anticipation) */
  visionRefreshMaxInterval: 6,
  /** Anticipation threshold for every-tick vision refresh */
  visionAnticipationHighThreshold: 0.85,
  /** Anticipation threshold for max-interval vision refresh */
  visionAnticipationLowThreshold: 0.3,

  // ── CSP (Candidate Space Points) off-ball movement ─────────────────
  /** CSP distance ring 1 (metres from player) */
  cspDist1: 10,
  /** CSP distance ring 2 (metres from player) */
  cspDist2: 20,
  /** CSP distance ring 3 (metres from player) */
  cspDist3: 30,
  /** Angular spread (radians) — half-cone from forward direction */
  cspAngleSpread: Math.PI / 4,
  /** Number of angle samples per distance ring */
  cspAnglesPerRing: 4,
  /** Max distance (metres) to consider a defender part of a seam */
  cspSeamMaxDefenderDist: 25,
  /** Max distance (metres) from midpoint to count as a seam */
  cspSeamMidpointThreshold: 3,
  /** Score bonus for finding a seam between defenders */
  cspSeamBonus: 1.5,
  /** Min safe distance (metres) from nearest defender */
  cspDefenderSafeDistance: 6,
  /** Penalty weight for being too close to a defender */
  cspDefenderPenaltyWeight: 0.8,
  /** Radius (metres) for teammate avoidance */
  cspTeammateAvoidRadius: 12,
  /** Penalty weight for nearby teammates */
  cspTeammateAvoidWeight: 1.0,
  /** Score bonus per metre of forward progress toward opponent goal */
  cspForwardProgressWeight: 0.04,
  /** Weight for passing lane clearance in CSP scoring */
  cspPassingLaneWeight: 0.6,
  /** Blend factor for CSP nudge on MOVE_TO_POSITION (0-1) */
  cspSupportInfluence: 0.15,
};

/** Type for the tuning config — used by the settings panel */
export type TuningConfig = typeof TUNING;
