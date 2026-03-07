/**
 * General-purpose player analysis module.
 *
 * Provides player ratings, market valuations, squad gap analysis,
 * and squad depth charts. Reusable across transfers, scouting, AI decisions.
 */

import type { PlayerState, PlayerAttributes, Role } from '../simulation/types.ts';
import type { PlayerSeasonStats } from './playerStats.ts';

// --- Role-based attribute weights ---
// Each role values attributes differently. Weights sum to ~1.0 per role.

const OUTFIELD_GENERAL: Partial<Record<keyof PlayerAttributes, number>> = {
  pace: 0.06, strength: 0.04, stamina: 0.06, positioning: 0.06,
};

const ROLE_WEIGHTS: Record<Role, Partial<Record<keyof PlayerAttributes, number>>> = {
  GK: {
    reflexes: 0.18, handling: 0.15, oneOnOnes: 0.12, distribution: 0.10,
    positioning: 0.12, aerial: 0.10, concentration: 0.10, strength: 0.05,
    passing: 0.04, pace: 0.04,
  },
  CB: {
    ...OUTFIELD_GENERAL,
    tackling: 0.15, heading: 0.12, aerial: 0.10, strength: 0.10,
    concentration: 0.10, positioning: 0.10, pace: 0.05,
  },
  LB: {
    ...OUTFIELD_GENERAL,
    pace: 0.12, crossing: 0.12, stamina: 0.10, tackling: 0.10,
    passing: 0.08, acceleration: 0.08, dribbling: 0.06, positioning: 0.06,
  },
  RB: {
    ...OUTFIELD_GENERAL,
    pace: 0.12, crossing: 0.12, stamina: 0.10, tackling: 0.10,
    passing: 0.08, acceleration: 0.08, dribbling: 0.06, positioning: 0.06,
  },
  CDM: {
    ...OUTFIELD_GENERAL,
    tackling: 0.15, positioning: 0.12, passing: 0.10, concentration: 0.10,
    strength: 0.08, stamina: 0.08, heading: 0.05, vision: 0.05,
  },
  CM: {
    ...OUTFIELD_GENERAL,
    passing: 0.14, vision: 0.10, stamina: 0.10, positioning: 0.08,
    tackling: 0.08, dribbling: 0.06, shooting: 0.06, concentration: 0.06,
  },
  CAM: {
    ...OUTFIELD_GENERAL,
    vision: 0.14, passing: 0.12, dribbling: 0.10, finishing: 0.10,
    agility: 0.08, shooting: 0.08,
  },
  LW: {
    ...OUTFIELD_GENERAL,
    pace: 0.14, dribbling: 0.12, crossing: 0.10, acceleration: 0.10,
    agility: 0.08, finishing: 0.06, shooting: 0.06,
  },
  RW: {
    ...OUTFIELD_GENERAL,
    pace: 0.14, dribbling: 0.12, crossing: 0.10, acceleration: 0.10,
    agility: 0.08, finishing: 0.06, shooting: 0.06,
  },
  ST: {
    ...OUTFIELD_GENERAL,
    finishing: 0.16, shooting: 0.12, pace: 0.10, heading: 0.08,
    dribbling: 0.08, acceleration: 0.08, strength: 0.06, agility: 0.04,
  },
};

// --- Age curve multiplier ---

function ageCurveMultiplier(age: number): number {
  if (age <= 20) return 0.90 + (age - 17) * 0.03;  // 0.90..0.99 (potential premium handled elsewhere)
  if (age <= 25) return 1.0 + (age - 20) * 0.04;    // 1.00..1.20
  if (age <= 29) return 1.20;                         // peak
  if (age <= 34) return 1.20 - (age - 29) * 0.12;   // 1.08..0.60
  return 0.50;
}

// --- Public API ---

/**
 * Calculate a player's overall rating (0..100) based on attributes weighted by role.
 */
export function calculatePlayerRating(player: PlayerState): number {
  const role = player.role as Role;
  const weights = ROLE_WEIGHTS[role] ?? ROLE_WEIGHTS.CM; // fallback to CM
  const attrs = player.attributes;
  if (!attrs) return 50; // fallback for legacy/mock players without attributes

  let weighted = 0;
  let totalWeight = 0;
  for (const [attr, w] of Object.entries(weights)) {
    const val = attrs[attr as keyof PlayerAttributes];
    if (val !== undefined && w !== undefined) {
      weighted += val * w;
      totalWeight += w;
    }
  }

  // Normalize to 0..100
  const raw = totalWeight > 0 ? (weighted / totalWeight) * 100 : 50;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

/**
 * Calculate the base market value from rating + age.
 * Returns value in currency units (£).
 */
export function calculateBaseValue(player: PlayerState): number {
  const rating = calculatePlayerRating(player);
  const age = player.age ?? 25;
  const ageMult = ageCurveMultiplier(age);

  // Potential premium for young players
  const youthBonus = age <= 21 ? 1.15 : age <= 23 ? 1.05 : 1.0;

  // rating^2 gives exponential scaling: 50-rated ~ £2.5k, 70-rated ~ £5k, 90-rated ~ £8k
  const base = (rating * rating) * ageMult * youthBonus * 10;
  return Math.round(base / 100) * 100; // round to nearest 100
}

/**
 * Calculate performance modifier based on season stats.
 * Returns a multiplier offset (e.g. +0.15 means +15% value).
 */
export function calculatePerformanceModifier(
  stats: PlayerSeasonStats | null,
  totalMatchdays: number,
): number {
  if (!stats || totalMatchdays < 1) return 0;

  let mod = 0;

  // Goals and assists increase value
  mod += stats.goals * 0.05;
  mod += stats.assists * 0.03;

  // Clean sheets (primarily for GKs but any player can benefit)
  mod += stats.cleanSheets * 0.02;

  // Benched/unused penalty
  if (stats.appearances === 0 && totalMatchdays >= 5) {
    mod -= 0.10;
  } else if (stats.appearances < totalMatchdays * 0.3 && totalMatchdays >= 5) {
    mod -= 0.05;
  }

  // Discipline penalty
  mod -= stats.redCards * 0.05;

  // Clamp to reasonable range
  return Math.max(-0.30, Math.min(0.50, mod));
}

/**
 * Calculate a player's current market value considering base + performance.
 */
export function calculatePlayerValue(
  player: PlayerState,
  stats: PlayerSeasonStats | null,
  totalMatchdays: number,
): number {
  const base = calculateBaseValue(player);
  const perfMod = calculatePerformanceModifier(stats, totalMatchdays);
  return Math.max(100, Math.round((base * (1 + perfMod)) / 100) * 100);
}

/**
 * Position grouping for squad analysis.
 * Maps specific roles to positional groups.
 */
export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'FWD';

export function roleToGroup(role: Role | string): PositionGroup {
  switch (role) {
    case 'GK': return 'GK';
    case 'CB': case 'LB': case 'RB': return 'DEF';
    case 'CDM': case 'CM': case 'CAM': return 'MID';
    case 'LW': case 'RW': case 'ST': return 'FWD';
    default: return 'MID';
  }
}

export interface SquadGap {
  role: Role;
  bestRating: number;    // rating of best player in this role
  averageRating: number; // average rating across the team
  gap: number;           // averageRating - bestRating (positive = weak spot)
}

/**
 * Analyze a squad to identify positional weaknesses.
 * Returns roles sorted by weakness (largest gap first).
 */
export function analyzeSquadGaps(squad: PlayerState[]): SquadGap[] {
  // Calculate team-wide average rating
  const allRatings = squad.map(p => calculatePlayerRating(p));
  const avgRating = allRatings.reduce((a, b) => a + b, 0) / allRatings.length;

  // Group players by role and find best rating per role
  const roleMap = new Map<Role, number[]>();
  for (const p of squad) {
    const role = p.role as Role;
    const arr = roleMap.get(role) ?? [];
    arr.push(calculatePlayerRating(p));
    roleMap.set(role, arr);
  }

  const gaps: SquadGap[] = [];
  for (const [role, ratings] of roleMap) {
    const best = Math.max(...ratings);
    gaps.push({
      role,
      bestRating: best,
      averageRating: Math.round(avgRating),
      gap: avgRating - best,
    });
  }

  // Sort by largest gap first (most needy positions)
  gaps.sort((a, b) => b.gap - a.gap);
  return gaps;
}

/**
 * Get squad depth: players sorted by rating within each role.
 */
export function getSquadDepth(squad: PlayerState[]): Map<Role, PlayerState[]> {
  const depth = new Map<Role, PlayerState[]>();
  for (const p of squad) {
    const role = p.role as Role;
    const arr = depth.get(role) ?? [];
    arr.push(p);
    depth.set(role, arr);
  }

  // Sort each role group by rating (best first)
  for (const [role, players] of depth) {
    players.sort((a, b) => calculatePlayerRating(b) - calculatePlayerRating(a));
    depth.set(role, players);
  }

  return depth;
}
