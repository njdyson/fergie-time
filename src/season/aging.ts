/**
 * Age progression system — pure functions for season-to-season player evolution.
 *
 * Applied once per season during startNewSeason():
 * - Physical attribute decay from age 28+
 * - Mental attribute + personality growth with age
 * - Retirement probability for older players
 * - AI team training boosts (simplified simulation)
 *
 * All functions are pure — no side effects, no external state.
 */

import type { PlayerState, PlayerAttributes, PersonalityVector, Role } from '../simulation/types.ts';
import type { TeamTier } from './teamGen.ts';
import { ROLE_BOOSTS } from './teamGen.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Physical attributes subject to age-related decay. */
const PHYSICAL_ATTRS: Array<keyof PlayerAttributes> = [
  'pace', 'acceleration', 'stamina', 'agility', 'strength',
];

/** Mental player attributes that improve with age. */
const MENTAL_ATTRS: Array<keyof PlayerAttributes> = [
  'positioning', 'vision', 'concentration',
];

/** Personality traits that improve with age. */
const MENTAL_PERSONALITY_TRAITS: Array<keyof PersonalityVector> = [
  'composure', 'anticipation', 'work_rate',
];

/** All trainable attributes — used for AI random boost selection. */
const ALL_ATTRS: Array<keyof PlayerAttributes> = [
  'pace', 'strength', 'stamina', 'acceleration', 'agility',
  'dribbling', 'passing', 'shooting', 'finishing', 'crossing',
  'tackling', 'aerial', 'heading', 'positioning', 'vision', 'concentration',
  'reflexes', 'handling', 'oneOnOnes', 'distribution',
];

// ---------------------------------------------------------------------------
// Age increment
// ---------------------------------------------------------------------------

/** Returns a new PlayerState with age incremented by 1. */
export function incrementAge(player: PlayerState): PlayerState {
  return { ...player, age: (player.age ?? 25) + 1 };
}

// ---------------------------------------------------------------------------
// Physical decay
// ---------------------------------------------------------------------------

/**
 * Returns the per-attribute decay amount based on age.
 * Applied once per season after age increment.
 *
 * Age brackets:
 *   <28:   0 (no decay)
 *   28-30: 0.008
 *   31-33: 0.015
 *   34+:   0.025
 */
function getDecayAmount(age: number): number {
  if (age < 28) return 0;
  if (age <= 30) return 0.008;
  if (age <= 33) return 0.015;
  return 0.025;
}

/**
 * Applies physical attribute decay to a player based on their age.
 * Affected attributes: pace, acceleration, stamina, agility, strength.
 * Floor: attributes cannot drop below 0.20.
 */
export function applyPhysicalDecay(player: PlayerState): PlayerState {
  const age = player.age ?? 25;
  const decay = getDecayAmount(age);
  if (decay === 0) return player;

  const newAttrs = { ...player.attributes } as Record<keyof PlayerAttributes, number>;
  for (const attr of PHYSICAL_ATTRS) {
    newAttrs[attr] = Math.max(0.20, newAttrs[attr] - decay);
  }
  return { ...player, attributes: newAttrs as PlayerAttributes };
}

// ---------------------------------------------------------------------------
// Mental growth
// ---------------------------------------------------------------------------

/**
 * Returns the per-attribute/trait growth amount based on age.
 *
 * Age brackets:
 *   <24:   0.010
 *   24-30: 0.015 (peak growth)
 *   31+:   0.008
 */
function getGrowthAmount(age: number): number {
  if (age < 24) return 0.010;
  if (age <= 30) return 0.015;
  return 0.008;
}

/**
 * Applies mental growth to a player's attributes and personality traits.
 * Attributes: positioning, vision, concentration.
 * Personality: composure, anticipation, work_rate.
 * Capped at 1.0.
 */
export function applyMentalGrowth(player: PlayerState): PlayerState {
  const age = player.age ?? 25;
  const growth = getGrowthAmount(age);

  const newAttrs = { ...player.attributes } as Record<keyof PlayerAttributes, number>;
  for (const attr of MENTAL_ATTRS) {
    newAttrs[attr] = Math.min(1.0, newAttrs[attr] + growth);
  }

  const newPersonality = { ...player.personality } as Record<keyof PersonalityVector, number>;
  for (const trait of MENTAL_PERSONALITY_TRAITS) {
    newPersonality[trait] = Math.min(1.0, newPersonality[trait] + growth);
  }

  return {
    ...player,
    attributes: newAttrs as PlayerAttributes,
    personality: newPersonality as PersonalityVector,
  };
}

// ---------------------------------------------------------------------------
// Retirement
// ---------------------------------------------------------------------------

/**
 * Retirement probability by age, checked once per season.
 *
 *   <=32: 0%
 *   33:   5%
 *   34:   15%
 *   35:   35%
 *   36:   60%
 *   37+:  85%
 */
function getRetirementProbability(age: number): number {
  if (age <= 32) return 0;
  if (age === 33) return 0.05;
  if (age === 34) return 0.15;
  if (age === 35) return 0.35;
  if (age === 36) return 0.60;
  return 0.85;
}

/** Returns true if the player should retire this season. */
export function shouldRetire(player: PlayerState, rng: () => number): boolean {
  const age = player.age ?? 25;
  const prob = getRetirementProbability(age);
  return rng() < prob;
}

// ---------------------------------------------------------------------------
// AI training boosts
// ---------------------------------------------------------------------------

/**
 * Applies simplified training boosts to an AI team squad.
 * Each player gets 3-5 random role-relevant attribute boosts.
 * Boost magnitude scales with team tier (stronger teams train harder).
 */
export function applyAITrainingBoosts(
  squad: PlayerState[],
  tier: TeamTier,
  rng: () => number,
): PlayerState[] {
  const boostAmounts: Record<TeamTier, number> = {
    strong: 0.012,
    mid: 0.008,
    weak: 0.005,
  };
  const boostPerAttr = boostAmounts[tier];

  return squad.map(player => {
    // Collect role-relevant attributes
    const role = player.role as Role;
    const roleAttrs = Object.keys(ROLE_BOOSTS[role] ?? {}) as Array<keyof PlayerAttributes>;
    // Merge with some random attributes for variety
    const candidateAttrs = [...new Set([...roleAttrs, ...pickRandom(ALL_ATTRS, 3, rng)])];

    // Pick 3-5 attributes to boost
    const numBoosts = 3 + Math.floor(rng() * 3); // 3, 4, or 5
    const attrsToBoost = pickRandom(candidateAttrs, Math.min(numBoosts, candidateAttrs.length), rng);

    const newAttrs = { ...player.attributes } as Record<keyof PlayerAttributes, number>;
    for (const attr of attrsToBoost) {
      const current = newAttrs[attr];
      newAttrs[attr] = Math.min(1.0, current + boostPerAttr * (1 - current));
    }

    return { ...player, attributes: newAttrs as PlayerAttributes };
  });
}

/** Pick n random unique items from an array. */
function pickRandom<T>(arr: T[], n: number, rng: () => number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, n);
}

// ---------------------------------------------------------------------------
// Full season progression
// ---------------------------------------------------------------------------

/** Applies all age-related progression to a single player (age, decay, growth). */
export function applySeasonProgression(player: PlayerState): PlayerState {
  let p = incrementAge(player);
  p = applyPhysicalDecay(p);
  p = applyMentalGrowth(p);
  return p;
}
