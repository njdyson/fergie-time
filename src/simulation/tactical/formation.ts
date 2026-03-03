import { Vec2 } from '../math/vec2.ts';
import type { TeamId, FormationId, Role } from '../types.ts';
import { PITCH_WIDTH, PITCH_HEIGHT } from '../match/state.ts';

// ============================================================
// Formation type
// ============================================================

/**
 * Interface for a formation template.
 * basePositions: 11 home-team Vec2 positions (GK first)
 * roles: 11 role labels corresponding to each position
 */
export interface FormationTemplate {
  readonly basePositions: readonly Vec2[];
  readonly roles: readonly string[];
}

// ============================================================
// Shared layout helpers
// ============================================================

const MID_Y = PITCH_HEIGHT / 2; // 34

// ============================================================
// Formation templates
// ============================================================

/**
 * All 5 supported formation templates, keyed by FormationId.
 *
 * Position order within each template:
 *   Index 0:       GK
 *   Indices 1..N:  Defenders (left to right)
 *   Indices N+1..: Midfielders (left to right)
 *   Last indices:  Forwards (left to right)
 */
export const FORMATION_TEMPLATES: Record<FormationId, FormationTemplate> = {
  '4-4-2': {
    basePositions: [
      new Vec2(5, MID_Y),                     // GK
      // DEF (4)
      new Vec2(25, MID_Y - 21),               // LB
      new Vec2(25, MID_Y - 7),                // CB
      new Vec2(25, MID_Y + 7),                // CB
      new Vec2(25, MID_Y + 21),               // RB
      // MID (4)
      new Vec2(45, MID_Y - 20),               // LM
      new Vec2(45, MID_Y - 6.67),             // CM
      new Vec2(45, MID_Y + 6.67),             // CM
      new Vec2(45, MID_Y + 20),               // RM
      // FWD (2)
      new Vec2(65, MID_Y - 6),                // ST
      new Vec2(65, MID_Y + 6),                // ST
    ],
    roles: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
  },

  '4-3-3': {
    basePositions: [
      new Vec2(5, MID_Y),                     // GK
      // DEF (4)
      new Vec2(25, MID_Y - 21),               // LB
      new Vec2(25, MID_Y - 7),                // CB
      new Vec2(25, MID_Y + 7),                // CB
      new Vec2(25, MID_Y + 21),               // RB
      // MID (3) — compact central trio
      new Vec2(45, MID_Y - 10),               // CM (left)
      new Vec2(45, MID_Y),                    // CM (center)
      new Vec2(45, MID_Y + 10),               // CM (right)
      // FWD (3) — wide attack
      new Vec2(65, MID_Y - 18),               // LW
      new Vec2(65, MID_Y),                    // ST
      new Vec2(65, MID_Y + 18),               // RW
    ],
    roles: ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'],
  },

  '4-5-1': {
    basePositions: [
      new Vec2(5, MID_Y),                     // GK
      // DEF (4)
      new Vec2(25, MID_Y - 21),               // LB
      new Vec2(25, MID_Y - 7),                // CB
      new Vec2(25, MID_Y + 7),                // CB
      new Vec2(25, MID_Y + 21),               // RB
      // MID (5) — wide midfield, x=42 to pack the middle
      new Vec2(42, MID_Y - 24),               // LM
      new Vec2(42, MID_Y - 12),               // CM
      new Vec2(42, MID_Y),                    // CM (center)
      new Vec2(42, MID_Y + 12),               // CM
      new Vec2(42, MID_Y + 24),               // RM
      // FWD (1) — lone striker
      new Vec2(65, MID_Y),                    // ST
    ],
    roles: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'CM', 'RM', 'ST'],
  },

  '3-5-2': {
    basePositions: [
      new Vec2(5, MID_Y),                     // GK
      // DEF (3) — flatter back three, spread wider
      new Vec2(22, MID_Y - 17),               // CB (left)
      new Vec2(22, MID_Y),                    // CB (center)
      new Vec2(22, MID_Y + 17),               // CB (right)
      // MID (5) — wide midfield with WBs
      new Vec2(42, MID_Y - 26),               // LWB (wide)
      new Vec2(42, MID_Y - 10),               // CM
      new Vec2(42, MID_Y),                    // CM (center)
      new Vec2(42, MID_Y + 10),               // CM
      new Vec2(42, MID_Y + 26),               // RWB (wide)
      // FWD (2)
      new Vec2(65, MID_Y - 7),                // ST
      new Vec2(65, MID_Y + 7),                // ST
    ],
    roles: ['GK', 'CB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CM', 'RB', 'ST', 'ST'],
  },

  '4-2-3-1': {
    basePositions: [
      new Vec2(5, MID_Y),                     // GK
      // DEF (4)
      new Vec2(25, MID_Y - 21),               // LB
      new Vec2(25, MID_Y - 7),                // CB
      new Vec2(25, MID_Y + 7),                // CB
      new Vec2(25, MID_Y + 21),               // RB
      // CDM (2)
      new Vec2(37, MID_Y - 7),                // CDM (left)
      new Vec2(37, MID_Y + 7),                // CDM (right)
      // CAM (3) — attacking midfield trio
      new Vec2(52, MID_Y - 16),               // CAM (left)
      new Vec2(52, MID_Y),                    // CAM (center)
      new Vec2(52, MID_Y + 16),               // CAM (right)
      // FWD (1)
      new Vec2(65, MID_Y),                    // ST
    ],
    roles: ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'CAM', 'CAM', 'CAM', 'ST'],
  },
};

// ============================================================
// Legacy exports for backward compatibility
// ============================================================

/**
 * Positional role labels for the 4-4-2 formation.
 * Order: GK, LB, CB, CB, RB, LM, CM, CM, RM, ST, ST
 */
export const ROLES_442: readonly string[] = FORMATION_TEMPLATES['4-4-2'].roles;

// ============================================================
// computeFormationAnchors
// ============================================================

/**
 * Compute formation anchor positions for a given formation and team.
 *
 * Accepts either a FormationId string (looks up FORMATION_TEMPLATES) or a Vec2[]
 * (custom dragged positions — used directly as base positions).
 *
 * Returns 11 anchor positions (GK + 10 outfield) for the given team.
 *
 * Influences:
 * - Ball position: pulls all anchors toward ball x-position by factor 0.15
 * - Possession: in possession → outfield anchors push forward 10m; defending → pull back 5m
 * - All positions clamped to pitch boundaries
 *
 * @param formation - FormationId string or Vec2[] custom base positions
 * @param teamId - 'home' or 'away'
 * @param ballPosition - Current ball position in metres
 * @param isInPossession - Whether this team has the ball
 * @returns Array of 11 Vec2 anchor positions
 */
export function computeFormationAnchors(
  formation: FormationId | Vec2[],
  teamId: TeamId,
  ballPosition: Vec2,
  isInPossession: boolean,
): Vec2[] {
  // Step 1: Resolve base positions
  let basePositions: readonly Vec2[];
  if (Array.isArray(formation)) {
    basePositions = formation as Vec2[];
  } else {
    basePositions = FORMATION_TEMPLATES[formation].basePositions;
  }

  // Step 2: Compute home-team positions (or mirror for away)
  const anchors: Vec2[] = [];

  for (let i = 0; i < 11; i++) {
    const base = basePositions[i]!;
    // For away team, mirror x: awayX = PITCH_WIDTH - homeX
    const x = teamId === 'home' ? base.x : PITCH_WIDTH - base.x;
    anchors.push(new Vec2(x, base.y));
  }

  // Step 3: Apply ball influence
  // Shift all anchors toward ball x-position by factor 0.15
  const ballX = ballPosition.x;
  for (let i = 0; i < 11; i++) {
    const a = anchors[i]!;
    const newX = a.x + (ballX - a.x) * 0.15;
    anchors[i] = new Vec2(newX, a.y);
  }

  // Step 4: Apply possession influence to outfield players (indices 1-10)
  // In possession: push forward by 10m (toward opponent goal)
  // Defending: pull back by 5m (toward own goal)
  const pushDirection = teamId === 'home' ? 1 : -1; // home pushes right (+x), away pushes left (-x)
  const possessionShift = isInPossession ? 10 * pushDirection : -5 * pushDirection;

  for (let i = 1; i < 11; i++) {
    const a = anchors[i]!;
    anchors[i] = new Vec2(a.x + possessionShift, a.y);
  }

  // Step 5: Clamp all positions to pitch boundaries
  for (let i = 0; i < 11; i++) {
    const a = anchors[i]!;
    const clampedX = Math.max(0, Math.min(PITCH_WIDTH, a.x));
    const clampedY = Math.max(0, Math.min(PITCH_HEIGHT, a.y));
    anchors[i] = new Vec2(clampedX, clampedY);
  }

  return anchors;
}

// ============================================================
// autoAssignRole
// ============================================================

/**
 * Automatically assigns a positional role to a player based on their anchor position.
 *
 * Zone boundaries (from home team perspective, x = distance from own goal line):
 * - x < 15m: GK
 * - 15m ≤ x < 33m (defensive zone):
 *   - inner y (22-46m): CB
 *   - outer y: LB (y < 22) or RB (y > 46)
 * - 33m ≤ x < 55m (midfield zone):
 *   - outer y (< 20 or > 48): LW or RW
 *   - x < 40m: CDM (deep mid)
 *   - x > 48m: CAM (attacking mid)
 *   - else: CM
 * - x ≥ 55m (forward zone): ST
 *
 * For away team, x is mirrored before zone calculation.
 *
 * @param position - Anchor position (world coords)
 * @param teamId - 'home' or 'away'
 * @returns Role assignment
 */
export function autoAssignRole(position: Vec2, teamId: TeamId): Role {
  // Normalize x so zone boundaries are always from home perspective
  const x = teamId === 'home' ? position.x : PITCH_WIDTH - position.x;
  const y = position.y;

  // GK zone
  if (x < 15) return 'GK';

  // Forward zone
  if (x >= 55) return 'ST';

  // Defensive zone
  if (x < 33) {
    if (y < 22) return 'LB';
    if (y > 46) return 'RB';
    return 'CB';
  }

  // Midfield zone (33 ≤ x < 55)
  // Wingers: outer y positions
  if (y < 20) return 'LW';
  if (y > 48) return 'RW';

  // Central midfield — depth-based split
  if (x < 40) return 'CDM';
  if (x > 48) return 'CAM';
  return 'CM';
}
