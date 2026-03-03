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
import { seek, arrive, separation, clampVelocity } from './physics/steering.ts';
import { resolveTackle, isShielded } from './physics/contact.ts';
import { computeFormationAnchors } from './tactical/formation.ts';
import { StatsAccumulator } from './match/stats.ts';
import { DecisionLog } from './ai/decisionLog.ts';
import type { AgentDecisionEntry } from './ai/decisionLog.ts';
import { GameEventLog } from './match/gameLog.ts';

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
    duty: 'SUPPORT' as const,
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
    duty: 'SUPPORT' as const,
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
  readonly gameLog: GameEventLog;
  private readonly grid: SpatialGrid;
  private readonly previousActions: Map<string, ActionType> = new Map();
  private readonly tackleCooldowns: Map<string, number> = new Map(); // agentId → tick when cooldown expires
  private lastKickerId: string | null = null;   // player who last kicked the ball
  private kickCooldownUntil: number = 0;          // tick until which lastKicker can't pick up the ball
  private pickupCooldownUntil: number = 0;        // global: nobody picks up until this tick (prevents possession loops)
  private carrierKickLockoutUntil: number = 0;    // carrier can't kick until this tick (prevents micro-pass spam)

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
        ball = { ...ball, carrierId: updatedPlayers[closestIdx]!.id };
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
      } // end ball.z < 2.0 height check
    }

    // 10b. Resolve each player's intent
    for (let i = 0; i < updatedPlayers.length; i++) {
      const p = updatedPlayers[i]!;
      const intent = intents[i]!;
      const effAttr = effectiveAttributes[i]!;
      const maxSpeed = effAttr.pace * TUNING.playerBaseSpeed * (1 - p.fatigue * 0.5);

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
              moveTarget = ball.position;
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
                const pullStrength = Math.min((distToCarrier - 12) / 30, 1) * TUNING.supportPull;
                moveTarget = new Vec2(
                  p.formationAnchor.x + (supportPos.x - p.formationAnchor.x) * pullStrength,
                  p.formationAnchor.y + (supportPos.y - p.formationAnchor.y) * pullStrength,
                );
              }
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
          // Run into space toward opponent goal, with diagonal offset
          const opponentGoalX = p.teamId === 'home' ? PITCH_WIDTH : 0;
          const forwardX = p.position.x + (opponentGoalX - p.position.x) * 0.3;

          // Diagonal run: spread away from ball carrier to create width
          let runY = p.formationAnchor.y;
          if (ball.carrierId !== null) {
            const carrier = updatedPlayers.find(cp => cp.id === ball.carrierId);
            if (carrier && carrier.teamId === p.teamId) {
              // Move away from carrier's y to provide width
              const yDiff = p.position.y - carrier.position.y;
              runY = p.formationAnchor.y + Math.sign(yDiff || 1) * 8;
            }
          }

          const runTarget = new Vec2(forwardX, runY);
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
            // Find a target teammate
            const teammates = updatedPlayers.filter(tp => tp.teamId === p.teamId && tp.id !== p.id);
            let target = teammates[0];
            if (intent.action === 'PASS_FORWARD') {
              // Progressive passing: score teammates by advancement gain vs distance.
              // Prefers nearby teammates who are further up the pitch than the passer,
              // producing CB→CM (15m), CM→ST (20m) chains instead of CB→ST (60m) long balls.
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
                const score = advScore - distPenalty;
                if (score > bestScore) {
                  bestScore = score;
                  target = tm;
                }
              }
              // Fallback: if no forward target found (all behind), pick nearest teammate
              if (bestScore === -Infinity) {
                let minDist = Infinity;
                for (const tm of teammates) {
                  const d = p.position.distanceTo(tm.position);
                  if (d < minDist) { minDist = d; target = tm; }
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
              const passDist = p.position.distanceTo(target.position);

              // Lead the target only on longer passes when receiver is clearly running
              // (speed > 2 m/s in a consistent direction). Short passes go to feet.
              let aimPos = target.position;
              const receiverSpeed = target.velocity.length();
              if (passDist > 15 && receiverSpeed > 2) {
                const travelTime = passDist / TUNING.passSpeed;
                // Modest lead — 0.35 factor, capped at 6m max offset
                const leadDist = Math.min(receiverSpeed * travelTime * 0.35, 6);
                const leadDir = target.velocity.scale(1 / receiverSpeed); // unit direction
                aimPos = target.position.add(leadDir.scale(leadDist));
              }

              // Compute base pass direction
              let passDir = aimPos.subtract(p.position);
              const passLen = passDir.length();
              if (passLen > 0.01) passDir = passDir.scale(1 / passLen);

              // Pass lane check: if an opponent is near the pass line, nudge the angle
              const opponents = updatedPlayers.filter(op => op.teamId !== p.teamId);
              for (const opp of opponents) {
                const toOpp = opp.position.subtract(p.position);
                const proj = toOpp.dot(passDir); // how far along the pass line
                if (proj < 3 || proj > passDist - 3) continue; // behind passer or past target
                const perp = Math.abs(toOpp.x * passDir.y - toOpp.y * passDir.x); // cross product = perpendicular distance
                if (perp < 3) {
                  // Opponent blocks the lane — rotate pass direction ~8° away from them
                  const side = (toOpp.x * passDir.y - toOpp.y * passDir.x) > 0 ? -1 : 1;
                  const angle = side * 0.14; // ~8 degrees
                  const cos = Math.cos(angle);
                  const sin = Math.sin(angle);
                  passDir = new Vec2(passDir.x * cos - passDir.y * sin, passDir.x * sin + passDir.y * cos);
                  break; // one adjustment is enough
                }
              }

              // Loft long passes: add vertical velocity for passes > 20m
              // Short passes stay on the ground; long passes arc over defenders
              const loftVz = passDist > 20 ? 2 + (passDist - 20) * 0.08 : 0;

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
              this.kickCooldownUntil = nextTick + 10; // ~0.33s at 30 ticks/sec
              // Global cooldown: ball must travel before anyone picks up (prevents possession loops)
              this.pickupCooldownUntil = nextTick + 12;
              // Record actual pass event
              this.statsAccumulator.recordPass(p.teamId);
              this.gameLog.recordPass(nextTick, p.teamId, p.id, p.role,
                p.position.x, p.position.y, target.position.x, target.position.y,
                target.id, intent.action === 'PASS_FORWARD' ? 'forward' : 'safe',
                passDist);
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
            this.kickCooldownUntil = nextTick + 10;
            this.pickupCooldownUntil = nextTick + 12;
            // Record actual shot event
            const distToGoal = Math.abs(p.position.x - goalX);
            this.statsAccumulator.recordShot(p.teamId);
            this.gameLog.recordShot(nextTick, p.teamId, p.id, p.role,
              p.position.x, p.position.y, distToGoal);
          }
          break;
        }

        case 'DRIBBLE': {
          if (ball.carrierId === p.id) {
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

            // Ball follows dribbler
            ball = {
              ...ball,
              position: clampedPos.add(dribbleDir.scale(TUNING.controlRadius * 0.8)),
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
    if (ball.carrierId !== null) {
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
              velocity: knockDir.scale(4 + this.rng() * 4),
            };
            // Prevent dispossessed player from immediately re-picking up (breaks jitter loops)
            this.lastKickerId = carrier.id;
            this.kickCooldownUntil = nextTick + 15;
            this.pickupCooldownUntil = nextTick + 8;
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

      // Log the goal — find the last kicker as the scorer
      const scorerId = this.lastKickerId ?? 'unknown';
      const scorer = updatedPlayers.find(p => p.id === scorerId);
      this.gameLog.recordGoal(nextTick, scoringTeam, scorerId, scorer?.role ?? '??',
        scorer?.position.x ?? ball.position.x, scorer?.position.y ?? ball.position.y,
        score as [number, number]);

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
