import { Vec2 } from '../simulation/math/vec2.ts';

// ============================================================
// Snap Band Constants
// ============================================================

/** Pitch X coordinates for each snap band (home-team perspective, own goal = 0) */
export const SNAP_BANDS: readonly number[] = [
  18,   // Band 0: Deep defence
  27,   // Band 1: Defence
  36,   // Band 2: Defensive midfield
  45,   // Band 3: Central midfield
  54,   // Band 4: Attacking midfield
  63,   // Band 5: Forward
  72,   // Band 6: Advanced forward
];

/** Human-readable zone labels for each band */
export const BAND_LABELS: readonly string[] = [
  'DEF', 'DEF', 'DM', 'CM', 'AM', 'FWD', 'FWD',
];

/** GK fixed X position (not on any band) */
export const GK_FIXED_X = 5;

// ============================================================
// Snap utilities
// ============================================================

/**
 * Find the nearest snap band index for a given pitchX coordinate.
 */
export function nearestBandIndex(pitchX: number): number {
  let best = 0;
  let bestDist = Math.abs(pitchX - SNAP_BANDS[0]!);
  for (let i = 1; i < SNAP_BANDS.length; i++) {
    const dist = Math.abs(pitchX - SNAP_BANDS[i]!);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Snap a pitch X coordinate to the nearest band.
 */
export function snapToNearestBand(pitchX: number): number {
  return SNAP_BANDS[nearestBandIndex(pitchX)]!;
}

/**
 * Compute the formation string from 11 positions.
 * Groups outfield players (indices 1-10) by snap band, counts per band,
 * returns e.g. "4-1-2-1-2".
 */
export function computeFormationString(positions: readonly Vec2[]): string {
  const bandCounts = new Map<number, number>();
  for (let i = 1; i < positions.length; i++) {
    const bandIdx = nearestBandIndex(positions[i]!.x);
    bandCounts.set(bandIdx, (bandCounts.get(bandIdx) ?? 0) + 1);
  }
  const sorted = [...bandCounts.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.map(([, count]) => String(count)).join('-');
}

/**
 * Snap all 11 positions: GK fixed at GK_FIXED_X, outfield snapped to nearest band.
 * Preserves Y (horizontal) coordinates exactly.
 */
export function snapPositions(positions: Vec2[]): Vec2[] {
  return positions.map((pos, i) => {
    if (i === 0) return new Vec2(GK_FIXED_X, pos.y);
    return new Vec2(snapToNearestBand(pos.x), pos.y);
  });
}
