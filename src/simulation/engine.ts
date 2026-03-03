import type { SimSnapshot, PlayerState, BallState, MatchStats } from './types.ts';
import { Vec2 } from './math/vec2.ts';
import { integrateBall } from './physics/ball.ts';
import { advancePhase } from './match/phases.ts';
import { checkGoal, createInitialSnapshot, applyGoal, getKickoffPositions } from './match/state.ts';
import { MatchPhase } from './types.ts';

// ============================================================
// MatchConfig
// ============================================================

export interface MatchConfig {
  readonly seed: string;
  readonly homeRoster: PlayerState[];
  readonly awayRoster: PlayerState[];
  /** Optional initial ball velocity (m/s) for testing and visual initialization */
  readonly initialBallVelocity?: { x: number; y: number };
  /** Optional initial ball position override for testing */
  readonly initialBallPosition?: { x: number; y: number };
}

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

const ROLES = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'] as const;

/**
 * Creates 22 test players in a 4-4-2 formation for both teams.
 * Used in tests and for the initial visual rendering before real rosters are loaded.
 */
export function createTestRosters(): { home: PlayerState[]; away: PlayerState[] } {
  const homePositions = getKickoffPositions('home');
  const awayPositions = getKickoffPositions('away');

  const home: PlayerState[] = homePositions.map((pos, i) => ({
    id: `home-${i}`,
    teamId: 'home',
    position: pos,
    velocity: Vec2.zero(),
    attributes: { ...DEFAULT_ATTRIBUTES },
    personality: { ...DEFAULT_PERSONALITY },
    fatigue: 0,
    role: ROLES[i] ?? 'CM',
    formationAnchor: pos,
  }));

  const away: PlayerState[] = awayPositions.map((pos, i) => ({
    id: `away-${i}`,
    teamId: 'away',
    position: pos,
    velocity: Vec2.zero(),
    attributes: { ...DEFAULT_ATTRIBUTES },
    personality: { ...DEFAULT_PERSONALITY },
    fatigue: 0,
    role: ROLES[i] ?? 'CM',
    formationAnchor: pos,
  }));

  return { home, away };
}

// ============================================================
// SimulationEngine
// ============================================================

const EMPTY_STATS: MatchStats = {
  possession: [50, 50],
  shots: [0, 0],
  passes: [0, 0],
  tackles: [0, 0],
};

/**
 * The central simulation engine.
 *
 * Each call to tick(dt) produces a new immutable SimSnapshot:
 *   1. Advance match phase (pure, tick-driven)
 *   2. If HALFTIME or FULL_TIME — return early, no physics
 *   3. Integrate ball physics (integrateBall)
 *   4. Check for goals (checkGoal + applyGoal)
 *   5. TODO: Plan 06 — run agent AI (currently stub, players stationary)
 *   6. TODO: Plan 08 — resolve player contacts
 *   7. Return new snapshot
 *
 * getCurrentSnapshot() returns latest snapshot without advancing time.
 */
export class SimulationEngine {
  private snapshot: SimSnapshot;

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
  }

  /**
   * Advance simulation by one tick of dt milliseconds.
   * Returns the new snapshot.
   */
  tick(dt: number): SimSnapshot {
    const current = this.snapshot;
    const nextTick = current.tick + 1;

    // 1. Advance match phase
    const phaseResult = advancePhase(
      current.matchPhase,
      nextTick,
      false, // justScored — determined below after goal check
    );

    // 2. If HALFTIME or FULL_TIME, skip physics — game is paused
    if (
      phaseResult.phase === MatchPhase.HALFTIME ||
      phaseResult.phase === MatchPhase.FULL_TIME
    ) {
      const newSnapshot: SimSnapshot = {
        ...current,
        tick: nextTick,
        timestamp: current.timestamp + dt,
        matchPhase: phaseResult.phase,
        events: [...phaseResult.events],
        stats: EMPTY_STATS,
      };
      this.snapshot = newSnapshot;
      return newSnapshot;
    }

    // 3. Integrate ball physics
    let ball = integrateBall(current.ball, dt);

    // 4. Check for goals
    const scoringTeam = checkGoal(ball);
    let score = current.score;
    const events = [...phaseResult.events];

    if (scoringTeam !== null) {
      // Apply goal: score increment + ball reset to center
      const afterGoal = applyGoal({ ...current, ball }, scoringTeam);
      ball = afterGoal.ball;
      score = afterGoal.score;

      // Re-run advancePhase with justScored=true to get KICKOFF and goal event
      const goalPhaseResult = advancePhase(current.matchPhase, nextTick, true);
      const newSnapshot: SimSnapshot = {
        ...current,
        tick: nextTick,
        timestamp: current.timestamp + dt,
        ball,
        score,
        matchPhase: goalPhaseResult.phase,
        events: [...goalPhaseResult.events],
        stats: EMPTY_STATS,
        // Players stay in current positions — TODO: Plan 06 will move them to kickoff
        players: current.players,
      };
      this.snapshot = newSnapshot;
      return newSnapshot;
    }

    // 5. TODO: Plan 06 — run agent AI for each player
    // const intents = players.map(p => runAgentAI(p, agentContext));
    // Players remain stationary until Plan 06 integrates the utility AI

    // 6. TODO: Plan 08 — resolve player-player contacts (collision response)

    // 7. Produce new snapshot with all accumulated events
    const newSnapshot: SimSnapshot = {
      tick: nextTick,
      timestamp: current.timestamp + dt,
      ball,
      players: current.players, // stationary until Plan 06
      matchPhase: phaseResult.phase,
      score,
      events,
      stats: EMPTY_STATS,
    };

    this.snapshot = newSnapshot;
    return newSnapshot;
  }

  /** Returns the latest snapshot without advancing the simulation. */
  getCurrentSnapshot(): SimSnapshot {
    return this.snapshot;
  }
}
