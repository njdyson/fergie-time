import type { SimSnapshot, PlayerState, PlayerAttributes, BallState, ActionIntent, AgentContext, TeamId, FormationId, Role, Duty, DeadBallInfo, PlayerTacticalMultipliers, TeamControls, PressConfig, TransitionConfig } from './types.ts';
import { Vec2 } from './math/vec2.ts';
import { createRng } from './math/random.ts';
import { integrateBall } from './physics/ball.ts';
import { advancePhase } from './match/phases.ts';
import { checkGoal, createInitialSnapshot, applyGoal, getKickoffPositions, PITCH_WIDTH, PITCH_HEIGHT } from './match/state.ts';
import { MatchPhase, ActionType, RestartType, defaultPlayerMultipliers, defaultTeamControls, defaultPressConfig, defaultTransitionConfig } from './types.ts';
import { ACTIONS } from './ai/actions.ts';
import { selectAction, evaluateAction } from './ai/agent.ts';
import { PERSONALITY_WEIGHTS } from './ai/personality.ts';
import { accumulateFatigue, applyFatigueToAttributes, applyFatigueToPersonality } from './ai/fatigue.ts';
import { SpatialGrid } from './physics/spatial.ts';
import { seek, arrive, separation, clampVelocity } from './physics/steering.ts';
import { resolveTackle, isShielded } from './physics/contact.ts';
import { computeFormationAnchors, computeDefensiveLine } from './tactical/formation.ts';
import { getDutyWeightModifier } from './tactical/roles.ts';
import { StatsAccumulator } from './match/stats.ts';
import { DecisionLog } from './ai/decisionLog.ts';
import type { AgentDecisionEntry } from './ai/decisionLog.ts';
import { GameEventLog } from './match/gameLog.ts';

// ============================================================
// TacticalConfig
// ============================================================

/**
 * Tactical configuration for one team.
 * Controls formation shape, role assignments, duty levels, and V1 tactical levers.
 */
export interface TacticalConfig {
  /** Formation identifier or custom Vec2[] positions */
  readonly formation: FormationId | Vec2[];
  /** Role label for each of the 11 players (index-aligned with roster order) */
  readonly roles: Role[];
  /** Duty level for each of the 11 players (index-aligned with roster order) */
  readonly duties: Duty[];
  /** Per-player tactical instruction multipliers (V1 overhaul) */
  readonly multipliers?: PlayerTacticalMultipliers[];
  /** Team-level structure controls (V1 overhaul) */
  readonly teamControls?: TeamControls;
  /** Pressing configuration (V1 overhaul) */
  readonly press?: PressConfig;
  /** Transition behaviour config (V1 overhaul) */
  readonly transitions?: TransitionConfig;
}

/** Default tactical config: 4-4-2 with SUPPORT duties and neutral multipliers */
const DEFAULT_TACTICAL_CONFIG: TacticalConfig = {
  formation: '4-4-2',
  roles: ['GK', 'LB', 'CB', 'CB', 'RB', 'LW', 'CM', 'CM', 'RW', 'ST', 'ST'],
  duties: ['SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT'],
  multipliers: defaultPlayerMultipliers(),
  teamControls: defaultTeamControls(),
  press: defaultPressConfig(),
  transitions: defaultTransitionConfig(),
};

// ============================================================
// MatchConfig
// ============================================================

export interface MatchConfig {
  readonly seed: string;
  readonly homeRoster: PlayerState[];
  readonly awayRoster: PlayerState[];
  /** Optional bench players for home team (up to 5, not on pitch initially) */
  readonly homeBench?: PlayerState[];
  /** Optional bench players for away team (up to 5, not on pitch initially) */
  readonly awayBench?: PlayerState[];
  /** Optional initial ball velocity (m/s) for testing and visual initialization */
  readonly initialBallVelocity?: { x: number; y: number };
  /** Optional initial ball position override for testing */
  readonly initialBallPosition?: { x: number; y: number };
  /** Optional tactical configuration for home team (defaults to 4-4-2 SUPPORT) */
  readonly homeTacticalConfig?: TacticalConfig;
  /** Optional tactical configuration for away team (defaults to 4-4-2 SUPPORT) */
  readonly awayTacticalConfig?: TacticalConfig;
  /** Optional out-of-possession tactical config for home team (defaults to in-possession config) */
  readonly homeTacticalConfigOOP?: TacticalConfig;
  /** Optional out-of-possession tactical config for away team (defaults to in-possession config) */
  readonly awayTacticalConfigOOP?: TacticalConfig;
  /** Optional defensive transition config for home team (multipliers used during counter-press window) */
  readonly homeTacticalConfigDefTrans?: TacticalConfig;
  /** Optional attacking transition config for home team (multipliers used during counter-attack window) */
  readonly homeTacticalConfigAttTrans?: TacticalConfig;
}

import { TUNING } from './tuning.ts';


// ============================================================
// createTestRosters
// ============================================================

const DEFAULT_ATTRIBUTES = {
  pace: 0.7,
  strength: 0.6,
  stamina: 0.7,
  dribbling: 0.6,
  passing: 0.65,
  shooting: 0.6,
  tackling: 0.6,
  aerial: 0.6,
  positioning: 0.65,
  vision: 0.65,
} as const;

const DEFAULT_PERSONALITY = {
  directness: 0.5,
  risk_appetite: 0.5,
  composure: 0.6,
  creativity: 0.5,
  work_rate: 0.7,
  aggression: 0.5,
  anticipation: 0.6,
  flair: 0.4,
} as const;

const ROLES = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LW', 'RW', 'ST', 'ST'] as const;

/**
 * Creates 22 test players in a 4-4-2 formation for both teams.
 * Used in tests and for the initial visual rendering before real rosters are loaded.
 */
export function createTestRosters(): { home: PlayerState[]; away: PlayerState[] } {
  const homePositions = getKickoffPositions('home');
  const awayPositions = getKickoffPositions('away');

  const home: PlayerState[] = homePositions.map((pos, i) => ({
    id: `home-${i}`,
    teamId: 'home' as TeamId,
    position: pos,
    velocity: Vec2.zero(),
    attributes: { ...DEFAULT_ATTRIBUTES },
    personality: { ...DEFAULT_PERSONALITY },
    fatigue: 0,
    role: ROLES[i] ?? 'CM',
    duty: 'SUPPORT' as const,
    formationAnchor: pos,
  }));

  const away: PlayerState[] = awayPositions.map((pos, i) => ({
    id: `away-${i}`,
    teamId: 'away' as TeamId,
    position: pos,
    velocity: Vec2.zero(),
    attributes: { ...DEFAULT_ATTRIBUTES },
    personality: { ...DEFAULT_PERSONALITY },
    fatigue: 0,
    role: ROLES[i] ?? 'CM',
    duty: 'SUPPORT' as const,
    formationAnchor: pos,
  }));

  return { home, away };
}

/**
 * Apply per-player randomisation to archetype attributes.
 * Each attribute is jittered by ±spread (default ±0.08), clamped to [0.1, 0.98].
 * Uses a simple seeded-ish approach via the provided rng function.
 */
function jitterAttributes(
  base: PlayerAttributes,
  rng: () => number,
  spread = 0.08,
): PlayerAttributes {
  const j = (v: number) => Math.min(0.98, Math.max(0.1, v + (rng() - 0.5) * 2 * spread));
  return {
    pace: j(base.pace),
    strength: j(base.strength),
    stamina: j(base.stamina),
    dribbling: j(base.dribbling),
    passing: j(base.passing),
    shooting: j(base.shooting),
    tackling: j(base.tackling),
    aerial: j(base.aerial),
    positioning: j(base.positioning),
    vision: j(base.vision),
  };
}

/**
 * Creates 32 players (11 starters + 5 bench per team) with varied archetypes for an interesting match.
 * Home team: maverick striker, metronome midfielder, aggressive defender + 5 bench players.
 * Away team: contrasting archetypes for visible behavioral differences + 5 bench players.
 * Each player's attributes are individually randomised around their archetype base (±0.08).
 *
 * Returns: { home, away, homeBench, awayBench }
 */
export function createMatchRosters(): {
  home: PlayerState[];
  away: PlayerState[];
  homeBench: PlayerState[];
  awayBench: PlayerState[];
} {
  const homePositions = getKickoffPositions('home');
  const awayPositions = getKickoffPositions('away');

  // Archetype definitions
  const archetypes = {
    aggressiveDefender: {
      attributes: { pace: 0.65, strength: 0.80, stamina: 0.75, dribbling: 0.45, passing: 0.60, shooting: 0.45, tackling: 0.82, aerial: 0.78, positioning: 0.70, vision: 0.60 },
      personality: { directness: 0.35, risk_appetite: 0.3, composure: 0.55, creativity: 0.3, work_rate: 0.85, aggression: 0.85, anticipation: 0.75, flair: 0.25 },
    },
    steadyDefender: {
      attributes: { pace: 0.60, strength: 0.72, stamina: 0.70, dribbling: 0.50, passing: 0.65, shooting: 0.40, tackling: 0.75, aerial: 0.72, positioning: 0.72, vision: 0.65 },
      personality: { directness: 0.4, risk_appetite: 0.25, composure: 0.70, creativity: 0.3, work_rate: 0.70, aggression: 0.60, anticipation: 0.70, flair: 0.2 },
    },
    metronome: {
      attributes: { pace: 0.65, strength: 0.62, stamina: 0.78, dribbling: 0.65, passing: 0.85, shooting: 0.55, tackling: 0.65, aerial: 0.58, positioning: 0.80, vision: 0.85 },
      personality: { directness: 0.45, risk_appetite: 0.35, composure: 0.90, creativity: 0.55, work_rate: 0.80, aggression: 0.40, anticipation: 0.82, flair: 0.35 },
    },
    boxToBox: {
      attributes: { pace: 0.75, strength: 0.68, stamina: 0.85, dribbling: 0.62, passing: 0.72, shooting: 0.60, tackling: 0.70, aerial: 0.65, positioning: 0.72, vision: 0.68 },
      personality: { directness: 0.62, risk_appetite: 0.52, composure: 0.65, creativity: 0.45, work_rate: 0.90, aggression: 0.68, anticipation: 0.70, flair: 0.42 },
    },
    maverick: {
      attributes: { pace: 0.88, strength: 0.55, stamina: 0.70, dribbling: 0.88, passing: 0.68, shooting: 0.82, tackling: 0.38, aerial: 0.55, positioning: 0.70, vision: 0.72 },
      personality: { directness: 0.88, risk_appetite: 0.85, composure: 0.50, creativity: 0.90, work_rate: 0.58, aggression: 0.55, anticipation: 0.65, flair: 0.92 },
    },
    poacher: {
      attributes: { pace: 0.82, strength: 0.62, stamina: 0.68, dribbling: 0.70, passing: 0.55, shooting: 0.88, tackling: 0.35, aerial: 0.72, positioning: 0.85, vision: 0.75 },
      personality: { directness: 0.82, risk_appetite: 0.78, composure: 0.72, creativity: 0.52, work_rate: 0.65, aggression: 0.65, anticipation: 0.80, flair: 0.65 },
    },
    goalKeeper: {
      attributes: { pace: 0.55, strength: 0.72, stamina: 0.72, dribbling: 0.42, passing: 0.62, shooting: 0.35, tackling: 0.50, aerial: 0.82, positioning: 0.85, vision: 0.80 },
      personality: { directness: 0.30, risk_appetite: 0.20, composure: 0.82, creativity: 0.30, work_rate: 0.70, aggression: 0.40, anticipation: 0.85, flair: 0.20 },
    },
    technician: {
      attributes: { pace: 0.72, strength: 0.55, stamina: 0.72, dribbling: 0.80, passing: 0.78, shooting: 0.62, tackling: 0.55, aerial: 0.52, positioning: 0.75, vision: 0.78 },
      personality: { directness: 0.58, risk_appetite: 0.65, composure: 0.72, creativity: 0.80, work_rate: 0.70, aggression: 0.42, anticipation: 0.72, flair: 0.72 },
    },
    // Bench archetypes
    utilityDefender: {
      attributes: { pace: 0.62, strength: 0.70, stamina: 0.68, dribbling: 0.48, passing: 0.62, shooting: 0.42, tackling: 0.72, aerial: 0.70, positioning: 0.68, vision: 0.62 },
      personality: { directness: 0.38, risk_appetite: 0.28, composure: 0.65, creativity: 0.32, work_rate: 0.72, aggression: 0.65, anticipation: 0.68, flair: 0.22 },
    },
    youngProspect: {
      attributes: { pace: 0.85, strength: 0.50, stamina: 0.80, dribbling: 0.72, passing: 0.62, shooting: 0.65, tackling: 0.50, aerial: 0.52, positioning: 0.62, vision: 0.58 },
      personality: { directness: 0.70, risk_appetite: 0.72, composure: 0.42, creativity: 0.68, work_rate: 0.85, aggression: 0.55, anticipation: 0.58, flair: 0.78 },
    },
    targetMan: {
      attributes: { pace: 0.62, strength: 0.88, stamina: 0.70, dribbling: 0.52, passing: 0.58, shooting: 0.78, tackling: 0.42, aerial: 0.92, positioning: 0.78, vision: 0.60 },
      personality: { directness: 0.78, risk_appetite: 0.62, composure: 0.68, creativity: 0.38, work_rate: 0.72, aggression: 0.78, anticipation: 0.72, flair: 0.42 },
    },
    playmaker: {
      attributes: { pace: 0.68, strength: 0.55, stamina: 0.75, dribbling: 0.75, passing: 0.90, shooting: 0.58, tackling: 0.58, aerial: 0.50, positioning: 0.82, vision: 0.90 },
      personality: { directness: 0.42, risk_appetite: 0.45, composure: 0.88, creativity: 0.88, work_rate: 0.75, aggression: 0.38, anticipation: 0.85, flair: 0.65 },
    },
    speedster: {
      attributes: { pace: 0.95, strength: 0.50, stamina: 0.78, dribbling: 0.78, passing: 0.62, shooting: 0.72, tackling: 0.42, aerial: 0.48, positioning: 0.70, vision: 0.62 },
      personality: { directness: 0.88, risk_appetite: 0.80, composure: 0.52, creativity: 0.58, work_rate: 0.72, aggression: 0.58, anticipation: 0.65, flair: 0.75 },
    },
  };

  // Home team: GK, LB, CB, CB, RB, LW, CM, CM, RW, ST, ST
  const homeArchetypes = [
    archetypes.goalKeeper,    // GK
    archetypes.aggressiveDefender, // LB
    archetypes.steadyDefender,    // CB
    archetypes.steadyDefender,    // CB
    archetypes.aggressiveDefender, // RB
    archetypes.technician,        // LW
    archetypes.metronome,         // CM
    archetypes.boxToBox,          // CM
    archetypes.technician,        // RW
    archetypes.maverick,          // ST
    archetypes.poacher,           // ST
  ];

  const awayArchetypes = [
    archetypes.goalKeeper,         // GK
    archetypes.steadyDefender,     // LB
    archetypes.aggressiveDefender, // CB
    archetypes.aggressiveDefender, // CB
    archetypes.steadyDefender,     // RB
    archetypes.boxToBox,           // LW
    archetypes.metronome,          // CM
    archetypes.technician,         // CM
    archetypes.boxToBox,           // RW
    archetypes.poacher,            // ST
    archetypes.maverick,           // ST
  ];

  // Bench archetypes (5 per team)
  const homeBenchArchetypes = [
    archetypes.utilityDefender, // utility CB/FB
    archetypes.youngProspect,   // young winger/forward
    archetypes.targetMan,       // target striker
    archetypes.playmaker,       // creative mid
    archetypes.speedster,       // pace winger
  ];

  const awayBenchArchetypes = [
    archetypes.utilityDefender, // utility CB/FB
    archetypes.speedster,       // pace winger
    archetypes.targetMan,       // target striker
    archetypes.youngProspect,   // young winger/forward
    archetypes.playmaker,       // creative mid
  ];

  const roleLabels = ['GK', 'LB', 'CB', 'CB', 'RB', 'LW', 'CM', 'CM', 'RW', 'ST', 'ST'];
  const names = ['Home GK', 'Home LB', 'Home CB', 'Home CB', 'Home RB', 'Home LW', 'Home CM', 'Home CM', 'Home RW', 'Home ST', 'Home ST'];
  const awayNames = ['Away GK', 'Away LB', 'Away CB', 'Away CB', 'Away RB', 'Away LW', 'Away CM', 'Away CM', 'Away RW', 'Away ST', 'Away ST'];
  const benchRoleLabels = ['CB', 'LW', 'ST', 'CM', 'RW'];
  const homeBenchNames = ['H. Utility', 'H. Prospect', 'H. Target', 'H. Playmaker', 'H. Speedster'];
  const awayBenchNames = ['A. Utility', 'A. Speedster', 'A. Target', 'A. Prospect', 'A. Playmaker'];

  // Use a central midfield position as a generic "bench" position
  const benchPosition = new Vec2(52.5, 34); // Centre circle

  // Simple RNG for per-player attribute jitter
  const rng = () => Math.random();

  const home: PlayerState[] = homePositions.map((pos, i) => ({
    id: `home-${i}`,
    teamId: 'home' as TeamId,
    position: pos,
    velocity: Vec2.zero(),
    attributes: jitterAttributes(homeArchetypes[i]!.attributes, rng),
    personality: { ...homeArchetypes[i]!.personality },
    fatigue: 0,
    role: roleLabels[i] ?? 'CM',
    duty: 'SUPPORT' as const,
    formationAnchor: pos,
    name: names[i],
  } as PlayerState));

  const away: PlayerState[] = awayPositions.map((pos, i) => ({
    id: `away-${i}`,
    teamId: 'away' as TeamId,
    position: pos,
    velocity: Vec2.zero(),
    attributes: jitterAttributes(awayArchetypes[i]!.attributes, rng),
    personality: { ...awayArchetypes[i]!.personality },
    fatigue: 0,
    role: roleLabels[i] ?? 'CM',
    duty: 'SUPPORT' as const,
    formationAnchor: pos,
    name: awayNames[i],
  } as PlayerState));

  // Bench players (not on pitch, stored separately)
  const homeBench: PlayerState[] = homeBenchArchetypes.map((arch, i) => ({
    id: `home-bench-${i}`,
    teamId: 'home' as TeamId,
    position: benchPosition,
    velocity: Vec2.zero(),
    attributes: jitterAttributes(arch.attributes, rng),
    personality: { ...arch.personality },
    fatigue: 0,
    role: benchRoleLabels[i] ?? 'CM',
    duty: 'SUPPORT' as const,
    formationAnchor: benchPosition,
    name: homeBenchNames[i],
  } as PlayerState));

  const awayBench: PlayerState[] = awayBenchArchetypes.map((arch, i) => ({
    id: `away-bench-${i}`,
    teamId: 'away' as TeamId,
    position: benchPosition,
    velocity: Vec2.zero(),
    attributes: jitterAttributes(arch.attributes, rng),
    personality: { ...arch.personality },
    fatigue: 0,
    role: benchRoleLabels[i] ?? 'CM',
    duty: 'SUPPORT' as const,
    formationAnchor: benchPosition,
    name: awayBenchNames[i],
  } as PlayerState));

  return { home, away, homeBench, awayBench };
}

// ============================================================
// SimulationEngine
// ============================================================

/**
 * The central simulation engine.
 *
 * Each call to tick(dt) produces a new immutable SimSnapshot with all subsystems integrated:
 *   1. Advance match phase
 *   2. If HALFTIME or FULL_TIME → skip physics/AI
 *   3. Accumulate fatigue for all players
 *   4. Compute effective attributes/personality (fatigue-modified)
 *   5. Update spatial grid with current positions
 *   6. Compute formation anchors
 *   7. Build AgentContext for each player
 *   8. Run selectAction for each player
 *   9. Log all agent decisions
 *  10. Resolve action intents (movement + ball control + contact)
 *  11. Apply separation forces
 *  12. Integrate ball physics
 *  13. Check for goals
 *  14. Accumulate match statistics
 *  15. Produce new SimSnapshot
 */
/** Engine-internal dead ball state for restarts (kickoffs, throw-ins, corners, goal kicks). */
interface DeadBallState {
  readonly type: RestartType;
  readonly position: Vec2;          // where the ball is placed for restart
  readonly teamId: TeamId;          // team that takes the restart
  readonly tickStarted: number;     // tick when dead ball began
  readonly repositionTicks: number; // ticks to wait before play resumes
  readonly takerId: string | null;  // player who will take the restart
}

export class SimulationEngine {
  private snapshot: SimSnapshot;
  private readonly rng: () => number;
  private readonly statsAccumulator: StatsAccumulator;
  readonly decisionLog: DecisionLog;
  readonly gameLog: GameEventLog;
  private readonly grid: SpatialGrid;
  private readonly previousActions: Map<string, ActionType> = new Map();
  private readonly tackleCooldowns: Map<string, number> = new Map(); // agentId → tick when cooldown expires
  private lastKickerId: string | null = null;   // player who last kicked the ball
  private kickCooldownUntil: number = 0;          // tick until which lastKicker can't pick up the ball
  private pickupCooldownUntil: number = 0;        // global: nobody picks up until this tick (prevents possession loops)
  private carrierKickLockoutUntil: number = 0;    // carrier can't kick until this tick (prevents micro-pass spam)
  private homeTacticalConfig: TacticalConfig;
  private awayTacticalConfig: TacticalConfig;
  private homeTacticalConfigOOP: TacticalConfig;
  private awayTacticalConfigOOP: TacticalConfig;
  private homeTacticalConfigDefTrans: TacticalConfig;
  private homeTacticalConfigAttTrans: TacticalConfig;
  private homeBench: PlayerState[];
  private awayBench: PlayerState[];
  private homeSubCount: number = 0;  // substitutions made for home team this match
  private awaySubCount: number = 0;  // substitutions made for away team this match
  private halftimeLatched: boolean = false; // true when in HALFTIME, blocks auto-advance to SECOND_HALF
  private halftimeHandled: boolean = false; // true after startSecondHalf() — prevents re-latch on post-goal HALFTIME
  private deadBall: DeadBallState | null = null;       // non-null during dead ball restarts
  private lastTouchTeamId: TeamId | null = null;       // team that last touched the ball
  private restartProtectionUntil: number = 0;          // tick until which tackles are blocked after a dead ball restart
  private pendingPassPlayerId: string | null = null;   // player who last kicked a pass (for completion tracking)
  private pendingPassTeamId: TeamId | null = null;     // team of the pending pass
  private lastKickWasShot: boolean = false;            // true if last kick was a SHOOT (prevents double-counting on goal)

  // ── Transition detection (V1 overhaul) ─────────────────────────────────────
  private previousPossessionTeam: TeamId | null = null; // possession team last tick
  private transitionTeam: TeamId | null = null;         // team currently in transition (lost possession)
  private transitionTicksRemaining: number = 0;          // ticks left in transition window

  // ── Offside tracking ──────────────────────────────────────────────────────
  private offsideLineAtKick: number | null = null;   // x of offside line when pass was kicked
  private offsideKickTeam: TeamId | null = null;      // which team kicked (attackers)
  private offsideActive: boolean = false;             // true while a pass is in flight

  // ── Smooth adoption (V1 overhaul) ─────────────────────────────────────────
  private adoptionTicksRemaining: number = 0;            // ticks remaining in anchor lerp
  private preAdoptionAnchorsHome: Vec2[] | null = null;  // anchors before tactical change
  private preAdoptionAnchorsAway: Vec2[] | null = null;

  // ── Vision system ──────────────────────────────────────────────────────────
  private visionCache: Map<string, readonly PlayerState[]> = new Map();
  private visionCacheTick: Map<string, number> = new Map();

  constructor(config: MatchConfig) {
    let initialSnapshot = createInitialSnapshot(config.homeRoster, config.awayRoster);

    // Apply optional initial ball overrides (for testing and dev init)
    if (config.initialBallPosition || config.initialBallVelocity) {
      const ball: BallState = {
        ...initialSnapshot.ball,
        ...(config.initialBallPosition
          ? { position: new Vec2(config.initialBallPosition.x, config.initialBallPosition.y) }
          : {}),
        ...(config.initialBallVelocity
          ? { velocity: new Vec2(config.initialBallVelocity.x, config.initialBallVelocity.y) }
          : {}),
      };
      initialSnapshot = { ...initialSnapshot, ball };
    }

    this.snapshot = initialSnapshot;
    this.rng = createRng(config.seed);
    this.statsAccumulator = new StatsAccumulator();
    this.decisionLog = new DecisionLog();
    this.gameLog = new GameEventLog();
    this.grid = new SpatialGrid(PITCH_WIDTH, PITCH_HEIGHT, 10);
    this.homeTacticalConfig = config.homeTacticalConfig ?? DEFAULT_TACTICAL_CONFIG;
    this.awayTacticalConfig = config.awayTacticalConfig ?? DEFAULT_TACTICAL_CONFIG;
    this.homeTacticalConfigOOP = config.homeTacticalConfigOOP ?? this.homeTacticalConfig;
    this.awayTacticalConfigOOP = config.awayTacticalConfigOOP ?? this.awayTacticalConfig;
    this.homeTacticalConfigDefTrans = config.homeTacticalConfigDefTrans ?? this.homeTacticalConfigOOP;
    this.homeTacticalConfigAttTrans = config.homeTacticalConfigAttTrans ?? this.homeTacticalConfig;
    this.homeBench = config.homeBench ? [...config.homeBench] : [];
    this.awayBench = config.awayBench ? [...config.awayBench] : [];

    // Apply tactical config to initial snapshot so players start at correct
    // formation positions (not hard-coded 4-4-2 kickoff positions)
    this.snapshot = this._applyInitialFormation(this.snapshot);

    // Start match with a kickoff dead ball (home kicks off)
    // Skip if test overrides are provided (initialBallVelocity/Position)
    if (!config.initialBallVelocity && !config.initialBallPosition) {
      const center = new Vec2(PITCH_WIDTH / 2, PITCH_HEIGHT / 2);
      this.deadBall = {
        type: RestartType.KICKOFF,
        position: center,
        teamId: 'home',
        tickStarted: 0,
        repositionTicks: TUNING.kickoffPauseTicks,
        takerId: this._findTaker(RestartType.KICKOFF, 'home', center, this.snapshot.players as PlayerState[]),
      };
    }
  }

  /**
   * Set new tactical configuration for the home team.
   * Takes effect from the next tick onwards.
   */
  setHomeTactics(config: TacticalConfig): void {
    this._startAdoption('home');
    this.homeTacticalConfig = config;
    // Update player role and duty fields in current snapshot
    this.snapshot = this._applyTacticConfigToSnapshot(this.snapshot, config, 'home');
  }

  /**
   * Set new tactical configuration for the away team.
   * Takes effect from the next tick onwards.
   */
  setAwayTactics(config: TacticalConfig): void {
    this._startAdoption('away');
    this.awayTacticalConfig = config;
    // Update player role and duty fields in current snapshot
    this.snapshot = this._applyTacticConfigToSnapshot(this.snapshot, config, 'away');
  }

  /**
   * Set out-of-possession tactical config for the home team.
   * Used when the home team doesn't have the ball.
   */
  setHomeTacticsOOP(config: TacticalConfig): void {
    this._startAdoption('home');
    this.homeTacticalConfigOOP = config;
  }

  /**
   * Set out-of-possession tactical config for the away team.
   * Used when the away team doesn't have the ball.
   */
  setAwayTacticsOOP(config: TacticalConfig): void {
    this._startAdoption('away');
    this.awayTacticalConfigOOP = config;
  }

  /**
   * Set defensive transition config for the home team.
   * Multipliers are used during the counter-press window after losing possession.
   */
  setHomeTacticsDefTrans(config: TacticalConfig): void {
    this.homeTacticalConfigDefTrans = config;
  }

  /**
   * Set attacking transition config for the home team.
   * Multipliers are used during the counter-attack window after winning possession.
   */
  setHomeTacticsAttTrans(config: TacticalConfig): void {
    this.homeTacticalConfigAttTrans = config;
  }

  /**
   * Snapshot current anchor positions and start the smooth adoption window.
   * During adoption, anchors lerp from pre-change positions to new target.
   */
  private _startAdoption(teamId: TeamId): void {
    const snap = this.snapshot;
    // Capture current player positions as "old anchors"
    const teamPlayers = snap.players.filter(p => p.teamId === teamId);
    const anchors = teamPlayers.map(p => p.formationAnchor);
    if (teamId === 'home') {
      this.preAdoptionAnchorsHome = anchors as Vec2[];
    } else {
      this.preAdoptionAnchorsAway = anchors as Vec2[];
    }
    this.adoptionTicksRemaining = TUNING.adoptionTicks;
  }

  /**
   * Signal that halftime is over and the second half should begin.
   * Must be called to advance past HALFTIME — the engine latches in
   * HALFTIME state until this is called.
   */
  startSecondHalf(): void {
    this.halftimeLatched = false;
    this.halftimeHandled = true;
    this.visionCache.clear();
    this.visionCacheTick.clear();
  }

  /**
   * Returns true if the engine is currently latched in HALFTIME state
   * (waiting for startSecondHalf() to be called).
   */
  isHalftimeLatched(): boolean {
    return this.halftimeLatched;
  }

  /**
   * Substitute a player on the pitch with a bench player.
   * The incoming player inherits the outgoing player's formationAnchor, role, and duty.
   * Incoming player starts with fatigue: 0 (fresh sub) and retains their own attributes/personality.
   * Maximum 3 substitutions per team per match (TAC-05).
   *
   * Returns true if the substitution was applied; false if rejected (max subs, invalid IDs, etc.).
   */
  substitutePlayer(teamId: TeamId, outPlayerId: string, inPlayer: PlayerState): boolean {
    // Check substitution limit
    const subCount = teamId === 'home' ? this.homeSubCount : this.awaySubCount;
    if (subCount >= 3) return false;

    const currentPlayers = this.snapshot.players;
    const outIdx = currentPlayers.findIndex(p => p.id === outPlayerId && p.teamId === teamId);
    if (outIdx < 0) return false;

    const outPlayer = currentPlayers[outIdx]!;

    // Remove the bench player from the bench list
    const bench = teamId === 'home' ? this.homeBench : this.awayBench;
    const benchIdx = bench.findIndex(p => p.id === inPlayer.id);
    if (benchIdx < 0) return false; // inPlayer not on bench (guard against invalid state)
    bench.splice(benchIdx, 1);

    // Build substituted player: inPlayer's attributes/personality, outPlayer's position/anchor/role/duty
    const substitutedPlayer: PlayerState = {
      ...inPlayer,
      position: outPlayer.formationAnchor,
      velocity: Vec2.zero(),
      fatigue: 0, // fresh sub
      role: outPlayer.role,
      duty: outPlayer.duty,
      formationAnchor: outPlayer.formationAnchor,
    };

    // Update snapshot
    const updatedPlayers = [...currentPlayers];
    updatedPlayers[outIdx] = substitutedPlayer;
    this.snapshot = { ...this.snapshot, players: updatedPlayers };

    // Track substitution count
    if (teamId === 'home') {
      this.homeSubCount++;
    } else {
      this.awaySubCount++;
    }

    // Clear vision cache — new player on pitch invalidates cached opponent lists
    this.visionCache.clear();
    this.visionCacheTick.clear();

    return true;
  }

  /**
   * Returns the number of substitutions made for the given team this match.
   */
  getSubstitutionCount(teamId: TeamId): number {
    return teamId === 'home' ? this.homeSubCount : this.awaySubCount;
  }

  /** Returns the current transition state (which team lost possession, ticks remaining). */
  getTransitionState(): { team: TeamId | null; ticksRemaining: number } {
    return { team: this.transitionTeam, ticksRemaining: this.transitionTicksRemaining };
  }

  /**
   * Returns the current bench players for the given team (players not yet substituted in).
   */
  getBench(teamId: TeamId): PlayerState[] {
    return teamId === 'home' ? [...this.homeBench] : [...this.awayBench];
  }

  /**
   * Apply a new TacticalConfig to a snapshot's players for a given team.
   * Updates role and duty fields for all players of that team.
   */
  private _applyTacticConfigToSnapshot(
    snapshot: SimSnapshot,
    config: TacticalConfig,
    teamId: TeamId,
  ): SimSnapshot {
    // Recompute formation anchors in neutral mode (no ball influence / possession shift)
    // so the overlay shows the clean formation shape while paused
    const anchors = computeFormationAnchors(
      config.formation, teamId, snapshot.ball.position, false,
      config.teamControls,
      true, // neutral — skip ball pull, possession shift, rest defence
    );

    let teamIdx = 0;
    const updatedPlayers = snapshot.players.map(p => {
      if (p.teamId !== teamId) return p;
      const role = config.roles[teamIdx] ?? p.role;
      const duty = config.duties[teamIdx] ?? p.duty;
      const anchor = anchors[teamIdx] ?? p.formationAnchor;
      teamIdx++;
      return { ...p, role, duty, formationAnchor: anchor };
    });
    return { ...snapshot, players: updatedPlayers };
  }

  /**
   * Apply initial formation positions, roles, and duties from tactical configs
   * to the snapshot so players start at their correct formation shape
   * (instead of hard-coded 4-4-2 kickoff positions).
   */
  private _applyInitialFormation(snapshot: SimSnapshot): SimSnapshot {
    const homeAnchors = computeFormationAnchors(
      this.homeTacticalConfig.formation, 'home', snapshot.ball.position, false,
      this.homeTacticalConfig.teamControls,
      true, // neutral — clean formation shape for initial placement
    );
    const awayAnchors = computeFormationAnchors(
      this.awayTacticalConfig.formation, 'away', snapshot.ball.position, false,
      this.awayTacticalConfig.teamControls,
      true, // neutral
    );

    // Clamp to own half for kickoff
    const halfX = PITCH_WIDTH / 2;
    for (let i = 0; i < homeAnchors.length; i++) {
      const a = homeAnchors[i]!;
      if (a.x > halfX - 1) homeAnchors[i] = new Vec2(halfX - 1, a.y);
    }
    for (let i = 0; i < awayAnchors.length; i++) {
      const a = awayAnchors[i]!;
      if (a.x < halfX + 1) awayAnchors[i] = new Vec2(halfX + 1, a.y);
    }

    let homeIdx = 0;
    let awayIdx = 0;
    const updatedPlayers = snapshot.players.map(p => {
      const isHome = p.teamId === 'home';
      const config = isHome ? this.homeTacticalConfig : this.awayTacticalConfig;
      const anchors = isHome ? homeAnchors : awayAnchors;
      const idx = isHome ? homeIdx++ : awayIdx++;
      const anchor = anchors[idx] ?? p.formationAnchor;
      const role = config.roles[idx] ?? p.role;
      const duty = config.duties[idx] ?? p.duty;
      return { ...p, position: anchor, formationAnchor: anchor, role, duty };
    });
    return { ...snapshot, players: updatedPlayers };
  }

  // ── Dead ball helpers ─────────────────────────────────────────────────

  /**
   * Enter a dead ball state. Ball is frozen at the restart position.
   */
  private _enterDeadBall(state: DeadBallState): void {
    this.deadBall = state;
  }

  /**
   * Find the appropriate restart taker for a given dead ball type.
   */
  private _findTaker(
    type: RestartType,
    teamId: TeamId,
    restartPos: Vec2,
    players: readonly PlayerState[],
  ): string | null {
    const teamPlayers = players.filter(p => p.teamId === teamId);

    if (type === RestartType.GOAL_KICK) {
      const gk = teamPlayers.find(p => p.role === 'GK');
      return gk?.id ?? teamPlayers[0]?.id ?? null;
    }

    if (type === RestartType.KICKOFF) {
      // Prefer a forward/striker nearest to center
      const center = new Vec2(PITCH_WIDTH / 2, PITCH_HEIGHT / 2);
      let nearest: PlayerState | null = null;
      let minDist = Infinity;
      for (const p of teamPlayers) {
        if (p.role === 'GK') continue;
        const d = p.position.distanceTo(center);
        if (d < minDist) { minDist = d; nearest = p; }
      }
      return nearest?.id ?? teamPlayers[0]?.id ?? null;
    }

    // THROW_IN, CORNER: nearest outfield player
    let nearest: PlayerState | null = null;
    let minDist = Infinity;
    for (const p of teamPlayers) {
      if (p.role === 'GK') continue;
      const d = p.position.distanceTo(restartPos);
      if (d < minDist) { minDist = d; nearest = p; }
    }
    return nearest?.id ?? teamPlayers[0]?.id ?? null;
  }

  /**
   * Process a dead ball tick: freeze ball, move players to anchors, resume when countdown expires.
   */
  private _tickDeadBall(dt: number, nextTick: number, phaseResult: { phase: MatchPhase; events: import('./types.ts').MatchEvent[] }): SimSnapshot {
    const current = this.snapshot;
    const db = this.deadBall!;
    const elapsed = nextTick - db.tickStarted;

    let ball = current.ball;
    let players = [...current.players] as PlayerState[];

    // Check if repositioning is truly complete
    let repositioningComplete = elapsed >= db.repositionTicks;

    // For kickoffs, ensure all players are in their own half before resuming (cap at 300 ticks)
    if (repositioningComplete && db.type === RestartType.KICKOFF && elapsed < 300) {
      const halfX = PITCH_WIDTH / 2;
      const allInOwnHalf = players.every(p => {
        if (p.teamId === 'home') return p.position.x <= halfX + 2;
        return p.position.x >= halfX - 2;
      });
      if (!allInOwnHalf) repositioningComplete = false;
    }

    if (repositioningComplete) {
      // Reposition complete — snap taker to restart position and give them the ball
      const takerIdx = players.findIndex(p => p.id === db.takerId);
      const taker = takerIdx >= 0 ? players[takerIdx] : null;
      if (taker) {
        // Snap taker to the exact restart position (ensures throw-ins are on the line)
        players[takerIdx] = { ...taker, position: db.position, velocity: Vec2.zero() };
        ball = {
          ...ball,
          position: db.position,
          velocity: Vec2.zero(),
          z: 0,
          vz: 0,
          carrierId: taker.id,
        };
        this.lastTouchTeamId = db.teamId;
        this.carrierKickLockoutUntil = nextTick + 5;
        // Protect taker from immediate tackles — opponents must be 10 yards away at restart
        this.restartProtectionUntil = nextTick + 20;
      } else {
        // Fallback: drop ball at restart position
        ball = { ...ball, position: db.position, velocity: Vec2.zero(), z: 0, vz: 0, carrierId: null };
      }
      this.deadBall = null;
    } else {
      // Still repositioning — freeze ball, move players toward anchors
      ball = { ...ball, position: db.position, velocity: Vec2.zero(), z: 0, vz: 0, carrierId: null };

      // Compute formation anchors for player movement
      const homeAnchors = computeFormationAnchors(
        this.homeTacticalConfig.formation, 'home', db.position, false,
        this.homeTacticalConfig.teamControls,
      );
      const awayAnchors = computeFormationAnchors(
        this.awayTacticalConfig.formation, 'away', db.position, false,
        this.awayTacticalConfig.teamControls,
      );

      // Kickoff own-half enforcement: clamp each team's anchors to their own half
      const halfX = PITCH_WIDTH / 2;
      if (db.type === RestartType.KICKOFF) {
        for (let i = 0; i < homeAnchors.length; i++) {
          const a = homeAnchors[i]!;
          if (a.x > halfX - 1) homeAnchors[i] = new Vec2(halfX - 1, a.y);
        }
        for (let i = 0; i < awayAnchors.length; i++) {
          const a = awayAnchors[i]!;
          if (a.x < halfX + 1) awayAnchors[i] = new Vec2(halfX + 1, a.y);
        }
      }

      let homeIdx = 0;
      let awayIdx = 0;
      players = players.map(p => {
        const isHome = p.teamId === 'home';
        const anchors = isHome ? homeAnchors : awayAnchors;
        const idx = isHome ? homeIdx++ : awayIdx++;
        const anchor = anchors[idx] ?? p.formationAnchor;

        // Move taker toward the restart position instead of their anchor
        const target = (p.id === db.takerId) ? db.position : anchor;

        const dist = p.position.distanceTo(target);
        if (dist < 1) return { ...p, velocity: Vec2.zero(), formationAnchor: anchor };

        const speedFrac = db.type === RestartType.KICKOFF ? 1.0 : 0.8; // jog back for kickoff
        const maxSpeed = p.attributes.pace * TUNING.playerBaseSpeed * speedFrac;
        const desired = arrive(p.position, target, maxSpeed, 5.0);
        const newVel = clampVelocity(desired, maxSpeed);
        const dtSec = dt / 1000;
        const newPos = clampToPitch(p.position.add(newVel.scale(dtSec)));
        return { ...p, position: newPos, velocity: newVel, formationAnchor: anchor };
      });
    }

    const deadBallInfo: DeadBallInfo | undefined = this.deadBall
      ? { type: this.deadBall.type, teamId: this.deadBall.teamId, position: this.deadBall.position }
      : undefined;

    const newSnapshot: SimSnapshot = {
      tick: nextTick,
      timestamp: current.timestamp + dt,
      ball,
      players,
      matchPhase: phaseResult.phase,
      score: current.score,
      events: [...phaseResult.events],
      stats: this.statsAccumulator.getSnapshot(),
      deadBallInfo,
    };
    this.snapshot = newSnapshot;
    return newSnapshot;
  }

  /**
   * Advance simulation by one tick of dt milliseconds.
   * Returns the new snapshot.
   */
  tick(dt: number): SimSnapshot {
    const current = this.snapshot;
    const nextTick = current.tick + 1;

    // ── 1. Advance match phase ───────────────────────────────────────────────
    let phaseResult = advancePhase(
      current.matchPhase,
      nextTick,
      false, // justScored — determined below after goal check
    );

    // ── 1b. Halftime latch ──────────────────────────────────────────────────
    // When entering HALFTIME, latch the engine so it stays in HALFTIME
    // until startSecondHalf() is called. Without this, HALFTIME only lasts
    // 1 tick and the 250ms poll in main.ts can't catch it.
    if (phaseResult.phase === MatchPhase.HALFTIME && !this.halftimeLatched && !this.halftimeHandled) {
      this.halftimeLatched = true;
    }
    if (this.halftimeLatched) {
      // Override: stay in HALFTIME regardless of what advancePhase says
      phaseResult = { phase: MatchPhase.HALFTIME, events: phaseResult.events };
    }

    // ── 2. HALFTIME / FULL_TIME / HALFTIME→SECOND_HALF: skip physics ─────────
    // Physics is also skipped on the first tick of SECOND_HALF (the halftime transition
    // tick) to prevent ball movement when transitioning out of a stopped state.
    const isBreakTick =
      phaseResult.phase === MatchPhase.HALFTIME ||
      phaseResult.phase === MatchPhase.FULL_TIME ||
      (phaseResult.phase === MatchPhase.SECOND_HALF && current.matchPhase === MatchPhase.HALFTIME);

    if (isBreakTick) {
      // Clear any pending dead ball when entering halftime/fulltime
      this.deadBall = null;
      // Reset ball to stopped state at break or on second-half kickoff transition
      const stoppedBall: BallState = {
        ...current.ball,
        velocity: Vec2.zero(),
        vz: 0,
        carrierId: null,
      };
      const newSnapshot: SimSnapshot = {
        ...current,
        tick: nextTick,
        timestamp: current.timestamp + dt,
        ball: stoppedBall,
        matchPhase: phaseResult.phase,
        events: [...phaseResult.events],
        stats: this.statsAccumulator.getSnapshot(),
      };
      this.snapshot = newSnapshot;
      return newSnapshot;
    }

    // ── 2b. Dead ball tick ─────────────────────────────────────────────────
    if (this.deadBall !== null) {
      return this._tickDeadBall(dt, nextTick, phaseResult);
    }

    // ── 3. Accumulate fatigue for all players ────────────────────────────────
    const playersWithFatigue: PlayerState[] = current.players.map(p => {
      const newFatigue = accumulateFatigue(
        p.fatigue,
        nextTick,
        p.attributes.stamina,
        p.personality.work_rate,
        dt,
      );
      return { ...p, fatigue: newFatigue };
    });

    // ── 4. Compute effective attributes/personality per player ───────────────
    // (store effective values for this tick; base values preserved in player state)
    const effectiveAttributes = playersWithFatigue.map(p =>
      applyFatigueToAttributes(p.attributes, p.fatigue)
    );
    const effectivePersonality = playersWithFatigue.map(p =>
      applyFatigueToPersonality(p.personality, p.fatigue)
    );

    // ── 5. Update spatial grid ───────────────────────────────────────────────
    this.grid.clear();
    for (const p of playersWithFatigue) {
      this.grid.insert(p.id, p.position);
    }

    // ── 6. Compute formation anchors ─────────────────────────────────────────
    // Select in-possession or out-of-possession config based on ball carrier
    const ballCarrierId = current.ball.carrierId;
    const ballCarrier = ballCarrierId
      ? playersWithFatigue.find(p => p.id === ballCarrierId)
      : null;
    const homePossession = ballCarrier?.teamId === 'home';
    const awayPossession = ballCarrier?.teamId === 'away';

    // ── 6a. Transition detection ─────────────────────────────────────────────
    const currentPossTeam: TeamId | null = homePossession ? 'home' : awayPossession ? 'away' : null;
    if (currentPossTeam !== null && this.previousPossessionTeam !== null && currentPossTeam !== this.previousPossessionTeam) {
      // Possession changed — start transition window for the team that lost it
      this.transitionTeam = this.previousPossessionTeam;
      const loserConfig = this.transitionTeam === 'home' ? this.homeTacticalConfigOOP : this.awayTacticalConfigOOP;
      const counterPressSecs = loserConfig.transitions?.counterPressDuration ?? 3;
      this.transitionTicksRemaining = Math.round(counterPressSecs * 30); // 30 ticks/sec
    }
    if (currentPossTeam !== null) {
      this.previousPossessionTeam = currentPossTeam;
    }
    // Decrement transition timer
    if (this.transitionTicksRemaining > 0) {
      this.transitionTicksRemaining--;
      if (this.transitionTicksRemaining <= 0) {
        this.transitionTeam = null;
      }
    }

    const activeHomeConfig = homePossession ? this.homeTacticalConfig : this.homeTacticalConfigOOP;
    const activeAwayConfig = awayPossession ? this.awayTacticalConfig : this.awayTacticalConfigOOP;

    const homeAnchors = computeFormationAnchors(
      activeHomeConfig.formation,
      'home',
      current.ball.position,
      homePossession,
      activeHomeConfig.teamControls,
    );
    const awayAnchors = computeFormationAnchors(
      activeAwayConfig.formation,
      'away',
      current.ball.position,
      awayPossession,
      activeAwayConfig.teamControls,
    );

    // ── 6b. Smooth adoption: lerp anchors from pre-change to target ──────────
    if (this.adoptionTicksRemaining > 0) {
      this.adoptionTicksRemaining--;
      const t = 1 - this.adoptionTicksRemaining / TUNING.adoptionTicks; // 0→1 over window
      if (this.preAdoptionAnchorsHome) {
        for (let i = 0; i < homeAnchors.length && i < this.preAdoptionAnchorsHome.length; i++) {
          const old = this.preAdoptionAnchorsHome[i]!;
          const target = homeAnchors[i]!;
          homeAnchors[i] = new Vec2(
            old.x + (target.x - old.x) * t,
            old.y + (target.y - old.y) * t,
          );
        }
      }
      if (this.preAdoptionAnchorsAway) {
        for (let i = 0; i < awayAnchors.length && i < this.preAdoptionAnchorsAway.length; i++) {
          const old = this.preAdoptionAnchorsAway[i]!;
          const target = awayAnchors[i]!;
          awayAnchors[i] = new Vec2(
            old.x + (target.x - old.x) * t,
            old.y + (target.y - old.y) * t,
          );
        }
      }
      if (this.adoptionTicksRemaining <= 0) {
        this.preAdoptionAnchorsHome = null;
        this.preAdoptionAnchorsAway = null;
      }
    }

    // Assign updated formation anchors and tactical role/duty to players
    // Home players are first 11, away are next 11
    let homeIdx = 0;
    let awayIdx = 0;

    const playersWithAnchors: PlayerState[] = playersWithFatigue.map((p) => {
      const isHome = p.teamId === 'home';
      const tacticalConfig = isHome ? activeHomeConfig : activeAwayConfig;
      const anchors = isHome ? homeAnchors : awayAnchors;
      const roleIdx = isHome ? homeIdx++ : awayIdx++;
      const anchor = anchors[roleIdx] ?? p.formationAnchor;
      // Update role and duty from tactical config
      const role = tacticalConfig.roles[roleIdx] ?? p.role;
      const duty = tacticalConfig.duties[roleIdx] ?? p.duty;
      return { ...p, formationAnchor: anchor, role, duty };
    });

    // ── 6c. Compute offside lines for each defending team ───────────────────
    // Home offside line = line that away attackers must stay behind
    // Away offside line = line that home attackers must stay behind
    const homeOffsideLine = computeDefensiveLine(playersWithAnchors, 'home', current.ball.position.x);
    const awayOffsideLine = computeDefensiveLine(playersWithAnchors, 'away', current.ball.position.x);

    // ── 6d. Defensive line blending for CB/LB/RB ─────────────────────────
    // When out of possession, blend defender anchors toward a coordinated flat line.
    // The line target is the x of the 2nd-deepest defender (the offside line).
    for (let i = 1; i < 11; i++) {
      const p = playersWithAnchors[i]!;
      if (p.teamId !== 'home') continue;
      if (p.role !== 'CB' && p.role !== 'LB' && p.role !== 'RB') continue;
      if (homePossession) continue; // only when defending
      const lineX = homeOffsideLine;
      const anchor = homeAnchors[i]!;
      // Clamp anchor x within 3m of line (creates flat back line)
      const diff = anchor.x - lineX;
      if (Math.abs(diff) > 3) {
        homeAnchors[i] = new Vec2(lineX + Math.sign(diff) * 3, anchor.y);
      }
    }
    for (let i = 0; i < 11; i++) {
      const p = playersWithAnchors[11 + i]!;
      if (p.teamId !== 'away') continue;
      if (p.role !== 'CB' && p.role !== 'LB' && p.role !== 'RB') continue;
      if (awayPossession) continue;
      const lineX = awayOffsideLine;
      const anchor = awayAnchors[i]!;
      const diff = anchor.x - lineX;
      if (Math.abs(diff) > 3) {
        awayAnchors[i] = new Vec2(lineX + Math.sign(diff) * 3, anchor.y);
      }
    }

    // ── 6e. Emergency shape recovery during defensive transition ──────────
    // When a team just lost possession, blend anchors toward a compact block
    // between ball and own goal. Strongest at moment of loss, fading over window.
    if (this.transitionTeam !== null && this.transitionTicksRemaining > 0) {
      const loserConfig = this.transitionTeam === 'home' ? this.homeTacticalConfigOOP : this.awayTacticalConfigOOP;
      const counterPressSecs = loserConfig.transitions?.counterPressDuration ?? 3;
      const maxTicks = Math.round(counterPressSecs * 30);
      const collapseDepth = loserConfig.transitions?.collapseDepth ?? 0.5;
      const blendStrength = 0.6 * (this.transitionTicksRemaining / Math.max(maxTicks, 1));

      const ownGoalX = this.transitionTeam === 'home' ? 0 : PITCH_WIDTH;
      const bx = current.ball.position.x;
      const by = current.ball.position.y;
      // Emergency block position: between ball and own goal, depth controlled by collapseDepth
      const emergencyX = ownGoalX + (bx - ownGoalX) * (1 - collapseDepth);
      const anchors = this.transitionTeam === 'home' ? homeAnchors : awayAnchors;
      for (let i = 1; i < 11; i++) {
        const a = anchors[i]!;
        // Compress width to 60% toward ball's y
        const compressedY = by + (a.y - by) * 0.6;
        const targetX = a.x + (emergencyX - a.x) * blendStrength;
        const targetY = a.y + (compressedY - a.y) * blendStrength;
        anchors[i] = new Vec2(targetX, targetY);
      }
    }

    // Re-apply updated anchors to players after defensive line + emergency shape adjustments
    for (let i = 0; i < playersWithAnchors.length; i++) {
      const p = playersWithAnchors[i]!;
      const isHome = p.teamId === 'home';
      const idx = isHome ? i : i - 11;
      const anchors = isHome ? homeAnchors : awayAnchors;
      const newAnchor = anchors[idx];
      if (newAnchor) {
        playersWithAnchors[i] = { ...p, formationAnchor: newAnchor };
      }
    }

    // ── 7. Build AgentContext for each player (with vision filtering) ────────
    const contexts: AgentContext[] = playersWithAnchors.map((p, idx) => {
      const teammates = playersWithAnchors.filter(op => op.teamId === p.teamId && op.id !== p.id);
      const allOpponents = playersWithAnchors.filter(op => op.teamId !== p.teamId);

      // Vision-filtered opponents: each player only "sees" opponents within their
      // vision radius and facing direction. Uses a per-player cache with refresh
      // interval driven by anticipation personality trait.
      const effVision = effectiveAttributes[idx]!.vision;
      const effAnticipation = effectivePersonality[idx]!.anticipation;
      const refreshInterval = visionRefreshInterval(effAnticipation);
      const lastRefresh = this.visionCacheTick.get(p.id) ?? -Infinity;
      let visibleOpponents: readonly PlayerState[];
      if (nextTick - lastRefresh >= refreshInterval) {
        visibleOpponents = filterOpponentsByVision(p, allOpponents, effVision);
        this.visionCache.set(p.id, visibleOpponents);
        this.visionCacheTick.set(p.id, nextTick);
      } else {
        visibleOpponents = this.visionCache.get(p.id) ?? allOpponents;
      }

      // Opponent goal position
      const opponentGoalX = p.teamId === 'home' ? PITCH_WIDTH : 0;
      const goalPos = new Vec2(opponentGoalX, PITCH_HEIGHT / 2);
      const distanceToOpponentGoal = p.position.distanceTo(goalPos);

      const distanceToBall = p.position.distanceTo(current.ball.position);
      const distanceToFormationAnchor = p.position.distanceTo(p.formationAnchor);

      const isInPossessionTeam = ballCarrierId
        ? (p.teamId === 'home' ? homePossession : awayPossession)
        : false;

      // Nearest defender uses ALL opponents (ground truth) — you can feel physical
      // pressure even from opponents you can't see. Vision filtering only affects
      // the opponents list used by action considerations (lane clearance, etc.)
      let nearestDefenderDistance = 100;
      let nearestTeammateDistance = 100;
      for (const opp of allOpponents) {
        const d = p.position.distanceTo(opp.position);
        if (d < nearestDefenderDistance) nearestDefenderDistance = d;
      }
      for (const tm of teammates) {
        const d = p.position.distanceTo(tm.position);
        if (d < nearestTeammateDistance) nearestTeammateDistance = d;
      }

      // Use effective attributes/personality for agent context
      const effectivePlayer: PlayerState = {
        ...p,
        attributes: effectiveAttributes[idx]!,
        personality: effectivePersonality[idx]!,
      };

      // Offside line for the opposing team's defence
      // Home attacker sees away defensive line; away attacker sees home defensive line
      const offsideLineX = p.teamId === 'home' ? awayOffsideLine : homeOffsideLine;

      return {
        self: effectivePlayer,
        teammates,
        opponents: visibleOpponents as PlayerState[],
        ball: current.ball,
        matchPhase: phaseResult.phase,
        score: current.score,
        distanceToOpponentGoal,
        distanceToBall,
        distanceToFormationAnchor,
        isInPossessionTeam,
        nearestDefenderDistance,
        nearestTeammateDistance,
        offsideLineX,
      };
    });

    // ── 8. Select action for each player ─────────────────────────────────────

    // Pre-compute press height activation lines for each team
    // low = own third only (35m from own goal), mid = own half (52m), high = anywhere (105m)
    const pressLineHome = _pressActivationX(activeHomeConfig.press?.height ?? 'mid', 'home');
    const pressLineAway = _pressActivationX(activeAwayConfig.press?.height ?? 'mid', 'away');

    const intents: ActionIntent[] = contexts.map((ctx, i) => {
      const player = playersWithAnchors[i]!;
      const playerId = player.id;
      const prevAction = this.previousActions.get(playerId);
      // Build duty modifier from player's current role and duty
      const role = player.role;
      const duty = (player.duty as Duty) ?? 'SUPPORT';
      const dutyModifier = (actionType: ActionType) =>
        getDutyWeightModifier(role, duty, actionType);
      // Resolve per-player tactical multipliers from active config
      const isHome = player.teamId === 'home';
      const config = isHome ? activeHomeConfig : activeAwayConfig;
      const playerIdx = isHome ? i : i - 11;
      let tactMult = config.multipliers?.[playerIdx];

      // Press height suppression: if ball is beyond team's press activation line,
      // clamp the press multiplier to near-zero so pressing is soft-suppressed
      if (tactMult) {
        const pressLine = isHome ? pressLineHome : pressLineAway;
        const ballBeyondLine = isHome
          ? current.ball.position.x > pressLine  // home presses toward x=105
          : current.ball.position.x < pressLine; // away presses toward x=0
        if (ballBeyondLine) {
          tactMult = { ...tactMult, press: tactMult.press * 0.1 };
        }
      }

      // During transition window, swap in transition phase multipliers
      if (this.transitionTeam === player.teamId && this.transitionTicksRemaining > 0) {
        // Defensive transition: use the player's def trans multipliers
        const defTransConfig = isHome ? this.homeTacticalConfigDefTrans : config;
        const defTransMult = defTransConfig.multipliers?.[playerIdx];
        if (defTransMult) {
          tactMult = defTransMult;
        }
      }
      if (this.transitionTeam !== null && this.transitionTeam !== player.teamId && this.transitionTicksRemaining > 0) {
        // Attacking transition: use the player's att trans multipliers
        const attTransConfig = isHome ? this.homeTacticalConfigAttTrans : config;
        const attTransMult = attTransConfig.multipliers?.[playerIdx];
        if (attTransMult) {
          tactMult = attTransMult;
        }
      }

      return selectAction(ACTIONS, ctx, effectivePersonality[i]!, PERSONALITY_WEIGHTS, this.rng, prevAction, dutyModifier, tactMult);
    });

    // Store selected actions for next tick's hysteresis
    for (let i = 0; i < intents.length; i++) {
      this.previousActions.set(intents[i]!.agentId, intents[i]!.action);
    }

    // ── 9. Log agent decisions ────────────────────────────────────────────────
    for (let i = 0; i < playersWithAnchors.length; i++) {
      const p = playersWithAnchors[i]!;
      const ctx = contexts[i]!;
      const intent = intents[i]!;

      // Score all actions for logging
      const scores = ACTIONS.map(action => ({
        action: action.id,
        score: evaluateAction(action, ctx, effectivePersonality[i]!, PERSONALITY_WEIGHTS, this.rng),
      }));

      const entry: AgentDecisionEntry = {
        tick: nextTick,
        agentId: p.id,
        scores,
        selected: intent.action,
      };
      this.decisionLog.log(entry);
    }

    // ── 9b. GK ball release override ─────────────────────────────────────────
    // When the GK has the ball and is near their formation position,
    // force a pass instead of holding indefinitely.
    if (current.ball.carrierId !== null) {
      for (let i = 0; i < playersWithAnchors.length; i++) {
        const p = playersWithAnchors[i]!;
        if (p.id === current.ball.carrierId && p.role === 'GK') {
          const distToAnchor = p.position.distanceTo(p.formationAnchor);
          const canKick = nextTick >= this.carrierKickLockoutUntil;
          if (canKick && distToAnchor < 10) {
            intents[i] = { ...intents[i]!, action: 'PASS_SAFE' as ActionType };
          }
          break;
        }
      }
    }

    // ── 10. Resolve action intents ────────────────────────────────────────────
    // Ball control and player movement
    let ball = current.ball;
    const updatedPlayers: PlayerState[] = [...playersWithAnchors];
    // Collect match events throughout action resolution (offside, etc.)
    const tickEvents: import('./types.ts').MatchEvent[] = [];

    // 10a. Ball pickup: if ball is loose and a player is within control radius, they pick it up.
    // Global pickup cooldown: after any kick, nobody can pick up for a few ticks so the ball
    // travels away from the kicker area (prevents possession loops between close rivals).
    // Per-kicker cooldown: the kicker can't re-pick up for longer (prevents self-pass).
    if (ball.carrierId === null && nextTick >= this.pickupCooldownUntil) {
      // Ball must be near ground level to be controlled (lofted passes fly over players)
      if (ball.z < 2.0) {
      let closestDist = TUNING.controlRadius;
      let closestIdx = -1;
      for (let i = 0; i < updatedPlayers.length; i++) {
        const p = updatedPlayers[i]!;
        // Skip kicker during cooldown
        if (p.id === this.lastKickerId && nextTick < this.kickCooldownUntil) continue;
        const d = p.position.distanceTo(ball.position);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }
      if (closestIdx >= 0) {
        const newCarrier = updatedPlayers[closestIdx]!;

        // ── Offside check ──────────────────────────────────────────────
        // If a pass was played and a teammate receives it, check if receiver
        // was beyond the offside line at the moment of the pass.
        let isOffside = false;
        if (this.offsideActive && this.offsideLineAtKick !== null && this.offsideKickTeam !== null) {
          if (newCarrier.teamId === this.offsideKickTeam && newCarrier.id !== this.lastKickerId) {
            // Receiver is a teammate — check offside position
            // Home attacks right (+x), offside = receiver.x > offsideLine
            // Away attacks left (-x), offside = receiver.x < offsideLine
            if (this.offsideKickTeam === 'home') {
              isOffside = newCarrier.position.x > this.offsideLineAtKick + 0.5; // 0.5m tolerance
            } else {
              isOffside = newCarrier.position.x < this.offsideLineAtKick - 0.5;
            }
            // Can't be offside in your own half
            const halfX = PITCH_WIDTH / 2;
            if (this.offsideKickTeam === 'home' && newCarrier.position.x <= halfX) isOffside = false;
            if (this.offsideKickTeam === 'away' && newCarrier.position.x >= halfX) isOffside = false;
          }
          // Clear offside tracking once ball is received by anyone
          this.offsideActive = false;
          this.offsideLineAtKick = null;
          this.offsideKickTeam = null;
        }

        if (isOffside) {
          // Offside! Award indirect free kick to defending team at receiver's position.
          const defendingTeam: TeamId = newCarrier.teamId === 'home' ? 'away' : 'home';
          ball = { ...ball, carrierId: null, velocity: Vec2.zero(), vz: 0 };
          tickEvents.push({
            tick: nextTick,
            type: 'offside',
            playerId: newCarrier.id,
            teamId: newCarrier.teamId,
            position: newCarrier.position,
          });
          // Enter dead ball for free kick (use goal kick restart type as closest analogue)
          this._enterDeadBall({
            type: RestartType.GOAL_KICK,
            position: newCarrier.position,
            teamId: defendingTeam,
            tickStarted: nextTick,
            repositionTicks: TUNING.throwInPauseTicks, // quick restart
            takerId: this._findTaker(RestartType.GOAL_KICK, defendingTeam, newCarrier.position, updatedPlayers),
          });
          this.pendingPassPlayerId = null;
          this.pendingPassTeamId = null;
          this.lastKickerId = null;
        } else {
          ball = { ...ball, carrierId: newCarrier.id };
          // Track last touch for out-of-play decisions
          this.lastTouchTeamId = newCarrier.teamId;

          // Pass completion detection
          if (this.pendingPassPlayerId && this.pendingPassTeamId) {
            if (newCarrier.teamId === this.pendingPassTeamId && newCarrier.id !== this.pendingPassPlayerId) {
              // Teammate received the pass — completed
              this.statsAccumulator.recordPassCompletion(this.pendingPassTeamId);
              this.gameLog.recordPassCompletion(this.pendingPassPlayerId);
            }
            this.pendingPassPlayerId = null;
            this.pendingPassTeamId = null;
          }

          // Clear kicker cooldown once someone else picks up the ball
          this.lastKickerId = null;
          // Kick lockout: new carrier must hold the ball before they can pass/shoot
          this.carrierKickLockoutUntil = nextTick + TUNING.kickLockoutTicks;

          // Safety net: if the new carrier selected a non-carrier action (PRESS / MAKE_RUN)
          // while the ball was loose, override to HOLD_SHIELD so they don't freeze.
          const carrierAction = intents[closestIdx]?.action;
          if (carrierAction === 'PRESS' || carrierAction === 'MAKE_RUN') {
            intents[closestIdx] = { ...intents[closestIdx]!, action: 'HOLD_SHIELD' as ActionType };
          }
        }
      }
      } // end ball.z < 2.0 height check
    }

    // 10b. Resolve each player's intent
    for (let i = 0; i < updatedPlayers.length; i++) {
      const p = updatedPlayers[i]!;
      const intent = intents[i]!;
      const effAttr = effectiveAttributes[i]!;
      let maxSpeed = effAttr.pace * TUNING.playerBaseSpeed * (1 - p.fatigue * 0.5);
      // Emergency sprint boost during defensive transition (10% faster for recovering defenders)
      const isDefRole = p.role === 'CB' || p.role === 'LB' || p.role === 'RB' || p.role === 'CDM';
      if (isDefRole && this.transitionTeam === p.teamId && this.transitionTicksRemaining > 0) {
        maxSpeed *= 1.10;
      }

      switch (intent.action) {
        case 'MOVE_TO_POSITION': {
          // Base target is the formation anchor
          let moveTarget = p.formationAnchor;

          // Receive loose ball: when ball has no carrier, the closest outfield
          // player on each team moves toward the ball instead of their anchor.
          // This prevents passes sitting untouched because nobody walks onto them.
          if (ball.carrierId === null && p.role !== 'GK') {
            const myDistToBall = p.position.distanceTo(ball.position);
            const teamPlayers = updatedPlayers.filter(tp => tp.teamId === p.teamId && tp.role !== 'GK');
            let isClosest = true;
            for (const tp of teamPlayers) {
              if (tp.id !== p.id && tp.position.distanceTo(ball.position) < myDistToBall) {
                isClosest = false;
                break;
              }
            }
            if (isClosest) {
              // Chase predicted ball position, not where it is now
              const ballSpd = ball.velocity.length();
              if (ballSpd > 2) {
                const travelTime = myDistToBall / Math.max(maxSpeed, 0.1);
                moveTarget = clampToPitch(ball.position.add(ball.velocity.scale(travelTime)));
              } else {
                moveTarget = ball.position;
              }
            }
          }

          // Support positioning: when team has ball, pull toward ball carrier
          // to create shorter passing options and fill gaps
          if (ball.carrierId !== null && ball.carrierId !== p.id) {
            const carrier = updatedPlayers.find(cp => cp.id === ball.carrierId);
            if (carrier && carrier.teamId === p.teamId) {
              const distToCarrier = p.position.distanceTo(carrier.position);
              // Only pull if not already close (avoid crowding) and not the GK
              if (distToCarrier > 12 && p.role !== 'GK') {
                // Compute a support point: between formation anchor and carrier,
                // offset laterally to create a passing angle
                const midpoint = p.formationAnchor.add(carrier.position).scale(0.5);
                // Lateral offset: move away from the direct line to create an angle
                const toCarrier = carrier.position.subtract(p.formationAnchor);
                const perpX = -toCarrier.y;
                const perpY = toCarrier.x;
                const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
                const lateralSign = p.position.y > carrier.position.y ? 1 : -1;
                const lateralOffset = perpLen > 0.01
                  ? new Vec2(perpX / perpLen, perpY / perpLen).scale(lateralSign * 5)
                  : Vec2.zero();
                const supportPos = midpoint.add(lateralOffset);

                // Blend: further from carrier = stronger pull toward support pos
                // Scale by player's freedom: high freedom = stronger pull toward carrier
                const plConfig = p.teamId === 'home' ? activeHomeConfig : activeAwayConfig;
                const plMultIdx = p.teamId === 'home' ? i : i - 11;
                const playerFreedom = plConfig.multipliers?.[plMultIdx]?.freedom ?? 0.5;
                const freedomFactor = 0.5 + (playerFreedom * 0.5); // 0.5..1.0
                // Defenders hold shape — minimal pull toward carrier
                const rolePullFactor = (p.role === 'CB' || p.role === 'LB' || p.role === 'RB') ? 0.15 : 1.0;
                const pullStrength = Math.min((distToCarrier - 12) / 30, 1) * TUNING.supportPull * freedomFactor * rolePullFactor;
                moveTarget = new Vec2(
                  p.formationAnchor.x + (supportPos.x - p.formationAnchor.x) * pullStrength,
                  p.formationAnchor.y + (supportPos.y - p.formationAnchor.y) * pullStrength,
                );
              }
            }
          }

          // CSP nudge: when in possession, attacking/midfield players drift toward
          // better passing lanes. Defenders hold formation — no nudge.
          const isDefensiveRole = p.role === 'GK' || p.role === 'CB' || p.role === 'LB' || p.role === 'RB';
          if (ball.carrierId !== null && ball.carrierId !== p.id && !isDefensiveRole) {
            const cspCarrier = updatedPlayers.find(cp => cp.id === ball.carrierId);
            if (cspCarrier && cspCarrier.teamId === p.teamId) {
              const cspOpponents = updatedPlayers.filter(op => op.teamId !== p.teamId);
              const cspTeammates = updatedPlayers.filter(tp => tp.teamId === p.teamId && tp.id !== p.id);
              const cspOffsideLine = p.teamId === 'home' ? awayOffsideLine : homeOffsideLine;
              const bestCSP = selectBestCSP(
                { ...p, position: moveTarget }, // evaluate CSPs around current target, not player pos
                cspOpponents,
                cspTeammates,
                cspCarrier,
                cspOffsideLine,
              );
              // Only nudge if the CSP is reasonably close to the current target
              if (moveTarget.distanceTo(bestCSP) < 15) {
                const influence = TUNING.cspSupportInfluence;
                moveTarget = new Vec2(
                  moveTarget.x + (bestCSP.x - moveTarget.x) * influence,
                  moveTarget.y + (bestCSP.y - moveTarget.y) * influence,
                );
              }
            }
          }

          // Defender runner-tracking: when out of possession, CB/LB/RB shadow nearby
          // opponents making forward runs. Only the closest defender to each runner tracks them.
          const teamHasBall = ball.carrierId !== null &&
            updatedPlayers.find(cp => cp.id === ball.carrierId)?.teamId === p.teamId;
          if ((p.role === 'CB' || p.role === 'LB' || p.role === 'RB') && !teamHasBall) {
            const oppRunners = updatedPlayers.filter(op =>
              op.teamId !== p.teamId && op.role !== 'GK' && op.velocity.length() > 2.5,
            );
            let markTarget: typeof updatedPlayers[0] | undefined;
            let bestMarkScore = -Infinity;
            for (const opp of oppRunners) {
              const d = p.position.distanceTo(opp.position);
              if (d > 18) continue;
              // Only track if we're the closest defensive player to this runner
              const defTeammates = updatedPlayers.filter(tp =>
                tp.teamId === p.teamId && tp.id !== p.id &&
                (tp.role === 'CB' || tp.role === 'LB' || tp.role === 'RB'),
              );
              const isClosestDef = !defTeammates.some(tm => tm.position.distanceTo(opp.position) < d);
              if (!isClosestDef) continue;
              // Prefer faster runners in more dangerous positions
              const dangerX = p.teamId === 'home' ? opp.position.x : (PITCH_WIDTH - opp.position.x);
              const score = opp.velocity.length() + dangerX * 0.03 - d * 0.08;
              if (score > bestMarkScore) { bestMarkScore = score; markTarget = opp; }
            }
            if (markTarget) {
              // Shadow ~0.6s ahead of the runner, blending toward tracking as they get closer
              const predicted = markTarget.position.add(markTarget.velocity.scale(0.6));
              const clamped = clampToPitch(predicted);
              const closeness = Math.max(0, 1 - p.position.distanceTo(markTarget.position) / 18);
              const blend = 0.4 + closeness * 0.45; // 40%–85% toward runner
              moveTarget = new Vec2(
                moveTarget.x * (1 - blend) + clamped.x * blend,
                moveTarget.y * (1 - blend) + clamped.y * blend,
              );
            }
          }

          // If already close to target, settle (zero velocity avoids jitter
          // that makes pass-leading overshoot)
          const distToTarget = p.position.distanceTo(moveTarget);
          if (distToTarget < 2) {
            updatedPlayers[i] = { ...p, velocity: Vec2.zero() };
          } else {
            const desired = arrive(p.position, moveTarget, maxSpeed, 5.0);
            const newVel = clampVelocity(desired, maxSpeed);
            const dtSec = dt / 1000;
            const newPos = p.position.add(newVel.scale(dtSec));
            updatedPlayers[i] = {
              ...p,
              position: clampToPitch(newPos),
              velocity: newVel,
            };
          }
          break;
        }

        case 'PRESS': {
          // Pursuit of ball carrier or ball position
          let pressTarget = ball.position;

          // GK containment: clamp press target to penalty area bounds
          if (p.role === 'GK') {
            const paDepth = 16.5;
            const paCenterY = PITCH_HEIGHT / 2;
            const paHalfWidth = 20.16;
            if (p.teamId === 'home') {
              pressTarget = new Vec2(
                Math.min(pressTarget.x, paDepth),
                Math.max(paCenterY - paHalfWidth, Math.min(paCenterY + paHalfWidth, pressTarget.y)),
              );
            } else {
              pressTarget = new Vec2(
                Math.max(PITCH_WIDTH - paDepth, pressTarget.x),
                Math.max(paCenterY - paHalfWidth, Math.min(paCenterY + paHalfWidth, pressTarget.y)),
              );
            }
          }

          // Use arrive (decelerate) when close to prevent seek→separation oscillation
          const pressDist = p.position.distanceTo(pressTarget);
          const desired = pressDist < 5
            ? arrive(p.position, pressTarget, maxSpeed, 3.0)
            : seek(p.position, pressTarget, maxSpeed);
          const newVel = clampVelocity(desired, maxSpeed);
          const dtSec = dt / 1000;
          const newPos = p.position.add(newVel.scale(dtSec));
          updatedPlayers[i] = {
            ...p,
            position: clampToPitch(newPos),
            velocity: newVel,
          };
          break;
        }

        case 'MAKE_RUN': {
          // Ball intercept: when ball is loose and moving, run to meet it
          // rather than continuing a CSP run that won't align with ball trajectory.
          let runTarget: Vec2;
          if (ball.carrierId === null && ball.velocity.length() > 2) {
            const travelTime = p.position.distanceTo(ball.position) / Math.max(maxSpeed, 0.1);
            runTarget = clampToPitch(ball.position.add(ball.velocity.scale(travelTime)));
          } else {
            // CSP-based off-ball run: find the best space between defenders
            const allOpponentsForCSP = updatedPlayers.filter(op => op.teamId !== p.teamId);
            const runTeammates = updatedPlayers.filter(tp => tp.teamId === p.teamId && tp.id !== p.id);
            const runCarrier = ball.carrierId ? updatedPlayers.find(cp => cp.id === ball.carrierId) : undefined;
            const runOffsideLine = p.teamId === 'home' ? awayOffsideLine : homeOffsideLine;
            runTarget = selectBestCSP(p, allOpponentsForCSP, runTeammates, runCarrier, runOffsideLine);
          }

          const desired = seek(p.position, runTarget, maxSpeed);
          const newVel = clampVelocity(desired, maxSpeed);
          const dtSec = dt / 1000;
          const newPos = p.position.add(newVel.scale(dtSec));
          updatedPlayers[i] = {
            ...p,
            position: clampToPitch(newPos),
            velocity: newVel,
          };
          break;
        }

        case 'PASS_FORWARD':
        case 'PASS_SAFE': {
          if (ball.carrierId === p.id && nextTick >= this.carrierKickLockoutUntil) {
            // Find a target teammate — factor in lane clearance to avoid interceptions
            const teammates = updatedPlayers.filter(tp => tp.teamId === p.teamId && tp.id !== p.id);
            const opponents = updatedPlayers.filter(op => op.teamId !== p.teamId);
            let target = teammates[0];
            if (intent.action === 'PASS_FORWARD') {
              // Progressive passing: score teammates by advancement gain vs distance,
              // penalising targets with blocked lanes.
              const passerAdvance = p.teamId === 'home' ? p.position.x : (PITCH_WIDTH - p.position.x);
              let bestScore = -Infinity;
              for (const tm of teammates) {
                const tmAdvance = p.teamId === 'home' ? tm.position.x : (PITCH_WIDTH - tm.position.x);
                const advGain = tmAdvance - passerAdvance; // positive = further up pitch
                const dist = p.position.distanceTo(tm.position);
                // Only consider teammates who are more advanced or within 10m laterally
                if (advGain < -10) continue;
                // Score: advancement gain bonus, penalised by distance.
                // Sweet spot is ~15-25m ahead, with distance penalty kicking in hard past 30m.
                const advScore = Math.min(advGain / 20, 1.5); // caps at 30m gain
                const distPenalty = dist > 15 ? (dist - 15) / 30 : 0; // penalty starts at 15m
                // Lane clearance: penalise targets with opponents in the passing lane
                const laneClear = passLaneClearance(p.position, tm.position, opponents);
                const score = advScore - distPenalty + (laneClear - 0.5) * 1.2;
                if (score > bestScore) {
                  bestScore = score;
                  target = tm;
                }
              }
              // Fallback: if no forward target found (all behind), pick nearest with best lane
              if (bestScore === -Infinity) {
                let bestFallback = -Infinity;
                for (const tm of teammates) {
                  const d = p.position.distanceTo(tm.position);
                  const laneClear = passLaneClearance(p.position, tm.position, opponents);
                  const score = -d + laneClear * 15;
                  if (score > bestFallback) { bestFallback = score; target = tm; }
                }
              }
            } else {
              // PASS_SAFE: nearest teammate, weighted by lane clearance
              let bestScore = -Infinity;
              for (const tm of teammates) {
                const d = p.position.distanceTo(tm.position);
                const laneClear = passLaneClearance(p.position, tm.position, opponents);
                // Score: prefer close + clear lane. Blocked lanes heavily penalised.
                const score = -d + laneClear * 15;
                if (score > bestScore) {
                  bestScore = score;
                  target = tm;
                }
              }
            }

            if (target) {
              const passDist = p.position.distanceTo(target.position);

              // Lead the target: aim where the receiver will be when the ball arrives.
              // Applies to all passes where receiver is moving (>1.5 m/s), any distance >8m.
              let aimPos = target.position;
              const receiverSpeed = target.velocity.length();
              if (passDist > 8 && receiverSpeed > 1.5) {
                const travelTime = passDist / TUNING.passSpeed;
                const leadDist = receiverSpeed * travelTime * TUNING.passLeadFactor;
                const leadDir = target.velocity.scale(1 / receiverSpeed); // unit direction
                aimPos = target.position.add(leadDir.scale(leadDist));
              }

              // Compute base pass direction
              let passDir = aimPos.subtract(p.position);
              const passLen = passDir.length();
              if (passLen > 0.01) passDir = passDir.scale(1 / passLen);

              // Pass lane nudge: if an opponent is near the pass line, rotate away.
              // Finds the closest blocker and applies a single rotation to avoid them.
              let worstPerp = Infinity;
              let worstSide = 0;
              for (const opp of opponents) {
                const toOpp = opp.position.subtract(p.position);
                const proj = toOpp.dot(passDir); // how far along the pass line
                if (proj < 2 || proj > passDist - 2) continue; // behind passer or past target
                const cross = toOpp.x * passDir.y - toOpp.y * passDir.x;
                const perp = Math.abs(cross); // perpendicular distance
                if (perp < 5 && perp < worstPerp) {
                  worstPerp = perp;
                  worstSide = cross > 0 ? -1 : 1;
                }
              }
              if (worstPerp < 5) {
                // Rotate away from closest blocker — angle scales with proximity
                const angle = worstSide * (0.18 + (1 - worstPerp / 5) * 0.14); // 10°–18°
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                passDir = new Vec2(passDir.x * cos - passDir.y * sin, passDir.x * sin + passDir.y * cos);
              }

              // Loft long passes: add vertical velocity for passes > 20m
              // Short passes stay on the ground; long passes arc over defenders
              const loftVz = passDist > 20 ? 4 + (passDist - 20) * 0.15 : 0;

              ball = {
                ...ball,
                velocity: passDir.scale(TUNING.passSpeed),
                vz: loftVz,
                carrierId: null,
              };
              // Passer becomes stationary briefly
              updatedPlayers[i] = { ...p, velocity: Vec2.zero() };
              // Prevent passer from immediately re-picking up the ball
              this.lastKickerId = p.id;
              this.lastTouchTeamId = p.teamId;
              this.kickCooldownUntil = nextTick + 10; // ~0.33s at 30 ticks/sec
              // Global cooldown: ball must travel before anyone picks up (prevents possession loops)
              this.pickupCooldownUntil = nextTick + 16;
              // Record actual pass event
              this.statsAccumulator.recordPass(p.teamId);
              this.gameLog.recordPass(nextTick, p.teamId, p.id, p.role,
                p.position.x, p.position.y, target.position.x, target.position.y,
                target.id, intent.action === 'PASS_FORWARD' ? 'forward' : 'safe',
                passDist);
              // Track pending pass for completion detection
              this.pendingPassPlayerId = p.id;
              this.pendingPassTeamId = p.teamId;
              this.lastKickWasShot = false;
              // Snapshot offside line at moment of pass for offside detection
              const defendingTeam: TeamId = p.teamId === 'home' ? 'away' : 'home';
              this.offsideLineAtKick = computeDefensiveLine(updatedPlayers, defendingTeam, current.ball.position.x);
              this.offsideKickTeam = p.teamId;
              this.offsideActive = true;
            }
          }
          break;
        }

        case 'PASS_THROUGH': {
          // Through-ball: play the ball into space ahead of a running teammate
          if (ball.carrierId === p.id && nextTick >= this.carrierKickLockoutUntil) {
            const teammates = updatedPlayers.filter(tp => tp.teamId === p.teamId && tp.id !== p.id);
            const opponents = updatedPlayers.filter(op => op.teamId !== p.teamId);
            const forwardSign = p.teamId === 'home' ? 1 : -1;
            const goalX = p.teamId === 'home' ? PITCH_WIDTH : 0;

            // Find best runner: teammate moving toward goal with space ahead
            let bestRunner: PlayerState | null = null;
            let bestRunScore = -Infinity;
            for (const tm of teammates) {
              const forwardVel = tm.velocity.x * forwardSign;
              if (forwardVel < 2) continue; // must be running forward
              // Must be more advanced than passer
              const tmAdvance = Math.abs(tm.position.x - goalX);
              const selfAdvance = Math.abs(p.position.x - goalX);
              if (tmAdvance > selfAdvance) continue;
              // Check space ahead of runner
              let spaceAhead = 40;
              for (const opp of opponents) {
                const oppAhead = (opp.position.x - tm.position.x) * forwardSign;
                if (oppAhead > 0) {
                  const d = tm.position.distanceTo(opp.position);
                  if (d < spaceAhead) spaceAhead = d;
                }
              }
              const score = forwardVel * 0.3 + spaceAhead * 0.2 - Math.abs(tm.position.x - goalX) * 0.01;
              if (score > bestRunScore) { bestRunScore = score; bestRunner = tm; }
            }

            if (bestRunner) {
              // Compute lead point: where the runner will be in ~1s
              const runSpeed = bestRunner.velocity.length();
              const leadTime = Math.min(1.5, runSpeed > 0.1 ? 20 / Math.max(runSpeed, 3) : 1.0);
              const leadPoint = bestRunner.position.add(bestRunner.velocity.scale(leadTime));
              const clampedLead = clampToPitch(leadPoint);

              let passDir = clampedLead.subtract(p.position);
              const passDist = passDir.length();
              if (passDist > 0.01) passDir = passDir.scale(1 / passDist);

              // Through-balls are ground passes (stay low to run onto)
              const loftVz = passDist > 25 ? 3 + (passDist - 25) * 0.1 : 0;

              ball = {
                ...ball,
                velocity: passDir.scale(TUNING.passSpeed * 1.05), // slightly harder to reach space
                vz: loftVz,
                carrierId: null,
              };
              updatedPlayers[i] = { ...p, velocity: Vec2.zero() };
              this.lastKickerId = p.id;
              this.lastTouchTeamId = p.teamId;
              this.kickCooldownUntil = nextTick + 10;
              this.pickupCooldownUntil = nextTick + 16;
              this.statsAccumulator.recordPass(p.teamId);
              this.gameLog.recordPass(nextTick, p.teamId, p.id, p.role,
                p.position.x, p.position.y, clampedLead.x, clampedLead.y,
                bestRunner.id, 'forward', passDist);
              this.pendingPassPlayerId = p.id;
              this.pendingPassTeamId = p.teamId;
              this.lastKickWasShot = false;
              // Snapshot offside line for through-ball
              const defendingTeam: TeamId = p.teamId === 'home' ? 'away' : 'home';
              this.offsideLineAtKick = computeDefensiveLine(updatedPlayers, defendingTeam, current.ball.position.x);
              this.offsideKickTeam = p.teamId;
              this.offsideActive = true;
            } else {
              // No runner found — fallback to safe pass behavior
              // (carrier holds ball, will re-evaluate next tick)
            }
          }
          break;
        }

        case 'SHOOT': {
          if (ball.carrierId === p.id && nextTick >= this.carrierKickLockoutUntil) {
            const goalX = p.teamId === 'home' ? PITCH_WIDTH : 0;
            const goalY = PITCH_HEIGHT / 2 + (this.rng() - 0.5) * 4; // slight randomness
            const shootDir = new Vec2(goalX, goalY).subtract(p.position).normalize();

            // Check if GK is advanced — chip/lob over them
            const oppPlayers = updatedPlayers.filter(op => op.teamId !== p.teamId);
            const gk = oppPlayers.find(op => op.role === 'GK');
            let shotVz = 2 + this.rng() * 3; // default loft
            if (gk) {
              const gkDistFromGoal = Math.abs(gk.position.x - goalX);
              const distToGoal = Math.abs(p.position.x - goalX);
              // If GK is off their line and between shooter and goal, lob higher
              if (gkDistFromGoal > 5 && gkDistFromGoal < distToGoal) {
                shotVz = 4 + gkDistFromGoal * 0.3 + this.rng() * 2;
              }
            }

            ball = {
              ...ball,
              velocity: shootDir.scale(TUNING.shootSpeed),
              carrierId: null,
              vz: shotVz,
            };
            updatedPlayers[i] = { ...p, velocity: Vec2.zero() };
            this.lastKickerId = p.id;
            this.lastTouchTeamId = p.teamId;
            this.kickCooldownUntil = nextTick + 10;
            this.pickupCooldownUntil = nextTick + 12;
            // Record actual shot event
            const distToGoal = Math.abs(p.position.x - goalX);
            this.statsAccumulator.recordShot(p.teamId);
            this.gameLog.recordShot(nextTick, p.teamId, p.id, p.role,
              p.position.x, p.position.y, distToGoal);
            // Also clear pending pass (shot supersedes any pending pass)
            this.pendingPassPlayerId = null;
            this.pendingPassTeamId = null;
            // On-target check: would the ball pass through the goal frame (between posts, under bar)?
            // Goal posts at y = PITCH_HEIGHT/2 ± 3.66, crossbar at 2.44m height
            const CROSSBAR_H = 2.44;
            const timeToGoal = distToGoal / Math.max(Math.abs(ball.velocity.x), 0.1);
            const zAtGoal = shotVz * timeToGoal - 0.5 * 9.8 * timeToGoal * timeToGoal;
            // goalY is always between posts (aim randomness is ±2m from center, posts are ±3.66m)
            const onTarget = zAtGoal >= 0 && zAtGoal <= CROSSBAR_H;
            if (onTarget) {
              this.statsAccumulator.recordShotOnTarget(p.teamId);
              this.gameLog.recordShotOnTarget(p.id);
            }
            this.lastKickWasShot = true;
          }
          break;
        }

        case 'DRIBBLE': {
          if (ball.carrierId === p.id) {
            this.lastTouchTeamId = p.teamId;
            // Move toward opponent goal, steering around nearby defenders
            const opponentGoalX = p.teamId === 'home' ? PITCH_WIDTH : 0;
            const forwardDir = new Vec2(opponentGoalX - p.position.x, 0).normalize();

            let dribbleDir = forwardDir;

            // Find nearest opponent and evade if close
            const opponents = updatedPlayers.filter(op => op.teamId !== p.teamId);
            let nearestOpp: PlayerState | null = null;
            let nearestDist = Infinity;
            for (const opp of opponents) {
              const d = p.position.distanceTo(opp.position);
              if (d < nearestDist) { nearestDist = d; nearestOpp = opp; }
            }

            if (nearestOpp && nearestDist < 8) {
              // Steer perpendicular to the defender direction (go around them)
              const toDefender = nearestOpp.position.subtract(p.position);
              const perp1 = new Vec2(-toDefender.y, toDefender.x).normalize();
              const perp2 = new Vec2(toDefender.y, -toDefender.x).normalize();
              // Pick the perpendicular that maintains more forward progress
              const evasionDir = perp1.dot(forwardDir) > perp2.dot(forwardDir) ? perp1 : perp2;
              // Closer defender = stronger evasion (60% evasion at 0m, 0% at 8m)
              const evasionWeight = Math.max(0, (8 - nearestDist) / 8) * 0.6;
              dribbleDir = forwardDir.scale(1 - evasionWeight).add(evasionDir.scale(evasionWeight)).normalize();
            }

            const newVel = dribbleDir.scale(maxSpeed * TUNING.dribbleSpeedRatio);
            const dtSec = dt / 1000;
            const newPos = p.position.add(newVel.scale(dtSec));
            const clampedPos = clampToPitch(newPos);

            // Ball follows dribbler (clamped to pitch to avoid triggering out-of-play)
            ball = {
              ...ball,
              position: clampToPitch(clampedPos.add(dribbleDir.scale(TUNING.controlRadius * 0.8))),
              velocity: newVel,
            };
            updatedPlayers[i] = {
              ...p,
              position: clampedPos,
              velocity: newVel,
            };
          }
          break;
        }

        case 'HOLD_SHIELD': {
          if (ball.carrierId === p.id) {
            // Hold position, no ball velocity change
            updatedPlayers[i] = { ...p, velocity: Vec2.zero() };
          }
          break;
        }

        default:
          // For any unhandled action, move to formation anchor
          {
            const desired = arrive(p.position, p.formationAnchor, maxSpeed * 0.5, 5.0);
            const newVel = clampVelocity(desired, maxSpeed * 0.5);
            const dtSec = dt / 1000;
            const newPos = p.position.add(newVel.scale(dtSec));
            updatedPlayers[i] = {
              ...p,
              position: clampToPitch(newPos),
              velocity: newVel,
            };
          }
          break;
      }
    }

    // 10c. Ball carrier position sync: if ball has a carrier, keep ball with player
    if (ball.carrierId !== null) {
      const carrier = updatedPlayers.find(p => p.id === ball.carrierId);
      if (carrier) {
        // If carrier is using DRIBBLE, ball was already moved; otherwise keep at carrier
        const carrierIntent = intents.find(i => i.agentId === ball.carrierId);
        if (carrierIntent?.action !== 'DRIBBLE') {
          ball = { ...ball, position: carrier.position, velocity: Vec2.zero() };
        }
      } else {
        // Carrier not found — release ball
        ball = { ...ball, carrierId: null };
      }
    }

    // ── 10d. Tackle resolution ──────────────────────────────────────────────
    // Defenders pressing within range attempt to dispossess the ball carrier.
    // Uses resolveTackle() from contact.ts with a per-player cooldown to prevent spam.
    // Blocked briefly after dead ball restarts (corner, throw-in, etc.) to let taker deliver.
    if (ball.carrierId !== null && nextTick >= this.restartProtectionUntil) {
      const carrier = updatedPlayers.find(p => p.id === ball.carrierId);
      if (carrier) {
        for (let i = 0; i < updatedPlayers.length; i++) {
          const p = updatedPlayers[i]!;
          // Only opponents
          if (p.teamId === carrier.teamId) continue;
          // Only players who chose PRESS
          if (intents[i]?.action !== 'PRESS') continue;

          const dist = p.position.distanceTo(carrier.position);
          if (dist > 4.0) continue; // MAX_TACKLE_REACH

          // Cooldown: 30 ticks (~1s) between tackle attempts per player
          const cooldownExpiry = this.tackleCooldowns.get(p.id) ?? 0;
          if (nextTick < cooldownExpiry) continue;
          this.tackleCooldowns.set(p.id, nextTick + 30);

          // Record the tackle attempt in stats
          this.statsAccumulator.recordTackle(p.teamId);

          // Check shielding — carrier body blocks the challenge
          if (isShielded(carrier, p, ball.position)) {
            this.gameLog.recordTackle(nextTick, p.teamId, p.id, p.role,
              p.position.x, p.position.y, carrier.id, false);
            continue;
          }

          const result = resolveTackle(p, carrier, this.rng);

          if (result.success) {
            this.gameLog.recordTackle(nextTick, p.teamId, p.id, p.role,
              p.position.x, p.position.y, carrier.id, true);
            // Tackler touched the ball last
            this.lastTouchTeamId = p.teamId;
            // Ball knocked loose — add lateral component so it goes sideways, not just back
            const knockBase = p.position.subtract(carrier.position).normalize();
            const lateralSign = this.rng() > 0.5 ? 1 : -1;
            const knockDir = new Vec2(
              knockBase.x * 0.6 + (-knockBase.y) * lateralSign * 0.4,
              knockBase.y * 0.6 + knockBase.x * lateralSign * 0.4,
            ).normalize();
            ball = {
              ...ball,
              carrierId: null,
              velocity: knockDir.scale(8 + this.rng() * 5),
            };
            // Prevent dispossessed player from immediately re-picking up (breaks tackle chains)
            this.lastKickerId = carrier.id;
            this.kickCooldownUntil = nextTick + 25;
            this.pickupCooldownUntil = nextTick + 25; // longer cooldown lets ball clear congested zone
            // Also cool down the tackler so they don't immediately re-engage
            this.tackleCooldowns.set(p.id, nextTick + 45);
            // Push both players apart physically to prevent immediate re-engagement
            const sepDir = carrier.position.subtract(p.position).normalize();
            const carrierIdx = updatedPlayers.findIndex(up => up.id === carrier.id);
            if (carrierIdx >= 0) {
              updatedPlayers[carrierIdx] = {
                ...updatedPlayers[carrierIdx]!,
                velocity: sepDir.scale(3),
              };
            }
            updatedPlayers[i] = { ...p, velocity: Vec2.zero() };
            break; // One successful tackle per tick
          }

          if (result.foul) {
            // Foul: ball released at carrier position (simplified free kick)
            ball = {
              ...ball,
              carrierId: null,
              velocity: Vec2.zero(),
            };
            break;
          }
        }
      }
    }

    // ── 11. Separation forces ─────────────────────────────────────────────────
    // Post-process: apply separation to prevent overlapping
    for (let i = 0; i < updatedPlayers.length; i++) {
      const p = updatedPlayers[i]!;
      const neighborPositions = updatedPlayers
        .filter((_op, j) => j !== i)
        .map(op => op.position);

      const sepForce = separation(p.position, neighborPositions, TUNING.separationRadius);

      if (sepForce.length() > 0.001) {
        const dtSec = dt / 1000;
        const correctedPos = clampToPitch(
          p.position.add(sepForce.scale(TUNING.separationScale * dtSec))
        );
        updatedPlayers[i] = { ...p, position: correctedPos };
      }
    }

    // ── 12. Integrate ball physics ────────────────────────────────────────────
    // Only integrate if ball has no carrier (carried balls move with player)
    if (ball.carrierId === null) {
      ball = integrateBall(ball, dt, TUNING.ballGroundFriction, TUNING.ballAirDrag);
    }

    // ── 13. Check for goals ───────────────────────────────────────────────────
    const scoringTeam = checkGoal(ball);
    let score = current.score;
    const events = [...phaseResult.events, ...tickEvents];

    if (scoringTeam !== null) {
      const afterGoal = applyGoal({ ...current, ball }, scoringTeam);
      ball = afterGoal.ball;
      score = afterGoal.score;

      // Log the goal — find the last kicker as the scorer
      const scorerId = this.lastKickerId ?? 'unknown';
      const scorer = updatedPlayers.find(p => p.id === scorerId);

      // Every goal is a shot on target. If the kick wasn't a SHOOT action (e.g. a pass
      // that went in), retroactively record a shot + on-target for the scorer.
      if (!this.lastKickWasShot && scorer) {
        this.statsAccumulator.recordShot(scorer.teamId);
        this.gameLog.recordShot(nextTick, scorer.teamId, scorerId, scorer.role,
          scorer.position.x, scorer.position.y,
          Math.abs(scorer.position.x - (scorer.teamId === 'home' ? PITCH_WIDTH : 0)));
        this.statsAccumulator.recordShotOnTarget(scorer.teamId);
        this.gameLog.recordShotOnTarget(scorerId);
      }

      this.gameLog.recordGoal(nextTick, scoringTeam, scorerId, scorer?.role ?? '??',
        scorer?.position.x ?? ball.position.x, scorer?.position.y ?? ball.position.y,
        score as [number, number]);

      const goalPhaseResult = advancePhase(current.matchPhase, nextTick, true);
      events.push(...goalPhaseResult.events);

      // Enter kickoff dead ball — team that conceded kicks off
      const kickoffTeam: TeamId = scoringTeam === 'home' ? 'away' : 'home';
      const center = new Vec2(PITCH_WIDTH / 2, PITCH_HEIGHT / 2);
      ball = { ...ball, position: center, velocity: Vec2.zero(), z: 0, vz: 0, carrierId: null };
      this._enterDeadBall({
        type: RestartType.KICKOFF,
        position: center,
        teamId: kickoffTeam,
        tickStarted: nextTick,
        repositionTicks: TUNING.kickoffPauseTicks,
        takerId: this._findTaker(RestartType.KICKOFF, kickoffTeam, center, updatedPlayers),
      });

      const newSnapshot: SimSnapshot = {
        tick: nextTick,
        timestamp: current.timestamp + dt,
        ball,
        players: updatedPlayers,
        matchPhase: goalPhaseResult.phase,
        score,
        events,
        stats: this.statsAccumulator.getSnapshot(),
        deadBallInfo: { type: RestartType.KICKOFF, teamId: kickoffTeam, position: center },
      };
      this.snapshot = newSnapshot;
      return newSnapshot;
    }

    // ── 13b. Ball out of play — throw-ins, corners, goal kicks ────────────────
    // Check goal line first (x boundary), then sideline (y boundary)
    if (ball.carrierId === null) {
      const outX = ball.position.x < 0 || ball.position.x > PITCH_WIDTH;
      const outY = ball.position.y < 0 || ball.position.y > PITCH_HEIGHT;

      // Clear pending pass on any out-of-play
      if (outX || outY) {
        this.pendingPassPlayerId = null;
        this.pendingPassTeamId = null;
      }

      if (outX) {
        // Ball crossed goal line but NOT a goal (goal check was above)
        const isLeftGoalLine = ball.position.x < 0;
        const defendingTeam: TeamId = isLeftGoalLine ? 'home' : 'away';
        // Default to defending team if no touch tracked (edge case at match start)
        const lastTouch = this.lastTouchTeamId ?? defendingTeam;

        if (lastTouch === defendingTeam) {
          // Defending team touched last → corner kick for attacking team
          const attackingTeam: TeamId = defendingTeam === 'home' ? 'away' : 'home';
          const cornerY = ball.position.y < PITCH_HEIGHT / 2 ? 0 : PITCH_HEIGHT;
          const cornerX = isLeftGoalLine ? 0 : PITCH_WIDTH;
          const cornerPos = new Vec2(cornerX, cornerY);

          this.statsAccumulator.recordCorner(attackingTeam);
          const taker = this._findTaker(RestartType.CORNER, attackingTeam, cornerPos, updatedPlayers);
          const takerPlayer = updatedPlayers.find(p => p.id === taker);
          this.gameLog.recordCorner(nextTick, attackingTeam, taker ?? '', takerPlayer?.role ?? '', cornerX, cornerY);

          ball = { ...ball, position: cornerPos, velocity: Vec2.zero(), z: 0, vz: 0, carrierId: null };
          this._enterDeadBall({
            type: RestartType.CORNER,
            position: cornerPos,
            teamId: attackingTeam,
            tickStarted: nextTick,
            repositionTicks: TUNING.cornerPauseTicks,
            takerId: taker,
          });
        } else {
          // Attacking team touched last → goal kick for defending team
          const gkX = isLeftGoalLine ? 6 : PITCH_WIDTH - 6;
          const gkPos = new Vec2(gkX, PITCH_HEIGHT / 2);

          this.statsAccumulator.recordGoalKick(defendingTeam);
          const taker = this._findTaker(RestartType.GOAL_KICK, defendingTeam, gkPos, updatedPlayers);
          const takerPlayer = updatedPlayers.find(p => p.id === taker);
          this.gameLog.recordGoalKick(nextTick, defendingTeam, taker ?? '', takerPlayer?.role ?? '', gkX, PITCH_HEIGHT / 2);

          ball = { ...ball, position: gkPos, velocity: Vec2.zero(), z: 0, vz: 0, carrierId: null };
          this._enterDeadBall({
            type: RestartType.GOAL_KICK,
            position: gkPos,
            teamId: defendingTeam,
            tickStarted: nextTick,
            repositionTicks: TUNING.goalKickPauseTicks,
            takerId: taker,
          });
        }

        const dbInfo: DeadBallInfo = { type: this.deadBall!.type, teamId: this.deadBall!.teamId, position: this.deadBall!.position };
        const newSnapshot: SimSnapshot = {
          tick: nextTick,
          timestamp: current.timestamp + dt,
          ball,
          players: updatedPlayers,
          matchPhase: phaseResult.phase,
          score,
          events,
          stats: this.statsAccumulator.getSnapshot(),
          deadBallInfo: dbInfo,
        };
        this.snapshot = newSnapshot;
        return newSnapshot;
      }

      if (outY) {
        // Ball crossed sideline → throw-in
        const outYPos = ball.position.y < 0 ? 0 : PITCH_HEIGHT;
        const outXPos = Math.max(0, Math.min(PITCH_WIDTH, ball.position.x));
        // Default to away gets throw-in if no touch tracked
        const lastTouch = this.lastTouchTeamId ?? 'home';
        const throwTeam: TeamId = lastTouch === 'home' ? 'away' : 'home';
        const throwPos = new Vec2(outXPos, outYPos);

        this.statsAccumulator.recordThrowIn(throwTeam);
        const taker = this._findTaker(RestartType.THROW_IN, throwTeam, throwPos, updatedPlayers);
        const takerPlayer = updatedPlayers.find(p => p.id === taker);
        this.gameLog.recordThrowIn(nextTick, throwTeam, taker ?? '', takerPlayer?.role ?? '', outXPos, outYPos);

        ball = { ...ball, position: throwPos, velocity: Vec2.zero(), z: 0, vz: 0, carrierId: null };
        this._enterDeadBall({
          type: RestartType.THROW_IN,
          position: throwPos,
          teamId: throwTeam,
          tickStarted: nextTick,
          repositionTicks: TUNING.throwInPauseTicks,
          takerId: taker,
        });

        const dbInfo: DeadBallInfo = { type: this.deadBall!.type, teamId: this.deadBall!.teamId, position: this.deadBall!.position };
        const newSnapshot: SimSnapshot = {
          tick: nextTick,
          timestamp: current.timestamp + dt,
          ball,
          players: updatedPlayers,
          matchPhase: phaseResult.phase,
          score,
          events,
          stats: this.statsAccumulator.getSnapshot(),
          deadBallInfo: dbInfo,
        };
        this.snapshot = newSnapshot;
        return newSnapshot;
      }
    }

    // ── 14. Accumulate match statistics ───────────────────────────────────────
    const ballCarrierTeamId: TeamId | null = ball.carrierId
      ? (updatedPlayers.find(p => p.id === ball.carrierId)?.teamId ?? null)
      : null;
    this.statsAccumulator.recordPossession(ballCarrierTeamId);
    for (let i = 0; i < intents.length; i++) {
      const intent = intents[i]!;
      const teamId = updatedPlayers.find(p => p.id === intent.agentId)?.teamId;
      if (teamId) this.statsAccumulator.recordIntent(intent, teamId);
    }

    // ── 15. Produce new snapshot ──────────────────────────────────────────────
    const newSnapshot: SimSnapshot = {
      tick: nextTick,
      timestamp: current.timestamp + dt,
      ball,
      players: updatedPlayers,
      matchPhase: phaseResult.phase,
      score,
      events,
      stats: this.statsAccumulator.getSnapshot(),
    };

    this.snapshot = newSnapshot;
    return newSnapshot;
  }

  /** Returns the latest snapshot without advancing the simulation. */
  getCurrentSnapshot(): SimSnapshot {
    return this.snapshot;
  }

  /** Returns the decision log for external access (e.g., debug overlay). */
  getDecisionLog(): DecisionLog {
    return this.decisionLog;
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Compute the x-coordinate of the press activation line for a team.
 * Ball must be on the "own side" of this line for pressing to be fully active.
 * low = own third only, mid = own half, high = full pitch.
 */
function _pressActivationX(height: 'low' | 'mid' | 'high', teamId: TeamId): number {
  // Home presses toward x=105 (opponent goal), away toward x=0
  if (teamId === 'home') {
    switch (height) {
      case 'low': return 35;   // only press in own third
      case 'mid': return 52;   // press in own half
      case 'high': return 105; // press anywhere
    }
  } else {
    switch (height) {
      case 'low': return 70;   // mirror: 105 - 35
      case 'mid': return 53;   // mirror: 105 - 52
      case 'high': return 0;   // press anywhere
    }
  }
}

function clampToPitch(pos: Vec2): Vec2 {
  return new Vec2(
    Math.max(0, Math.min(PITCH_WIDTH, pos.x)),
    Math.max(0, Math.min(PITCH_HEIGHT, pos.y)),
  );
}

/**
 * Compute how clear the passing lane is between passer and target.
 * Returns 1.0 for a completely clear lane, 0.0 for totally blocked.
 * Checks all opponents and returns the worst blockage.
 */
function passLaneClearance(
  passerPos: Vec2,
  targetPos: Vec2,
  opponents: readonly PlayerState[],
): number {
  const passVec = targetPos.subtract(passerPos);
  const passDist = passVec.length();
  if (passDist < 1) return 1.0;
  const dir = passVec.scale(1 / passDist);

  let clearance = 1.0;
  for (const opp of opponents) {
    const toOpp = opp.position.subtract(passerPos);
    const proj = toOpp.dot(dir); // distance along pass line
    if (proj < 2 || proj > passDist - 2) continue; // behind passer or past target
    const perp = Math.abs(toOpp.x * dir.y - toOpp.y * dir.x); // perpendicular distance
    if (perp < 5) {
      // 0m perp = fully blocked (0.0), 5m perp = clear (1.0)
      const oppClearance = perp / 5;
      if (oppClearance < clearance) clearance = oppClearance;
    }
  }
  return clearance;
}

// ============================================================
// Vision system
// ============================================================

/**
 * Compute how many ticks between vision refreshes based on anticipation.
 * High anticipation (≥0.85) → every tick. Low anticipation (≤0.3) → every 6 ticks.
 */
function visionRefreshInterval(anticipation: number): number {
  const high = TUNING.visionAnticipationHighThreshold;
  const low = TUNING.visionAnticipationLowThreshold;
  const maxInterval = TUNING.visionRefreshMaxInterval;
  if (anticipation >= high) return 1;
  if (anticipation <= low) return maxInterval;
  // Linear interpolation between
  const t = (anticipation - low) / (high - low);
  return Math.round(maxInterval + t * (1 - maxInterval));
}

/**
 * Filter opponents by a player's vision radius, facing direction, and blind spot.
 * - Always visible if within close range (5m)
 * - Invisible if beyond vision radius
 * - Blind spot: opponents behind the player (dot product < threshold) are invisible unless close
 */
function filterOpponentsByVision(
  player: PlayerState,
  opponents: readonly PlayerState[],
  effectiveVision: number,
): PlayerState[] {
  const { visionRadiusMin, visionRadiusMax, visionBlindSpotDot, visionCloseRange } = TUNING;
  const radius = visionRadiusMin + effectiveVision * (visionRadiusMax - visionRadiusMin);

  // Facing direction: derived from velocity, or default facing opponent goal when stationary
  let facing: Vec2;
  if (player.velocity.length() > 0.1) {
    facing = player.velocity.normalize();
  } else {
    // Face opponent goal
    const goalX = player.teamId === 'home' ? PITCH_WIDTH : 0;
    facing = new Vec2(goalX - player.position.x, 0).normalize();
  }

  return opponents.filter(opp => {
    const toOpp = opp.position.subtract(player.position);
    const dist = toOpp.length();

    // Always visible at close range
    if (dist < visionCloseRange) return true;
    // Beyond vision radius → invisible
    if (dist > radius) return false;
    // Check blind spot: opponent behind player
    const dot = dist > 0.01 ? toOpp.scale(1 / dist).dot(facing) : 0;
    return dot >= visionBlindSpotDot;
  });
}

// ============================================================
// CSP (Candidate Space Points) — off-ball movement
// ============================================================

/**
 * Generate candidate space points in a forward arc around the player.
 * 3 distance rings × 4 angles = 12 candidates, clamped to pitch boundaries.
 */
function generateCSPs(playerPos: Vec2, teamId: TeamId): Vec2[] {
  const { cspDist1, cspDist2, cspDist3, cspAngleSpread, cspAnglesPerRing } = TUNING;
  const distances = [cspDist1, cspDist2, cspDist3];
  const forwardX = teamId === 'home' ? 1 : -1;
  const forward = new Vec2(forwardX, 0);

  const points: Vec2[] = [];
  for (const dist of distances) {
    for (let a = 0; a < cspAnglesPerRing; a++) {
      // Spread angles evenly across [-angleSpread, +angleSpread]
      const t = cspAnglesPerRing > 1 ? a / (cspAnglesPerRing - 1) : 0.5;
      const angle = -cspAngleSpread + t * 2 * cspAngleSpread;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dir = new Vec2(
        forward.x * cos - forward.y * sin,
        forward.x * sin + forward.y * cos,
      );
      const candidate = playerPos.add(dir.scale(dist));
      // Clamp to pitch
      const cx = Math.max(1, Math.min(PITCH_WIDTH - 1, candidate.x));
      const cy = Math.max(1, Math.min(PITCH_HEIGHT - 1, candidate.y));
      points.push(new Vec2(cx, cy));
    }
  }
  return points;
}

/**
 * Score a single CSP based on seam detection, defender proximity,
 * teammate avoidance, forward progress, and passing lane clearance.
 * Uses FULL (not vision-filtered) opponent list for ground-truth evaluation.
 */
function scoreCSP(
  csp: Vec2,
  player: PlayerState,
  opponents: readonly PlayerState[],
  teammates: readonly PlayerState[],
  carrier: PlayerState | undefined,
  offsideLineX?: number,
): number {
  let score = 0;
  const {
    cspSeamMaxDefenderDist, cspSeamMidpointThreshold, cspSeamBonus,
    cspDefenderSafeDistance, cspDefenderPenaltyWeight,
    cspTeammateAvoidRadius, cspTeammateAvoidWeight,
    cspForwardProgressWeight, cspPassingLaneWeight,
  } = TUNING;

  // 1. Seam detection — bonus if point lies between two defenders
  let nearestDist1 = Infinity, nearestDist2 = Infinity;
  let nearest1: PlayerState | null = null, nearest2: PlayerState | null = null;
  for (const opp of opponents) {
    const d = csp.distanceTo(opp.position);
    if (d < nearestDist1) {
      nearestDist2 = nearestDist1; nearest2 = nearest1;
      nearestDist1 = d; nearest1 = opp;
    } else if (d < nearestDist2) {
      nearestDist2 = d; nearest2 = opp;
    }
  }
  if (nearest1 && nearest2 && nearestDist1 < cspSeamMaxDefenderDist && nearestDist2 < cspSeamMaxDefenderDist) {
    const midpoint = nearest1.position.add(nearest2.position).scale(0.5);
    const distToMid = csp.distanceTo(midpoint);
    if (distToMid < cspSeamMidpointThreshold) {
      score += cspSeamBonus;
    }
  }

  // 2. Defender proximity penalty
  if (nearestDist1 < cspDefenderSafeDistance) {
    score -= (1 - nearestDist1 / cspDefenderSafeDistance) * cspDefenderPenaltyWeight;
  }

  // 3. Teammate avoidance — penalty for nearby teammates
  for (const tm of teammates) {
    if (tm.id === player.id) continue;
    const d = csp.distanceTo(tm.position);
    if (d < cspTeammateAvoidRadius) {
      score -= (1 - d / cspTeammateAvoidRadius) * cspTeammateAvoidWeight;
    }
    // Also check projected position (velocity extrapolation ~1s)
    if (tm.velocity.length() > 0.1) {
      const projPos = tm.position.add(tm.velocity); // 1s projection
      const pd = csp.distanceTo(projPos);
      if (pd < cspTeammateAvoidRadius) {
        score -= (1 - pd / cspTeammateAvoidRadius) * cspTeammateAvoidWeight * 0.5;
      }
    }
  }

  // 4. Forward progress bonus
  const goalX = player.teamId === 'home' ? PITCH_WIDTH : 0;
  const currentDist = Math.abs(player.position.x - goalX);
  const cspDist = Math.abs(csp.x - goalX);
  const forwardGain = currentDist - cspDist; // positive = closer to goal
  score += forwardGain * cspForwardProgressWeight;

  // 5. Passing lane clearance from carrier
  if (carrier) {
    const laneScore = passLaneClearance(carrier.position, csp, opponents);
    score += laneScore * cspPassingLaneWeight;
  }

  // 6. Offside penalty — heavily discourage runs into offside positions
  if (offsideLineX !== undefined) {
    const halfX = PITCH_WIDTH / 2;
    if (player.teamId === 'home') {
      // Home attacks right: offside if csp.x > offsideLineX and past halfway
      if (csp.x > halfX && csp.x > offsideLineX + 1) {
        score -= 3.0; // strong penalty to avoid offside runs
      }
    } else {
      // Away attacks left: offside if csp.x < offsideLineX and past halfway
      if (csp.x < halfX && csp.x < offsideLineX - 1) {
        score -= 3.0;
      }
    }
  }

  return score;
}

/**
 * Select the best CSP for a player's off-ball run.
 * Generates candidates, scores each, and returns the highest-scoring point.
 */
function selectBestCSP(
  player: PlayerState,
  opponents: readonly PlayerState[],
  teammates: readonly PlayerState[],
  carrier: PlayerState | undefined,
  offsideLineX?: number,
): Vec2 {
  const candidates = generateCSPs(player.position, player.teamId);
  let bestScore = -Infinity;
  let best = candidates[0]!;
  for (const csp of candidates) {
    const s = scoreCSP(csp, player, opponents, teammates, carrier, offsideLineX);
    if (s > bestScore) {
      bestScore = s;
      best = csp;
    }
  }
  return best;
}
