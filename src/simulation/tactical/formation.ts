import { Vec2 } from '../math/vec2.ts';
import type { TeamId, FormationId, Role, TeamControls } from '../types.ts';
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
      // DEF (4) — fullbacks push wide to touchline area
      new Vec2(25, MID_Y - 28),               // LB
      new Vec2(25, MID_Y - 7),                // CB
      new Vec2(25, MID_Y + 7),                // CB
      new Vec2(25, MID_Y + 28),               // RB
      // MID (4) — wide mids hug the wings
      new Vec2(45, MID_Y - 27),               // LW (wide mid)
      new Vec2(45, MID_Y - 6.67),             // CM
      new Vec2(45, MID_Y + 6.67),             // CM
      new Vec2(45, MID_Y + 27),               // RW (wide mid)
      // FWD (2)
      new Vec2(65, MID_Y - 8),                // ST
      new Vec2(65, MID_Y + 8),                // ST
    ],
    roles: ['GK', 'LB', 'CB', 'CB', 'RB', 'LW', 'CM', 'CM', 'RW', 'ST', 'ST'],
  },

  '4-3-3': {
    basePositions: [
      new Vec2(5, MID_Y),                     // GK
      // DEF (4)
      new Vec2(25, MID_Y - 28),               // LB
      new Vec2(25, MID_Y - 7),                // CB
      new Vec2(25, MID_Y + 7),                // CB
      new Vec2(25, MID_Y + 28),               // RB
      // MID (3) — central trio with clear spacing
      new Vec2(45, MID_Y - 14),               // CM (left)
      new Vec2(45, MID_Y),                    // CM (center)
      new Vec2(45, MID_Y + 14),               // CM (right)
      // FWD (3) — wide wingers stretch the pitch
      new Vec2(65, MID_Y - 26),               // LW
      new Vec2(65, MID_Y),                    // ST
      new Vec2(65, MID_Y + 26),               // RW
    ],
    roles: ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'],
  },

  '4-5-1': {
    basePositions: [
      new Vec2(5, MID_Y),                     // GK
      // DEF (4)
      new Vec2(25, MID_Y - 28),               // LB
      new Vec2(25, MID_Y - 7),                // CB
      new Vec2(25, MID_Y + 7),                // CB
      new Vec2(25, MID_Y + 28),               // RB
      // MID (5) — wide midfield, x=42 to pack the middle
      new Vec2(42, MID_Y - 30),               // LM
      new Vec2(42, MID_Y - 12),               // CM
      new Vec2(42, MID_Y),                    // CM (center)
      new Vec2(42, MID_Y + 12),               // CM
      new Vec2(42, MID_Y + 30),               // RM
      // FWD (1) — lone striker
      new Vec2(65, MID_Y),                    // ST
    ],
    roles: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'CM', 'RM', 'ST'],
  },

  '3-5-2': {
    basePositions: [
      new Vec2(5, MID_Y),                     // GK
      // DEF (3) — flatter back three, spread wider
      new Vec2(22, MID_Y - 20),               // CB (left)
      new Vec2(22, MID_Y),                    // CB (center)
      new Vec2(22, MID_Y + 20),               // CB (right)
      // MID (5) — wing-backs push to touchline
      new Vec2(42, MID_Y - 30),               // LWB (wide)
      new Vec2(42, MID_Y - 10),               // CM
      new Vec2(42, MID_Y),                    // CM (center)
      new Vec2(42, MID_Y + 10),               // CM
      new Vec2(42, MID_Y + 30),               // RWB (wide)
      // FWD (2)
      new Vec2(65, MID_Y - 8),                // ST
      new Vec2(65, MID_Y + 8),                // ST
    ],
    roles: ['GK', 'CB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CM', 'RB', 'ST', 'ST'],
  },

  '4-2-3-1': {
    basePositions: [
      new Vec2(5, MID_Y),                     // GK
      // DEF (4)
      new Vec2(25, MID_Y - 28),               // LB
      new Vec2(25, MID_Y - 7),                // CB
      new Vec2(25, MID_Y + 7),                // CB
      new Vec2(25, MID_Y + 28),               // RB
      // CDM (2)
      new Vec2(37, MID_Y - 7),                // CDM (left)
      new Vec2(37, MID_Y + 7),                // CDM (right)
      // CAM (3) — attacking midfield trio stretched wider
      new Vec2(52, MID_Y - 22),               // CAM (left)
      new Vec2(52, MID_Y),                    // CAM (center)
      new Vec2(52, MID_Y + 22),               // CAM (right)
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
 * - TeamControls: lineHeight, compactness, width adjust base anchor positions
 * - Ball position: pulls all anchors toward ball x-position by factor 0.15
 * - Possession: in possession → outfield anchors push forward 10m; defending → pull back 5m
 * - Rest defence: pins N deepest outfield anchors behind ball line when in possession
 * - All positions clamped to pitch boundaries
 *
 * @param formation - FormationId string or Vec2[] custom base positions
 * @param teamId - 'home' or 'away'
 * @param ballPosition - Current ball position in metres
 * @param isInPossession - Whether this team has the ball
 * @param teamControls - Optional team-level structure controls (V1 overhaul)
 * @param neutral - If true, skip ball influence, possession shift, and rest defence.
 *                  Used by the overlay to show the clean formation shape.
 * @returns Array of 11 Vec2 anchor positions
 */
export function computeFormationAnchors(
  formation: FormationId | Vec2[],
  teamId: TeamId,
  ballPosition: Vec2,
  isInPossession: boolean,
  teamControls?: TeamControls,
  neutral?: boolean,
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

  // Step 2.5: Apply team controls to outfield anchors (indices 1-10)
  if (teamControls) {
    const midY = PITCH_HEIGHT / 2;

    // lineHeight: 0..1 maps to -15m..+15m shift (0=deep block, 1=high line)
    // Applied from home perspective, inverted for away
    const lineShift = (teamControls.lineHeight - 0.5) * 30; // -15..+15
    const lineDir = teamId === 'home' ? 1 : -1;

    // compactness: 0..1 → 1.3..0.7 compression factor toward centroid
    // 0 = stretched (1.3x spread), 0.5 = normal (1.0x, no change), 1 = compact (0.7x)
    const compressFactor = 1.0 + (0.5 - teamControls.compactness) * 0.6; // 1.3..0.7

    // width: 0..1 → 0.7..1.3 horizontal spread factor from pitch center
    const widthFactor = 0.7 + teamControls.width * 0.6; // 0.7..1.3

    // Compute centroid X of outfield anchors for compactness compression
    let centroidX = 0;
    for (let i = 1; i < 11; i++) centroidX += anchors[i]!.x;
    centroidX /= 10;

    for (let i = 1; i < 11; i++) {
      const a = anchors[i]!;
      // Line height shift
      let x = a.x + lineShift * lineDir;
      // Compactness: compress x toward centroid
      x = centroidX + (x - centroidX) * compressFactor;
      // Width: scale y from pitch center
      const y = midY + (a.y - midY) * widthFactor;
      anchors[i] = new Vec2(x, y);
    }
  }

  if (!neutral) {
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

    // Step 4.5: Rest defence — pin N deepest outfield anchors behind ball line when in possession
    if (teamControls && isInPossession) {
      const restCount = teamControls.restDefence;
      // Sort outfield indices by depth (closest to own goal = "deepest")
      // Home: own goal at x=0, so smaller x = deeper. Away: own goal at x=105, so larger x = deeper.
      const outfieldIndices = Array.from({ length: 10 }, (_, i) => i + 1);
      outfieldIndices.sort((a, b) => {
        const ax = anchors[a]!.x;
        const bx = anchors[b]!.x;
        return teamId === 'home' ? ax - bx : bx - ax; // ascending depth
      });

      // Clamp the N deepest anchors behind the ball x line
      for (let k = 0; k < restCount && k < outfieldIndices.length; k++) {
        const idx = outfieldIndices[k]!;
        const a = anchors[idx]!;
        if (teamId === 'home') {
          // Keep behind ball: anchor.x must be <= ballX
          if (a.x > ballX) {
            anchors[idx] = new Vec2(ballX - 2, a.y); // 2m buffer behind ball line
          }
        } else {
          // Away: behind ball means anchor.x >= ballX
          if (a.x < ballX) {
            anchors[idx] = new Vec2(ballX + 2, a.y);
          }
        }
      }
    }
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
// computeDefensiveLine — offside line for a defending team
// ============================================================

/**
 * Compute the offside line x-coordinate for a defending team.
 * Returns the x of the second-last opponent, which defines where attackers
 * become offside. The goalkeeper counts as an opponent for this law check.
 *
 * "Deep" means closest to own goal:
 *   - Home: own goal at x=0, so smaller x = deeper → offside line = 2nd smallest x
 *   - Away: own goal at x=PITCH_WIDTH, so larger x = deeper → offside line = 2nd largest x
 *
 * Also accounts for ball position: offside line can't be behind the ball
 * (you can't be offside in your own half or behind the ball).
 *
 * @param players - All players on the pitch
 * @param defendingTeamId - The team whose defensive line we compute
 * @param ballX - Current ball x-position
 * @returns x-coordinate of the offside line
 */
export function computeDefensiveLine(
  players: readonly { readonly teamId: TeamId; readonly role: string; readonly position: { readonly x: number }; readonly sentOff?: boolean }[],
  defendingTeamId: TeamId,
  ballX: number,
): number {
  const defenders = players.filter(p => p.teamId === defendingTeamId && !p.sentOff);
  if (defenders.length < 2) {
    // Fallback: halfway line
    return PITCH_WIDTH / 2;
  }

  if (defendingTeamId === 'home') {
    // Home defends left (goal at x=0). Offside line = 2nd smallest x among outfield.
    // Sort ascending by x, take index [1] (second deepest).
    const sorted = defenders.map(p => p.position.x).sort((a, b) => a - b);
    const lineX = sorted[1]!;
    // Can't be offside behind the ball (closer to own goal than ball)
    return Math.min(lineX, ballX);
  } else {
    // Away defends right (goal at x=PITCH_WIDTH). Offside line = 2nd largest x.
    const sorted = defenders.map(p => p.position.x).sort((a, b) => b - a);
    const lineX = sorted[1]!;
    // Can't be offside behind the ball
    return Math.max(lineX, ballX);
  }
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
