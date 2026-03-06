import type { Vec2 } from './math/vec2.ts';

// Team identification
export type TeamId = 'home' | 'away';

// Dead ball restart types
export const RestartType = {
  KICKOFF: 'KICKOFF',
  THROW_IN: 'THROW_IN',
  CORNER: 'CORNER',
  GOAL_KICK: 'GOAL_KICK',
  FREE_KICK: 'FREE_KICK',
} as const;
export type RestartType = (typeof RestartType)[keyof typeof RestartType];

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

// Action types for utility AI (ENG-03) — 9 distinct action values
// The "7 actions" requirement (ENG-03) is behavioral, not structural — agent evaluates all and selects best.
// Decision: keep PASS_FORWARD and PASS_SAFE as separate action types for more granular AI decisions.
export const ActionType = {
  PASS_FORWARD: 'PASS_FORWARD',
  PASS_SAFE: 'PASS_SAFE',
  PASS_THROUGH: 'PASS_THROUGH',
  DRIBBLE: 'DRIBBLE',
  SHOOT: 'SHOOT',
  HOLD_SHIELD: 'HOLD_SHIELD',
  MOVE_TO_POSITION: 'MOVE_TO_POSITION',
  OFFER_SUPPORT: 'OFFER_SUPPORT',
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
  readonly vision: number;          // 0..1 — spatial awareness radius and scanning frequency
}

// Personality weight matrix (ENG-04) — maps action type to trait weights
export type PersonalityWeightMatrix = Record<ActionType, Partial<Record<keyof PersonalityVector, number>>>;

// ============================================================
// Tactical instruction types (V1 Tactics Overhaul)
// ============================================================

/** Per-player tactical instruction multipliers (0..1 each, 0.5 = neutral) */
export interface PlayerTacticalMultipliers {
  readonly risk: number;            // safe (0) ↔ ambitious (1) — pass/shoot risk
  readonly directness: number;      // recycle (0) ↔ progress (1) — forward weight
  readonly press: number;           // reluctant (0) ↔ eager (1) — press baseline
  readonly holdUp: number;          // release (0) ↔ shield (1) — hold/shield bias
  readonly dribble: number;         // pass (0) ↔ carry (1) — dribble preference
  readonly freedom: number;         // hold (0) ↔ roam (1) — positional discipline
  readonly decisionWindow: number;  // patient (0) ↔ quick (1) — action resolution speed
}

/** Team-level structure controls */
export interface TeamControls {
  readonly lineHeight: number;      // 0..1 → low block (0) to high line (1)
  readonly compactness: number;     // 0..1 → stretched (0) to compact (1)
  readonly width: number;           // 0..1 → narrow (0) to wide (1)
  readonly tempo: number;           // 0..1 → patient (0) to frantic (1)
  readonly restDefence: number;     // 2, 3, or 4 — players kept behind ball line when attacking
}

/** Pressing configuration */
export type PressHeight = 'low' | 'mid' | 'high';

export interface PressConfig {
  readonly height: PressHeight;     // press activation line
  readonly counterPressSecs: number; // 0-5 seconds after possession loss
  readonly intensity: number;        // 0..1 global press eagerness multiplier
}

/** Transition behaviour config */
export interface TransitionConfig {
  readonly counterPressDuration: number; // 0-5 seconds (defensive transition)
  readonly collapseDepth: number;        // 0..1 hold line (0) ↔ deep drop (1)
  readonly forwardBias: number;          // 0..1 settle (0) ↔ counter-attack (1)
  readonly runnerCount: number;          // 0-3 players who immediately break forward
}

/** Expanded tactical phase — 4 phases instead of 2 */
export type TacticsPhase = 'inPossession' | 'outOfPossession' | 'defensiveTransition' | 'attackingTransition';

// ============================================================
// Defaults factories
// ============================================================

export function defaultMultipliers(): PlayerTacticalMultipliers {
  return { risk: 0.5, directness: 0.5, press: 0.5, holdUp: 0.5, dribble: 0.5, freedom: 0.5, decisionWindow: 0.5 };
}

export function defaultTeamControls(): TeamControls {
  return { lineHeight: 0.5, compactness: 0.5, width: 0.5, tempo: 0.5, restDefence: 3 };
}

export function defaultPressConfig(): PressConfig {
  return { height: 'mid', counterPressSecs: 2, intensity: 0.5 };
}

export function defaultTransitionConfig(): TransitionConfig {
  return { counterPressDuration: 3, collapseDepth: 0.5, forwardBias: 0.5, runnerCount: 1 };
}

export function defaultPlayerMultipliers(count: number = 11): PlayerTacticalMultipliers[] {
  return Array.from({ length: count }, () => defaultMultipliers());
}

// Ball state (ENG-01)
export interface BallState {
  readonly position: Vec2;          // ground X/Y
  readonly velocity: Vec2;          // ground velocity
  readonly z: number;               // height above ground
  readonly vz: number;              // vertical velocity
  readonly carrierId: string | null; // player holding ball, or null
}

// Formation identifiers — 5 supported formations (TAC-01)
export const FormationId = {
  '4-4-2': '4-4-2',
  '4-3-3': '4-3-3',
  '4-5-1': '4-5-1',
  '3-5-2': '3-5-2',
  '4-2-3-1': '4-2-3-1',
} as const;
export type FormationId = (typeof FormationId)[keyof typeof FormationId];

// Positional role — 10 distinct roles covering all formation positions
export const Role = {
  GK: 'GK',
  CB: 'CB',
  LB: 'LB',
  RB: 'RB',
  CDM: 'CDM',
  CM: 'CM',
  CAM: 'CAM',
  LW: 'LW',
  RW: 'RW',
  ST: 'ST',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

// Duty levels — modify utility AI action score weights
export const Duty = {
  DEFEND: 'DEFEND',
  SUPPORT: 'SUPPORT',
  ATTACK: 'ATTACK',
} as const;
export type Duty = (typeof Duty)[keyof typeof Duty];

// Player state
export interface PlayerState {
  readonly id: string;
  readonly teamId: TeamId;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly attributes: PlayerAttributes;
  readonly personality: PersonalityVector;
  readonly fatigue: number;         // 0..1 (0=fresh, 1=exhausted)
  readonly role: Role | string;     // positional role (Role type or legacy string)
  readonly duty: Duty;              // tactical duty (default: SUPPORT)
  readonly formationAnchor: Vec2;   // tactical home position
  readonly name?: string;           // display name (optional)
  readonly age?: number;            // player age (17..34)
  readonly height?: number;         // player height in cm (165..200)
  readonly shirtNumber?: number;    // squad shirt number (1..25)
  readonly yellowCards?: number;    // cautions shown in this match
  readonly sentOff?: boolean;       // dismissed from the match
}

// Match events
export interface MatchEvent {
  readonly tick: number;
  readonly type: 'goal' | 'shot' | 'pass' | 'tackle' | 'foul' | 'save' | 'yellow_card' | 'red_card' | 'kickoff' | 'halftime' | 'fulltime' | 'throw_in' | 'corner' | 'goal_kick' | 'offside';
  readonly playerId?: string;
  readonly teamId?: TeamId;
  readonly position?: Vec2;
  readonly data?: Record<string, unknown>;
}

// Match statistics (ENG-12)
export interface MatchStats {
  readonly possession: readonly [number, number]; // [home %, away %]
  readonly shots: readonly [number, number];
  readonly shotsOnTarget: readonly [number, number];
  readonly passes: readonly [number, number];
  readonly passesCompleted: readonly [number, number];
  readonly tackles: readonly [number, number];
  readonly corners: readonly [number, number];
  readonly throwIns: readonly [number, number];
  readonly goalKicks: readonly [number, number];
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
  readonly offsideLineX: number;             // x-coord of offside line for opposing team
}

// Action intent — produced by agent, consumed by engine integration step
export interface ActionIntent {
  readonly agentId: string;
  readonly action: ActionType;
  readonly target?: Vec2;           // where to pass/move/shoot
  readonly targetPlayerId?: string; // who to pass to
}

// Dead ball info — exposed in snapshot so renderer can display it
export interface DeadBallInfo {
  readonly type: RestartType;
  readonly teamId: TeamId;
  readonly position: Vec2;
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
  readonly deadBallInfo?: DeadBallInfo;
}
