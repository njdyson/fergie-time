import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { createAITeam, TIER_CONFIGS, TeamTier, ROLES_25 } from './teamGen.ts';
import { Vec2 } from '../simulation/math/vec2.ts';

describe('createAITeam', () => {
  it('produces 25 PlayerState objects', () => {
    const rng = seedrandom('strong-team');
    const squad = createAITeam('strong', 'team-a', 'Team A', rng);
    expect(squad).toHaveLength(25);
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
    expect(ids.size).toBe(25);
  });

  it('strong tier: all attribute values between 0.25 and 1.0', () => {
    // GK-specialist attributes (reflexes, handling, oneOnOnes, distribution) use base * 0.6
    // for outfield players, so they can dip well below 0.55
    const rng = seedrandom('strong-attrs');
    const squad = createAITeam('strong', 'team-s', 'Strong FC', rng);
    for (const p of squad) {
      const attrs = Object.values(p.attributes) as number[];
      for (const v of attrs) {
        expect(v).toBeGreaterThanOrEqual(0.25);
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

  it('mid tier: all attribute values between 0 and 1', () => {
    const rng = seedrandom('mid-attrs');
    const squad = createAITeam('mid', 'team-m', 'Mid FC', rng);
    for (const p of squad) {
      const attrs = Object.values(p.attributes) as number[];
      for (const v of attrs) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('weak tier: all attribute values between 0 and 1', () => {
    const rng = seedrandom('weak-attrs');
    const squad = createAITeam('weak', 'team-w', 'Weak FC', rng);
    for (const p of squad) {
      const attrs = Object.values(p.attributes) as number[];
      for (const v of attrs) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('role distribution matches 25-man squad: 3 GK, 5 CB, 2 LB, 2 RB, 2 CDM, 3 CM, 1 CAM, 2 LW, 2 RW, 3 ST', () => {
    const rng = seedrandom('roles');
    const squad = createAITeam('mid', 'team-r', 'Roles FC', rng);
    const roles = squad.map(p => p.role);

    const roleCounts: Record<string, number> = {};
    for (const r of roles) {
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    }

    expect(roleCounts['GK']).toBe(3);
    expect(roleCounts['CB']).toBe(5);
    expect(roleCounts['LB']).toBe(2);
    expect(roleCounts['RB']).toBe(2);
    expect(roleCounts['CDM']).toBe(2);
    expect(roleCounts['CM']).toBe(3);
    expect(roleCounts['CAM']).toBe(1);
    expect(roleCounts['LW']).toBe(2);
    expect(roleCounts['RW']).toBe(2);
    expect(roleCounts['ST']).toBe(3);
  });

  it('each player has shirtNumber 1..25, all unique', () => {
    const rng = seedrandom('shirt-numbers');
    const squad = createAITeam('mid', 'team-sn', 'Shirt FC', rng);
    const shirtNumbers = squad.map(p => p.shirtNumber);
    expect(shirtNumbers).toHaveLength(25);
    const unique = new Set(shirtNumbers);
    expect(unique.size).toBe(25);
    for (const n of shirtNumbers) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(25);
    }
  });

  it('uses provided names array when given', () => {
    const rng = seedrandom('names-param');
    const names = Array.from({ length: 25 }, (_, i) => `Player ${i + 1} Surname`);
    const squad = createAITeam('mid', 'team-n', 'Names FC', rng, names);
    for (let i = 0; i < 25; i++) {
      expect(squad[i]!.name).toBe(names[i]);
    }
  });

  it('falls back to generatePlayerName when names not provided', () => {
    const rng = seedrandom('no-names');
    const squad = createAITeam('mid', 'team-fn', 'Fallback FC', rng);
    for (const p of squad) {
      expect(p.name).toMatch(/\S+ \S+/);
    }
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

  it('uses Vec2 instances for movement fields', () => {
    const rng = seedrandom('vec2-fields');
    const squad = createAITeam('mid', 'vec-team', 'Vec Team', rng);
    for (const p of squad) {
      expect(p.position).toBeInstanceOf(Vec2);
      expect(p.velocity).toBeInstanceOf(Vec2);
      expect(p.formationAnchor).toBeInstanceOf(Vec2);
    }
  });
});

describe('ROLES_25', () => {
  it('has exactly 25 entries', () => {
    expect(ROLES_25).toHaveLength(25);
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
