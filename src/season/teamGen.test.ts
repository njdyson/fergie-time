import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { createAITeam, TIER_CONFIGS, TeamTier } from './teamGen.ts';
import type { PlayerState, PlayerAttributes, PersonalityVector } from '../simulation/types.ts';

describe('createAITeam', () => {
  it('produces 16 PlayerState objects', () => {
    const rng = seedrandom('strong-team');
    const squad = createAITeam('strong', 'team-a', 'Team A', rng);
    expect(squad).toHaveLength(16);
  });

  it('each player has a generated name, unique id, age (17..34), height (165..200)', () => {
    const rng = seedrandom('details');
    const squad = createAITeam('mid', 'team-b', 'Team B', rng);
    const ids = new Set<string>();
    for (const p of squad) {
      expect(p.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(p.id).toBeTruthy();
      ids.add(p.id);
      expect(p.age).toBeGreaterThanOrEqual(17);
      expect(p.age).toBeLessThanOrEqual(34);
      expect(p.height).toBeGreaterThanOrEqual(165);
      expect(p.height).toBeLessThanOrEqual(200);
    }
    expect(ids.size).toBe(16);
  });

  it('strong tier: all attribute values between 0.55 and 1.0', () => {
    const rng = seedrandom('strong-attrs');
    const squad = createAITeam('strong', 'team-s', 'Strong FC', rng);
    for (const p of squad) {
      const attrs = Object.values(p.attributes) as number[];
      for (const v of attrs) {
        expect(v).toBeGreaterThanOrEqual(0.55);
        expect(v).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('strong tier: mean attribute ~0.75 (within tolerance)', () => {
    const rng = seedrandom('strong-mean');
    const squad = createAITeam('strong', 'team-sm', 'Strong Mean', rng);
    const allAttrs: number[] = [];
    for (const p of squad) {
      allAttrs.push(...(Object.values(p.attributes) as number[]));
    }
    const mean = allAttrs.reduce((a, b) => a + b, 0) / allAttrs.length;
    expect(mean).toBeGreaterThan(0.65);
    expect(mean).toBeLessThan(0.85);
  });

  it('mid tier: all attribute values between 0.40 and 0.90', () => {
    const rng = seedrandom('mid-attrs');
    const squad = createAITeam('mid', 'team-m', 'Mid FC', rng);
    for (const p of squad) {
      const attrs = Object.values(p.attributes) as number[];
      for (const v of attrs) {
        expect(v).toBeGreaterThanOrEqual(0.40);
        expect(v).toBeLessThanOrEqual(0.90);
      }
    }
  });

  it('weak tier: all attribute values between 0.25 and 0.75', () => {
    const rng = seedrandom('weak-attrs');
    const squad = createAITeam('weak', 'team-w', 'Weak FC', rng);
    for (const p of squad) {
      const attrs = Object.values(p.attributes) as number[];
      for (const v of attrs) {
        expect(v).toBeGreaterThanOrEqual(0.25);
        expect(v).toBeLessThanOrEqual(0.75);
      }
    }
  });

  it('roles distributed to form a valid 4-4-2 with bench', () => {
    const rng = seedrandom('roles');
    const squad = createAITeam('mid', 'team-r', 'Roles FC', rng);
    const roles = squad.map(p => p.role);

    // Count each role
    const roleCounts: Record<string, number> = {};
    for (const r of roles) {
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    }

    // 1 GK starters + 1 GK bench = 2 GK total
    expect(roleCounts['GK']).toBe(2);
    // DEF: 2 CB + 1 LB + 1 RB starters + 1 CB bench = 3 CB, 1 LB, 1 RB
    expect(roleCounts['CB']).toBe(3);
    expect(roleCounts['LB']).toBe(1);
    expect(roleCounts['RB']).toBe(1);
    // MID: 1 CDM + 2 CM starters + 1 CM bench = 1 CDM, 3 CM
    expect(roleCounts['CDM']).toBe(1);
    expect(roleCounts['CM']).toBe(3);
    // Wide: 1 LW + 1 RW
    expect(roleCounts['LW']).toBe(1);
    expect(roleCounts['RW']).toBe(1);
    // FWD: 2 ST starters + 1 ST bench = 3 ST
    expect(roleCounts['ST']).toBe(3);
  });

  it('each player has fatigue 0 and duty SUPPORT', () => {
    const rng = seedrandom('defaults');
    const squad = createAITeam('strong', 'team-d', 'Defaults FC', rng);
    for (const p of squad) {
      expect(p.fatigue).toBe(0);
      expect(p.duty).toBe('SUPPORT');
    }
  });

  it('player ids follow teamId-player-index pattern', () => {
    const rng = seedrandom('id-pattern');
    const squad = createAITeam('weak', 'my-team', 'My Team', rng);
    squad.forEach((p, i) => {
      expect(p.id).toBe(`my-team-player-${i}`);
    });
  });
});

describe('TeamTier', () => {
  it('has STRONG, MID, WEAK values', () => {
    expect(TeamTier.STRONG).toBe('strong');
    expect(TeamTier.MID).toBe('mid');
    expect(TeamTier.WEAK).toBe('weak');
  });
});

describe('TIER_CONFIGS', () => {
  it('has configs for strong, mid, weak', () => {
    expect(TIER_CONFIGS.strong.base).toBe(0.75);
    expect(TIER_CONFIGS.mid.base).toBe(0.60);
    expect(TIER_CONFIGS.weak.base).toBe(0.45);
  });
});
