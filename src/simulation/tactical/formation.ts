import { Vec2 } from '../math/vec2.ts';
import type { TeamId } from '../types.ts';
import { PITCH_WIDTH, PITCH_HEIGHT } from '../match/state.ts';

// ============================================================
// Formation type
// ============================================================

/**
 * Named formation string.
 * Phase 1 implements only '4-4-2'. Configurable formations are Phase 2 work (TAC-01).
 */
export type Formation = '4-4-2';

// ============================================================
// Role labels for a 4-4-2 formation
// ============================================================

/**
 * Positional role labels for the 4-4-2 formation.
 * Order: GK, LB, CB, CB, RB, LM, CM, CM, RM, ST, ST
 */
export const ROLES_442: readonly string[] = [
  'GK',
  'LB', 'CB', 'CB', 'RB',
  'LM', 'CM', 'CM', 'RM',
  'ST', 'ST',
] as const;

// ============================================================
// Base positions for 4-4-2
// ============================================================

// Base positions for home team in 4-4-2 (ball at center, neutral possession)
// GK near own goal, DEF line, MID line, FWD line
// y positions spread across PITCH_HEIGHT
const BASE_442_HOME_X = [
  5,    // GK
  25, 25, 25, 25,    // DEF (4)
  45, 45, 45, 45,    // MID (4)
  65, 65,            // FWD (2)
];

const MID_Y = PITCH_HEIGHT / 2; // 34

// Base y positions for each line
const BASE_442_Y: number[] = [
  MID_Y,                          // GK: center
  // DEF line: 4 players spread evenly
  MID_Y - 21, MID_Y - 7, MID_Y + 7, MID_Y + 21,
  // MID line: 4 players spread evenly
  MID_Y - 20, MID_Y - 6.67, MID_Y + 6.67, MID_Y + 20,
  // FWD line: 2 players slightly off-center
  MID_Y - 6, MID_Y + 6,
];

// ============================================================
// computeFormationAnchors
// ============================================================

/**
 * Compute formation anchor positions for a 4-4-2 formation.
 *
 * Returns 11 anchor positions (GK + 10 outfield) for the given team.
 *
 * Influences:
 * - Ball position: pulls all anchors toward ball x-position by factor 0.15
 * - Possession: in possession → outfield anchors push forward 10m; defending → pull back 5m
 * - All positions clamped to pitch boundaries
 *
 * @param formation - Formation string (currently only '4-4-2' supported)
 * @param teamId - 'home' or 'away'
 * @param ballPosition - Current ball position in metres
 * @param isInPossession - Whether this team has the ball
 * @returns Array of 11 Vec2 anchor positions
 */
export function computeFormationAnchors(
  formation: Formation,
  teamId: TeamId,
  ballPosition: Vec2,
  isInPossession: boolean,
): Vec2[] {
  // Step 1: Compute base x positions for home team (or mirror for away)
  const anchors: Vec2[] = [];

  for (let i = 0; i < 11; i++) {
    const baseX = BASE_442_HOME_X[i]!;
    const baseY = BASE_442_Y[i]!;

    // For away team, mirror x: awayX = PITCH_WIDTH - homeX
    const x = teamId === 'home' ? baseX : PITCH_WIDTH - baseX;
    anchors.push(new Vec2(x, baseY));
  }

  // Step 2: Apply ball influence
  // Shift all anchors toward ball x-position by factor 0.15
  const ballX = ballPosition.x;
  for (let i = 0; i < 11; i++) {
    const a = anchors[i]!;
    const newX = a.x + (ballX - a.x) * 0.15;
    anchors[i] = new Vec2(newX, a.y);
  }

  // Step 3: Apply possession influence to outfield players (indices 1-10)
  // In possession: push forward by 10m (toward opponent goal)
  // Defending: pull back by 5m (toward own goal)
  const pushDirection = teamId === 'home' ? 1 : -1; // home pushes right (+x), away pushes left (-x)
  const possessionShift = isInPossession ? 10 * pushDirection : -5 * pushDirection;

  for (let i = 1; i < 11; i++) {
    const a = anchors[i]!;
    anchors[i] = new Vec2(a.x + possessionShift, a.y);
  }

  // Step 4: Clamp all positions to pitch boundaries
  for (let i = 0; i < 11; i++) {
    const a = anchors[i]!;
    const clampedX = Math.max(0, Math.min(PITCH_WIDTH, a.x));
    const clampedY = Math.max(0, Math.min(PITCH_HEIGHT, a.y));
    anchors[i] = new Vec2(clampedX, clampedY);
  }

  return anchors;
}
