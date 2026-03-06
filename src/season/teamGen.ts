/**
 * AI team squad generation with quality tiers.
 */

import type { PlayerState, PlayerAttributes, PersonalityVector, Role, TeamId } from '../simulation/types.ts';
import { Duty } from '../simulation/types.ts';
import { Vec2 } from '../simulation/math/vec2.ts';
import { generatePlayerName } from './nameGen.ts';

export const TeamTier = {
  STRONG: 'strong',
  MID: 'mid',
  WEAK: 'weak',
} as const;
export type TeamTier = (typeof TeamTier)[keyof typeof TeamTier];

export const TIER_CONFIGS = {
  strong: { base: 0.75, spread: 0.08 },
  mid: { base: 0.60, spread: 0.10 },
  weak: { base: 0.45, spread: 0.10 },
} as const;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function generateAttribute(base: number, spread: number, rng: () => number): number {
  return clamp(base + (rng() - 0.5) * 2 * spread, 0, 1);
}

function generateAttributes(base: number, spread: number, rng: () => number): PlayerAttributes {
  return {
    pace: generateAttribute(base, spread, rng),
    strength: generateAttribute(base, spread, rng),
    stamina: generateAttribute(base, spread, rng),
    dribbling: generateAttribute(base, spread, rng),
    passing: generateAttribute(base, spread, rng),
    shooting: generateAttribute(base, spread, rng),
    tackling: generateAttribute(base, spread, rng),
    aerial: generateAttribute(base, spread, rng),
    positioning: generateAttribute(base, spread, rng),
    vision: generateAttribute(base, spread, rng),
  };
}

function generatePersonality(rng: () => number): PersonalityVector {
  return {
    directness: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    risk_appetite: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    composure: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    creativity: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    work_rate: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    aggression: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    anticipation: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
    flair: clamp(0.5 + (rng() - 0.5) * 0.4, 0, 1),
  };
}

// 25-man squad roles
// Starters (11) - 4-4-2: GK, CB, CB, LB, RB, CDM, CM, LW, RW, ST, ST
// Bench (7): GK, CB, CB, LB, CM, CAM, ST
// Reserves (7): CB, RB, CDM, CM, LW, RW, GK
// Totals: 3 GK, 5 CB, 2 LB, 2 RB, 2 CDM, 3 CM, 1 CAM, 2 LW, 2 RW, 3 ST = 25
export const ROLES_25: Role[] = [
  // Starters (11)
  'GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'ST', 'ST',
  // Bench (7)
  'GK', 'CB', 'CB', 'LB', 'CM', 'CAM', 'ST',
  // Reserves (7)
  'CB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'GK',
];

/**
 * Create an AI team squad with 25 players.
 * @param names - Optional array of player names to use instead of generated ones
 */
export function createAITeam(
  tier: TeamTier,
  teamId: string,
  _teamName: string,
  rng: () => number,
  names?: string[],
): PlayerState[] {
  const config = TIER_CONFIGS[tier];

  return ROLES_25.map((role, index): PlayerState => ({
    id: `${teamId}-player-${index}`,
    teamId: teamId as TeamId,
    position: Vec2.zero(),
    velocity: Vec2.zero(),
    attributes: generateAttributes(config.base, config.spread, rng),
    personality: generatePersonality(rng),
    fatigue: 0,
    role,
    duty: Duty.SUPPORT,
    formationAnchor: Vec2.zero(),
    name: names?.[index] ?? generatePlayerName(rng),
    age: Math.floor(rng() * 18) + 17,
    height: Math.floor(rng() * 36) + 165,
    shirtNumber: index + 1,
  }));
}
