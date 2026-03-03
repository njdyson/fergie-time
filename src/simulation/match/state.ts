import { Vec2 } from '../math/vec2.ts';
import { MatchPhase } from '../types.ts';
import type { BallState, PlayerState, SimSnapshot, TeamId, MatchStats } from '../types.ts';

// Pitch dimensions (metres) — FIFA standard
export const PITCH_WIDTH = 105;
export const PITCH_HEIGHT = 68;

// Goal dimensions
export const GOAL_WIDTH = 7.32;   // Full width (3.66m either side of centre)
export const CROSSBAR_HEIGHT = 2.44;

// Derived constants
const GOAL_CENTER_Y = PITCH_HEIGHT / 2; // 34
const GOAL_HALF_WIDTH = GOAL_WIDTH / 2; // 3.66
const GOAL_MIN_Y = GOAL_CENTER_Y - GOAL_HALF_WIDTH; // ~30.34
const GOAL_MAX_Y = GOAL_CENTER_Y + GOAL_HALF_WIDTH; // ~37.66

const PITCH_CENTER = new Vec2(PITCH_WIDTH / 2, PITCH_HEIGHT / 2); // (52.5, 34)

/**
 * Checks whether the ball has crossed a goal line, returning which team scored.
 *
 * Left goal (x <= 0): away team scores (home team concedes)
 * Right goal (x >= PITCH_WIDTH): home team scores (away team concedes)
 *
 * Conditions for goal:
 * - Ball y is within the goal posts (GOAL_MIN_Y < y < GOAL_MAX_Y)
 * - Ball z is below the crossbar (z < CROSSBAR_HEIGHT)
 *
 * Pure function — no side effects.
 */
export function checkGoal(ball: BallState): TeamId | null {
  const { x, y } = ball.position;
  const { z } = ball;

  // Check if ball is in goal width and below crossbar
  const inGoalWidth = y > GOAL_MIN_Y && y < GOAL_MAX_Y;
  const belowCrossbar = z < CROSSBAR_HEIGHT;

  if (!inGoalWidth || !belowCrossbar) {
    return null;
  }

  // Left goal line (home goal, away scores)
  if (x <= 0) {
    return 'away';
  }

  // Right goal line (away goal, home scores)
  if (x >= PITCH_WIDTH) {
    return 'home';
  }

  return null;
}

/**
 * Returns 11 kickoff positions for a team in a basic 4-4-2 formation.
 *
 * Home team occupies left half (lower x values), away team occupies right half (higher x values).
 * Formation anchor positions are symmetric — away mirrors home.
 *
 * Positions represent column-based formation: GK, 4 defenders, 4 midfielders, 2 forwards.
 * Y positions are spread across the pitch width.
 */
export function getKickoffPositions(teamId: TeamId): Vec2[] {
  const midY = PITCH_HEIGHT / 2; // 34

  // Home positions (left to right, GK at x=5 to FWD at x~50)
  // Formation: 4-4-2
  //   GK: x=5
  //   DEF (4): x=20, spread on y
  //   MID (4): x=35, spread on y
  //   FWD (2): x=48, slightly off-center
  const homePositions: Vec2[] = [
    // GK
    new Vec2(5, midY),
    // DEF (4)
    new Vec2(20, midY - 20),
    new Vec2(20, midY - 7),
    new Vec2(20, midY + 7),
    new Vec2(20, midY + 20),
    // MID (4)
    new Vec2(35, midY - 20),
    new Vec2(35, midY - 7),
    new Vec2(35, midY + 7),
    new Vec2(35, midY + 20),
    // FWD (2)
    new Vec2(48, midY - 5),
    new Vec2(48, midY + 5),
  ];

  if (teamId === 'home') {
    return homePositions;
  }

  // Away mirrors home (flip x: x_away = PITCH_WIDTH - x_home)
  return homePositions.map(
    p => new Vec2(PITCH_WIDTH - p.x, p.y),
  );
}

/**
 * Creates the initial SimSnapshot at tick 0 with both rosters in kickoff positions.
 *
 * - tick: 0
 * - score: [0, 0]
 * - matchPhase: KICKOFF
 * - ball: center (52.5, 34), on ground, stationary
 * - events: []
 * - stats: zeroed
 */
export function createInitialSnapshot(
  homeRoster: PlayerState[],
  awayRoster: PlayerState[],
): SimSnapshot {
  const ball: BallState = {
    position: PITCH_CENTER,
    velocity: Vec2.zero(),
    z: 0,
    vz: 0,
    carrierId: null,
  };

  const stats: MatchStats = {
    possession: [50, 50],
    shots: [0, 0],
    passes: [0, 0],
    tackles: [0, 0],
  };

  return {
    tick: 0,
    timestamp: 0,
    ball,
    players: [...homeRoster, ...awayRoster],
    matchPhase: MatchPhase.KICKOFF,
    score: [0, 0],
    events: [],
    stats,
  };
}

/**
 * Returns a new SimSnapshot with the scoring team's score incremented and ball reset to center.
 *
 * Pure function — does not mutate the input snapshot.
 */
export function applyGoal(snapshot: SimSnapshot, scoringTeam: TeamId): SimSnapshot {
  const [homeScore, awayScore] = snapshot.score;

  const newScore: [number, number] =
    scoringTeam === 'home'
      ? [homeScore + 1, awayScore]
      : [homeScore, awayScore + 1];

  const resetBall: BallState = {
    ...snapshot.ball,
    position: PITCH_CENTER,
    velocity: Vec2.zero(),
    z: 0,
    vz: 0,
    carrierId: null,
  };

  return {
    ...snapshot,
    ball: resetBall,
    score: newScore,
  };
}
