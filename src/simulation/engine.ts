import type { SimSnapshot, PlayerState, BallState, ActionIntent, AgentContext, TeamId } from './types.ts';
import { Vec2 } from './math/vec2.ts';
import { createRng } from './math/random.ts';
import { integrateBall } from './physics/ball.ts';
import { advancePhase } from './match/phases.ts';
import { checkGoal, createInitialSnapshot, applyGoal, getKickoffPositions, PITCH_WIDTH, PITCH_HEIGHT } from './match/state.ts';
import { MatchPhase, ActionType } from './types.ts';
import { ACTIONS } from './ai/actions.ts';
import { selectAction, evaluateAction } from './ai/agent.ts';
import { PERSONALITY_WEIGHTS } from './ai/personality.ts';
import { accumulateFatigue, applyFatigueToAttributes, applyFatigueToPersonality } from './ai/fatigue.ts';
import { SpatialGrid } from './physics/spatial.ts';
import { seek, arrive, separation, BASE_PLAYER_SPEED, clampVelocity } from './physics/steering.ts';
import { computeFormationAnchors } from './tactical/formation.ts';
import { StatsAccumulator } from './match/stats.ts';
import { DecisionLog } from './ai/decisionLog.ts';
import type { AgentDecisionEntry } from './ai/decisionLog.ts';

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
// Constants
// ============================================================

/** Control radius: how close a player must be to pick up a loose ball */
const CONTROL_RADIUS = 2.5; // metres

/** Separation force radius: minimum distance between players */
const SEPARATION_RADIUS = 2.0; // metres

/** Separation force scale factor applied after intent movement */
const SEPARATION_SCALE = 0.5;

/** Ball kick speed for passes (m/s) */
const PASS_SPEED = 14.0;

/** Ball kick speed for shots (m/s) */
const SHOOT_SPEED = 22.0;


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
    teamId: 'home' as TeamId,
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
    teamId: 'away' as TeamId,
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

/**
 * Creates 22 players with varied archetypes for an interesting match.
 * Home team: maverick striker, metronome midfielder, aggressive defender.
 * Away team: contrasting archetypes for visible behavioral differences.
 */
export function createMatchRosters(): { home: PlayerState[]; away: PlayerState[] } {
  const homePositions = getKickoffPositions('home');
  const awayPositions = getKickoffPositions('away');

  // Archetype definitions
  const archetypes = {
    aggressiveDefender: {
      attributes: { pace: 0.65, strength: 0.80, stamina: 0.75, dribbling: 0.45, passing: 0.60, shooting: 0.45, tackling: 0.82, aerial: 0.78, positioning: 0.70 },
      personality: { directness: 0.35, risk_appetite: 0.3, composure: 0.55, creativity: 0.3, work_rate: 0.85, aggression: 0.85, anticipation: 0.75, flair: 0.25 },
    },
    steadyDefender: {
      attributes: { pace: 0.60, strength: 0.72, stamina: 0.70, dribbling: 0.50, passing: 0.65, shooting: 0.40, tackling: 0.75, aerial: 0.72, positioning: 0.72 },
      personality: { directness: 0.4, risk_appetite: 0.25, composure: 0.70, creativity: 0.3, work_rate: 0.70, aggression: 0.60, anticipation: 0.70, flair: 0.2 },
    },
    metronome: {
      attributes: { pace: 0.65, strength: 0.62, stamina: 0.78, dribbling: 0.65, passing: 0.85, shooting: 0.55, tackling: 0.65, aerial: 0.58, positioning: 0.80 },
      personality: { directness: 0.45, risk_appetite: 0.35, composure: 0.90, creativity: 0.55, work_rate: 0.80, aggression: 0.40, anticipation: 0.82, flair: 0.35 },
    },
    boxToBox: {
      attributes: { pace: 0.75, strength: 0.68, stamina: 0.85, dribbling: 0.62, passing: 0.72, shooting: 0.60, tackling: 0.70, aerial: 0.65, positioning: 0.72 },
      personality: { directness: 0.62, risk_appetite: 0.52, composure: 0.65, creativity: 0.45, work_rate: 0.90, aggression: 0.68, anticipation: 0.70, flair: 0.42 },
    },
    maverick: {
      attributes: { pace: 0.88, strength: 0.55, stamina: 0.70, dribbling: 0.88, passing: 0.68, shooting: 0.82, tackling: 0.38, aerial: 0.55, positioning: 0.70 },
      personality: { directness: 0.88, risk_appetite: 0.85, composure: 0.50, creativity: 0.90, work_rate: 0.58, aggression: 0.55, anticipation: 0.65, flair: 0.92 },
    },
    poacher: {
      attributes: { pace: 0.82, strength: 0.62, stamina: 0.68, dribbling: 0.70, passing: 0.55, shooting: 0.88, tackling: 0.35, aerial: 0.72, positioning: 0.85 },
      personality: { directness: 0.82, risk_appetite: 0.78, composure: 0.72, creativity: 0.52, work_rate: 0.65, aggression: 0.65, anticipation: 0.80, flair: 0.65 },
    },
    goalKeeper: {
      attributes: { pace: 0.55, strength: 0.72, stamina: 0.72, dribbling: 0.42, passing: 0.62, shooting: 0.35, tackling: 0.50, aerial: 0.82, positioning: 0.85 },
      personality: { directness: 0.30, risk_appetite: 0.20, composure: 0.82, creativity: 0.30, work_rate: 0.70, aggression: 0.40, anticipation: 0.85, flair: 0.20 },
    },
    technician: {
      attributes: { pace: 0.72, strength: 0.55, stamina: 0.72, dribbling: 0.80, passing: 0.78, shooting: 0.62, tackling: 0.55, aerial: 0.52, positioning: 0.75 },
      personality: { directness: 0.58, risk_appetite: 0.65, composure: 0.72, creativity: 0.80, work_rate: 0.70, aggression: 0.42, anticipation: 0.72, flair: 0.72 },
    },
  };

  // Home team: GK, LB, CB, CB, RB, LM, CM, CM, RM, ST, ST
  const homeArchetypes = [
    archetypes.goalKeeper,    // GK
    archetypes.aggressiveDefender, // LB
    archetypes.steadyDefender,    // CB
    archetypes.steadyDefender,    // CB
    archetypes.aggressiveDefender, // RB
    archetypes.technician,        // LM
    archetypes.metronome,         // CM
    archetypes.boxToBox,          // CM
    archetypes.technician,        // RM
    archetypes.maverick,          // ST
    archetypes.poacher,           // ST
  ];

  const awayArchetypes = [
    archetypes.goalKeeper,         // GK
    archetypes.steadyDefender,     // LB
    archetypes.aggressiveDefender, // CB
    archetypes.aggressiveDefender, // CB
    archetypes.steadyDefender,     // RB
    archetypes.boxToBox,           // LM
    archetypes.metronome,          // CM
    archetypes.technician,         // CM
    archetypes.boxToBox,           // RM
    archetypes.poacher,            // ST
    archetypes.maverick,           // ST
  ];

  const roleLabels = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];
  const names = ['Home GK', 'Home LB', 'Home CB', 'Home CB', 'Home RB', 'Home LM', 'Home CM', 'Home CM', 'Home RM', 'Home ST', 'Home ST'];
  const awayNames = ['Away GK', 'Away LB', 'Away CB', 'Away CB', 'Away RB', 'Away LM', 'Away CM', 'Away CM', 'Away RM', 'Away ST', 'Away ST'];

  const home: PlayerState[] = homePositions.map((pos, i) => ({
    id: `home-${i}`,
    teamId: 'home' as TeamId,
    position: pos,
    velocity: Vec2.zero(),
    attributes: { ...homeArchetypes[i]!.attributes },
    personality: { ...homeArchetypes[i]!.personality },
    fatigue: 0,
    role: roleLabels[i] ?? 'CM',
    formationAnchor: pos,
    name: names[i],
  } as PlayerState));

  const away: PlayerState[] = awayPositions.map((pos, i) => ({
    id: `away-${i}`,
    teamId: 'away' as TeamId,
    position: pos,
    velocity: Vec2.zero(),
    attributes: { ...awayArchetypes[i]!.attributes },
    personality: { ...awayArchetypes[i]!.personality },
    fatigue: 0,
    role: roleLabels[i] ?? 'CM',
    formationAnchor: pos,
    name: awayNames[i],
  } as PlayerState));

  return { home, away };
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
export class SimulationEngine {
  private snapshot: SimSnapshot;
  private readonly rng: () => number;
  private readonly statsAccumulator: StatsAccumulator;
  readonly decisionLog: DecisionLog;
  private readonly grid: SpatialGrid;
  private readonly previousActions: Map<string, ActionType> = new Map();

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
    this.grid = new SpatialGrid(PITCH_WIDTH, PITCH_HEIGHT, 10);
  }

  /**
   * Advance simulation by one tick of dt milliseconds.
   * Returns the new snapshot.
   */
  tick(dt: number): SimSnapshot {
    const current = this.snapshot;
    const nextTick = current.tick + 1;

    // ── 1. Advance match phase ───────────────────────────────────────────────
    const phaseResult = advancePhase(
      current.matchPhase,
      nextTick,
      false, // justScored — determined below after goal check
    );

    // ── 2. HALFTIME / FULL_TIME / HALFTIME→SECOND_HALF: skip physics ─────────
    // Physics is also skipped on the first tick of SECOND_HALF (the halftime transition
    // tick) to prevent ball movement when transitioning out of a stopped state.
    const isBreakTick =
      phaseResult.phase === MatchPhase.HALFTIME ||
      phaseResult.phase === MatchPhase.FULL_TIME ||
      (phaseResult.phase === MatchPhase.SECOND_HALF && current.matchPhase === MatchPhase.HALFTIME);

    if (isBreakTick) {
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
    const ballCarrierId = current.ball.carrierId;
    const ballCarrier = ballCarrierId
      ? playersWithFatigue.find(p => p.id === ballCarrierId)
      : null;
    const homePossession = ballCarrier?.teamId === 'home';
    const awayPossession = ballCarrier?.teamId === 'away';

    const homeAnchors = computeFormationAnchors(
      '4-4-2',
      'home',
      current.ball.position,
      homePossession,
    );
    const awayAnchors = computeFormationAnchors(
      '4-4-2',
      'away',
      current.ball.position,
      awayPossession,
    );

    // Assign updated formation anchors to players
    // Home players are first 11, away are next 11
    const playersWithAnchors: PlayerState[] = playersWithFatigue.map((p) => {
      const anchors = p.teamId === 'home' ? homeAnchors : awayAnchors;
      // Find role index within team
      const teamPlayers = playersWithFatigue.filter(tp => tp.teamId === p.teamId);
      const roleIdx = teamPlayers.indexOf(p);
      const anchor = anchors[roleIdx] ?? p.formationAnchor;
      return { ...p, formationAnchor: anchor };
    });

    // ── 7. Build AgentContext for each player ─────────────────────────────────
    const contexts: AgentContext[] = playersWithAnchors.map((p, idx) => {
      const teammates = playersWithAnchors.filter(op => op.teamId === p.teamId && op.id !== p.id);
      const opponents = playersWithAnchors.filter(op => op.teamId !== p.teamId);

      // Opponent goal position
      const opponentGoalX = p.teamId === 'home' ? PITCH_WIDTH : 0;
      const goalPos = new Vec2(opponentGoalX, PITCH_HEIGHT / 2);
      const distanceToOpponentGoal = p.position.distanceTo(goalPos);

      const distanceToBall = p.position.distanceTo(current.ball.position);
      const distanceToFormationAnchor = p.position.distanceTo(p.formationAnchor);

      const isInPossessionTeam = ballCarrierId
        ? (p.teamId === 'home' ? homePossession : awayPossession)
        : false;

      // Nearest defender (opponent) and teammate distances
      let nearestDefenderDistance = 100;
      let nearestTeammateDistance = 100;
      for (const opp of opponents) {
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

      return {
        self: effectivePlayer,
        teammates,
        opponents,
        ball: current.ball,
        matchPhase: phaseResult.phase,
        score: current.score,
        distanceToOpponentGoal,
        distanceToBall,
        distanceToFormationAnchor,
        isInPossessionTeam,
        nearestDefenderDistance,
        nearestTeammateDistance,
      };
    });

    // ── 8. Select action for each player ─────────────────────────────────────
    const intents: ActionIntent[] = contexts.map((ctx, i) => {
      const playerId = playersWithAnchors[i]!.id;
      const prevAction = this.previousActions.get(playerId);
      return selectAction(ACTIONS, ctx, effectivePersonality[i]!, PERSONALITY_WEIGHTS, this.rng, prevAction);
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

    // ── 10. Resolve action intents ────────────────────────────────────────────
    // Ball control and player movement
    let ball = current.ball;
    const updatedPlayers: PlayerState[] = [...playersWithAnchors];

    // 10a. Ball pickup: if ball is loose and a player is within CONTROL_RADIUS, they pick it up
    if (ball.carrierId === null) {
      let closestDist = CONTROL_RADIUS;
      let closestIdx = -1;
      for (let i = 0; i < updatedPlayers.length; i++) {
        const p = updatedPlayers[i]!;
        const d = p.position.distanceTo(ball.position);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }
      if (closestIdx >= 0) {
        ball = { ...ball, carrierId: updatedPlayers[closestIdx]!.id };
      }
    }

    // 10b. Resolve each player's intent
    for (let i = 0; i < updatedPlayers.length; i++) {
      const p = updatedPlayers[i]!;
      const intent = intents[i]!;
      const effAttr = effectiveAttributes[i]!;
      const maxSpeed = effAttr.pace * BASE_PLAYER_SPEED * (1 - p.fatigue * 0.5);

      switch (intent.action) {
        case 'MOVE_TO_POSITION': {
          // Arrive at formation anchor
          const desired = arrive(p.position, p.formationAnchor, maxSpeed, 5.0);
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

        case 'PRESS': {
          // Pursuit of ball carrier or ball position
          const pressTarget = ball.position;
          const desired = seek(p.position, pressTarget, maxSpeed);
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
          // Run into space toward opponent goal
          const opponentGoalX = p.teamId === 'home' ? PITCH_WIDTH : 0;
          const runTarget = new Vec2(
            p.position.x + (opponentGoalX - p.position.x) * 0.3,
            p.formationAnchor.y,
          );
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
          if (ball.carrierId === p.id) {
            // Find a target teammate
            const teammates = updatedPlayers.filter(tp => tp.teamId === p.teamId && tp.id !== p.id);
            let target = teammates[0];
            if (intent.action === 'PASS_FORWARD') {
              // Find the most advanced teammate (closer to opponent goal)
              let bestAdvance = -Infinity;
              for (const tm of teammates) {
                const advance = p.teamId === 'home' ? tm.position.x : (PITCH_WIDTH - tm.position.x);
                if (advance > bestAdvance) {
                  bestAdvance = advance;
                  target = tm;
                }
              }
            } else {
              // Find nearest safe teammate
              let minDist = Infinity;
              for (const tm of teammates) {
                const d = p.position.distanceTo(tm.position);
                if (d < minDist) {
                  minDist = d;
                  target = tm;
                }
              }
            }

            if (target) {
              const passDir = target.position.subtract(p.position).normalize();
              ball = {
                ...ball,
                velocity: passDir.scale(PASS_SPEED),
                carrierId: null,
              };
              // Passer becomes stationary briefly
              updatedPlayers[i] = { ...p, velocity: Vec2.zero() };
            }
          }
          break;
        }

        case 'SHOOT': {
          if (ball.carrierId === p.id) {
            const goalX = p.teamId === 'home' ? PITCH_WIDTH : 0;
            const goalY = PITCH_HEIGHT / 2 + (this.rng() - 0.5) * 4; // slight randomness
            const shootDir = new Vec2(goalX, goalY).subtract(p.position).normalize();
            ball = {
              ...ball,
              velocity: shootDir.scale(SHOOT_SPEED),
              carrierId: null,
              vz: 2 + this.rng() * 3, // loft ball slightly
            };
            updatedPlayers[i] = { ...p, velocity: Vec2.zero() };
          }
          break;
        }

        case 'DRIBBLE': {
          if (ball.carrierId === p.id) {
            // Move toward opponent goal with ball
            const opponentGoalX = p.teamId === 'home' ? PITCH_WIDTH : 0;
            const dribbleDir = new Vec2(opponentGoalX - p.position.x, 0).normalize();
            const newVel = dribbleDir.scale(maxSpeed * 0.7);
            const dtSec = dt / 1000;
            const newPos = p.position.add(newVel.scale(dtSec));
            const clampedPos = clampToPitch(newPos);

            // Ball follows dribbler
            ball = {
              ...ball,
              position: clampedPos.add(dribbleDir.scale(CONTROL_RADIUS * 0.8)),
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

    // ── 11. Separation forces ─────────────────────────────────────────────────
    // Post-process: apply separation to prevent overlapping
    for (let i = 0; i < updatedPlayers.length; i++) {
      const p = updatedPlayers[i]!;
      const neighborPositions = updatedPlayers
        .filter((_op, j) => j !== i)
        .map(op => op.position);

      const sepForce = separation(p.position, neighborPositions, SEPARATION_RADIUS);

      if (sepForce.length() > 0.001) {
        const dtSec = dt / 1000;
        const correctedPos = clampToPitch(
          p.position.add(sepForce.scale(SEPARATION_SCALE * dtSec))
        );
        updatedPlayers[i] = { ...p, position: correctedPos };
      }
    }

    // ── 12. Integrate ball physics ────────────────────────────────────────────
    // Only integrate if ball has no carrier (carried balls move with player)
    if (ball.carrierId === null) {
      ball = integrateBall(ball, dt);

      // Bounce off pitch boundary walls (simple elastic reflection)
      if (ball.position.x < 0 || ball.position.x > PITCH_WIDTH) {
        ball = {
          ...ball,
          position: new Vec2(
            Math.max(0, Math.min(PITCH_WIDTH, ball.position.x)),
            ball.position.y,
          ),
          velocity: new Vec2(-ball.velocity.x * 0.7, ball.velocity.y),
        };
      }
      if (ball.position.y < 0 || ball.position.y > PITCH_HEIGHT) {
        ball = {
          ...ball,
          position: new Vec2(
            ball.position.x,
            Math.max(0, Math.min(PITCH_HEIGHT, ball.position.y)),
          ),
          velocity: new Vec2(ball.velocity.x, -ball.velocity.y * 0.7),
        };
      }
    }

    // ── 13. Check for goals ───────────────────────────────────────────────────
    const scoringTeam = checkGoal(ball);
    let score = current.score;
    const events = [...phaseResult.events];

    if (scoringTeam !== null) {
      const afterGoal = applyGoal({ ...current, ball }, scoringTeam);
      ball = afterGoal.ball;
      score = afterGoal.score;

      const goalPhaseResult = advancePhase(current.matchPhase, nextTick, true);
      events.push(...goalPhaseResult.events);

      const newSnapshot: SimSnapshot = {
        tick: nextTick,
        timestamp: current.timestamp + dt,
        ball,
        players: updatedPlayers,
        matchPhase: goalPhaseResult.phase,
        score,
        events,
        stats: this.statsAccumulator.getSnapshot(),
      };
      this.snapshot = newSnapshot;
      return newSnapshot;
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

function clampToPitch(pos: Vec2): Vec2 {
  return new Vec2(
    Math.max(0, Math.min(PITCH_WIDTH, pos.x)),
    Math.max(0, Math.min(PITCH_HEIGHT, pos.y)),
  );
}
