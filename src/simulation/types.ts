import type { Vec2 } from './math/vec2.ts';

// Team identification
export type TeamId = 'home' | 'away';

// Match phases (ENG-13)
// Using const object pattern instead of enum for erasableSyntaxOnly compatibility
export const MatchPhase = {
  KICKOFF: 'KICKOFF',
  FIRST_HALF: 'FIRST_HALF',
  HALFTIME: 'HALFTIME',
  SECOND_HALF: 'SECOND_HALF',
  FULL_TIME: 'FULL_TIME',
} as const;
export type MatchPhase = (typeof MatchPhase)[keyof typeof MatchPhase];

// Action types for utility AI (ENG-03) — 8 distinct action values
// The "7 actions" requirement (ENG-03) is behavioral, not structural — agent evaluates all and selects best.
// Decision: keep PASS_FORWARD and PASS_SAFE as separate action types for more granular AI decisions.
export const ActionType = {
  PASS_FORWARD: 'PASS_FORWARD',
  PASS_SAFE: 'PASS_SAFE',
  DRIBBLE: 'DRIBBLE',
  SHOOT: 'SHOOT',
  HOLD_SHIELD: 'HOLD_SHIELD',
  MOVE_TO_POSITION: 'MOVE_TO_POSITION',
  PRESS: 'PRESS',
  MAKE_RUN: 'MAKE_RUN',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

// Personality vector (ENG-04) — 8 traits, all 0..1
export interface PersonalityVector {
  readonly directness: number;      // 0..1
  readonly risk_appetite: number;   // 0..1
  readonly composure: number;       // 0..1
  readonly creativity: number;      // 0..1
  readonly work_rate: number;       // 0..1
  readonly aggression: number;      // 0..1
  readonly anticipation: number;    // 0..1
  readonly flair: number;           // 0..1
}

// Physical/technical attributes — all 0..1
export interface PlayerAttributes {
  readonly pace: number;            // 0..1
  readonly strength: number;        // 0..1
  readonly stamina: number;         // 0..1
  readonly dribbling: number;       // 0..1
  readonly passing: number;         // 0..1
  readonly shooting: number;        // 0..1
  readonly tackling: number;        // 0..1
  readonly aerial: number;          // 0..1
  readonly positioning: number;     // 0..1
}

// Personality weight matrix (ENG-04) — maps action type to trait weights
export type PersonalityWeightMatrix = Record<ActionType, Partial<Record<keyof PersonalityVector, number>>>;

// Ball state (ENG-01)
export interface BallState {
  readonly position: Vec2;          // ground X/Y
  readonly velocity: Vec2;          // ground velocity
  readonly z: number;               // height above ground
  readonly vz: number;              // vertical velocity
  readonly carrierId: string | null; // player holding ball, or null
}

// Player state
export interface PlayerState {
  readonly id: string;
  readonly teamId: TeamId;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly attributes: PlayerAttributes;
  readonly personality: PersonalityVector;
  readonly fatigue: number;         // 0..1 (0=fresh, 1=exhausted)
  readonly role: string;            // positional role string
  readonly formationAnchor: Vec2;   // tactical home position
}

// Match events
export interface MatchEvent {
  readonly tick: number;
  readonly type: 'goal' | 'shot' | 'pass' | 'tackle' | 'foul' | 'save' | 'kickoff' | 'halftime' | 'fulltime';
  readonly playerId?: string;
  readonly teamId?: TeamId;
  readonly position?: Vec2;
  readonly data?: Record<string, unknown>;
}

// Match statistics (ENG-12)
export interface MatchStats {
  readonly possession: readonly [number, number]; // [home %, away %]
  readonly shots: readonly [number, number];
  readonly passes: readonly [number, number];
  readonly tackles: readonly [number, number];
}

// Agent context — the world state visible to one agent (ENG-03)
export interface AgentContext {
  readonly self: PlayerState;
  readonly teammates: readonly PlayerState[];
  readonly opponents: readonly PlayerState[];
  readonly ball: BallState;
  readonly matchPhase: MatchPhase;
  readonly score: readonly [number, number];
  readonly distanceToOpponentGoal: number;
  readonly distanceToBall: number;
  readonly distanceToFormationAnchor: number;
  readonly isInPossessionTeam: boolean;
  readonly nearestDefenderDistance: number;
  readonly nearestTeammateDistance: number;
}

// Action intent — produced by agent, consumed by engine integration step
export interface ActionIntent {
  readonly agentId: string;
  readonly action: ActionType;
  readonly target?: Vec2;           // where to pass/move/shoot
  readonly targetPlayerId?: string; // who to pass to
}

// The immutable simulation snapshot (Pattern 2 from research)
export interface SimSnapshot {
  readonly tick: number;
  readonly timestamp: number;
  readonly ball: BallState;
  readonly players: readonly PlayerState[];
  readonly matchPhase: MatchPhase;
  readonly score: readonly [number, number];
  readonly events: readonly MatchEvent[];
  readonly stats: MatchStats;
}
