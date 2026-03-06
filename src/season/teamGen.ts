/**
 * AI team squad generation with quality tiers.
 */

import type { PlayerState, PlayerAttributes, PersonalityVector, Role, TeamId } from '../simulation/types.ts';
import { Duty } from '../simulation/types.ts';
import { Vec2 } from '../simulation/math/vec2.ts';
import { generatePlayerName } from './nameGen.ts';
import type { PlayerName } from './nameService.ts';

export const TeamTier = {
  STRONG: 'strong',
  MID: 'mid',
  WEAK: 'weak',
} as const;
export type TeamTier = (typeof TeamTier)[keyof typeof TeamTier];

export const TIER_CONFIGS = {
  strong: { base: 0.75, spread: 0.18 },
  mid: { base: 0.60, spread: 0.20 },
  weak: { base: 0.45, spread: 0.20 },
} as const;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function generateAttribute(base: number, spread: number, rng: () => number): number {
  return clamp(base + (rng() - 0.5) * 2 * spread, 0, 1);
}

// Role-based attribute boosts — makes players feel distinct by position
const ROLE_BOOSTS: Partial<Record<Role, Partial<Record<keyof PlayerAttributes, number>>>> = {
  GK:  { positioning: 0.15, aerial: 0.10, reflexes: 0.30, handling: 0.28, oneOnOnes: 0.25, distribution: 0.20, concentration: 0.10 },
  CB:  { tackling: 0.12, strength: 0.10, aerial: 0.10, heading: 0.12, concentration: 0.08 },
  LB:  { pace: 0.10, stamina: 0.08, crossing: 0.10, acceleration: 0.06 },
  RB:  { pace: 0.10, stamina: 0.08, crossing: 0.10, acceleration: 0.06 },
  CDM: { tackling: 0.10, positioning: 0.10, passing: 0.05, concentration: 0.08 },
  CM:  { passing: 0.10, stamina: 0.08, vision: 0.08, concentration: 0.05 },
  CAM: { vision: 0.12, passing: 0.10, dribbling: 0.08, agility: 0.08, finishing: 0.05 },
  LW:  { pace: 0.12, dribbling: 0.10, acceleration: 0.10, crossing: 0.10, agility: 0.08 },
  RW:  { pace: 0.12, dribbling: 0.10, acceleration: 0.10, crossing: 0.10, agility: 0.08 },
  ST:  { shooting: 0.15, pace: 0.08, dribbling: 0.05, finishing: 0.15, acceleration: 0.08, heading: 0.08 },
};

function generateAttributes(base: number, spread: number, rng: () => number, role: Role): PlayerAttributes {
  const boosts = ROLE_BOOSTS[role] ?? {};
  return {
    pace: generateAttribute(base + (boosts.pace ?? 0), spread, rng),
    strength: generateAttribute(base + (boosts.strength ?? 0), spread, rng),
    stamina: generateAttribute(base + (boosts.stamina ?? 0), spread, rng),
    dribbling: generateAttribute(base + (boosts.dribbling ?? 0), spread, rng),
    passing: generateAttribute(base + (boosts.passing ?? 0), spread, rng),
    shooting: generateAttribute(base + (boosts.shooting ?? 0), spread, rng),
    tackling: generateAttribute(base + (boosts.tackling ?? 0), spread, rng),
    aerial: generateAttribute(base + (boosts.aerial ?? 0), spread, rng),
    positioning: generateAttribute(base + (boosts.positioning ?? 0), spread, rng),
    vision: generateAttribute(base + (boosts.vision ?? 0), spread, rng),
    acceleration: generateAttribute(base + (boosts.acceleration ?? 0), spread, rng),
    crossing: generateAttribute(base + (boosts.crossing ?? 0), spread, rng),
    finishing: generateAttribute(base + (boosts.finishing ?? 0), spread, rng),
    agility: generateAttribute(base + (boosts.agility ?? 0), spread, rng),
    heading: generateAttribute(base + (boosts.heading ?? 0), spread, rng),
    concentration: generateAttribute(base + (boosts.concentration ?? 0), spread, rng),
    reflexes: generateAttribute((role === 'GK' ? base : base * 0.6) + (boosts.reflexes ?? 0), spread, rng),
    handling: generateAttribute((role === 'GK' ? base : base * 0.6) + (boosts.handling ?? 0), spread, rng),
    oneOnOnes: generateAttribute((role === 'GK' ? base : base * 0.6) + (boosts.oneOnOnes ?? 0), spread, rng),
    distribution: generateAttribute((role === 'GK' ? base : base * 0.6) + (boosts.distribution ?? 0), spread, rng),
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
 * @param names - Optional array of player names (with nationality) to use instead of generated ones
 */
export function createAITeam(
  tier: TeamTier,
  teamId: string,
  _teamName: string,
  rng: () => number,
  names?: PlayerName[] | string[],
): PlayerState[] {
  const config = TIER_CONFIGS[tier];
  const defaultNats = ['GB', 'ES', 'FR', 'DE', 'BR'];

  return ROLES_25.map((role, index): PlayerState => {
    const entry = names?.[index];
    const playerName = entry == null
      ? generatePlayerName(rng)
      : typeof entry === 'string' ? entry : entry.name;
    const nationality = entry != null && typeof entry !== 'string'
      ? entry.nationality
      : defaultNats[Math.floor(rng() * defaultNats.length)]!;

    return {
      id: `${teamId}-player-${index}`,
      teamId: teamId as TeamId,
      position: Vec2.zero(),
      velocity: Vec2.zero(),
      attributes: generateAttributes(config.base, config.spread, rng, role),
      personality: generatePersonality(rng),
      fatigue: 0,
      role,
      duty: Duty.SUPPORT,
      formationAnchor: Vec2.zero(),
      name: playerName,
      age: Math.floor(rng() * 18) + 17,
      height: Math.floor(rng() * 36) + 165,
      shirtNumber: index + 1,
      nationality,
    };
  });
}
