import { describe, expect, it } from 'vitest';
import { Vec2 } from '../simulation/math/vec2.ts';
import type { PlayerState } from '../simulation/types.ts';
import { Duty } from '../simulation/types.ts';
import { ROLES_25 } from './teamGen.ts';
import { buildFormationTacticalConfig, getPreferredFormationForTier, pickAssistantLineup } from './assistantPicks.ts';

function makePlayer(id: string, role: string, fatigue: number = 0): PlayerState {
  const base = role === 'GK' ? 0.65 : 0.6;
  const gk = role === 'GK';
  return {
    id,
    teamId: 'home',
    position: Vec2.zero(),
    velocity: Vec2.zero(),
    attributes: {
      pace: base, strength: base, stamina: base, dribbling: base,
      passing: base, shooting: base, tackling: base, aerial: base,
      positioning: base, vision: base,
      acceleration: base, crossing: base, finishing: base, agility: base,
      heading: base, concentration: base,
      reflexes: gk ? 0.8 : 0.35,
      handling: gk ? 0.8 : 0.35,
      oneOnOnes: gk ? 0.75 : 0.35,
      distribution: gk ? 0.7 : 0.4,
    },
    personality: {
      directness: 0.5, risk_appetite: 0.5, composure: 0.5, creativity: 0.5,
      work_rate: 0.5, aggression: 0.5, anticipation: 0.5, flair: 0.5,
    },
    fatigue,
    role,
    duty: Duty.SUPPORT,
    formationAnchor: Vec2.zero(),
    name: id,
  };
}

function makeSquad(): PlayerState[] {
  return ROLES_25.map((role, i) => makePlayer(`p-${i}`, role));
}

describe('assistantPicks', () => {
  it('picks 11 starters and 7 bench for a formation', () => {
    const squad = makeSquad();
    const lineup = pickAssistantLineup(squad, '4-3-3');
    expect(lineup.starters).toHaveLength(11);
    expect(lineup.bench).toHaveLength(7);
  });

  it('selects exactly one GK in starters for standard 4-at-the-back formations', () => {
    const squad = makeSquad();
    const lineup = pickAssistantLineup(squad, '4-2-3-1');
    const gks = lineup.starters.filter((p) => p.role === 'GK');
    expect(gks).toHaveLength(1);
  });

  it('avoids extremely fatigued picks when a fit alternative exists', () => {
    const squad = makeSquad();
    const strikerIndices = squad
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.role === 'ST')
      .map(({ i }) => i);

    const tiredIdx = strikerIndices[0]!;
    const fitIdx = strikerIndices[1]!;

    squad[tiredIdx] = {
      ...squad[tiredIdx]!,
      fatigue: 0.98,
      attributes: { ...squad[tiredIdx]!.attributes, finishing: 1, shooting: 1 },
    };
    squad[fitIdx] = {
      ...squad[fitIdx]!,
      fatigue: 0.05,
      attributes: { ...squad[fitIdx]!.attributes, finishing: 0.72, shooting: 0.72 },
    };

    const lineup = pickAssistantLineup(squad, '4-5-1');
    const pickedStrikers = lineup.starters.filter((p) => p.role === 'ST');
    expect(pickedStrikers).toHaveLength(1);
    expect(pickedStrikers[0]!.id).toBe(squad[fitIdx]!.id);
  });

  it('maps 4-5-1 wide-mid labels to engine-safe wide roles', () => {
    const cfg = buildFormationTacticalConfig('4-5-1');
    expect(cfg.roles).toHaveLength(11);
    expect(cfg.roles.includes('LW')).toBe(true);
    expect(cfg.roles.includes('RW')).toBe(true);
  });

  it('returns valid preferred formations for each tier', () => {
    const rng = () => 0.12345;
    expect(['4-4-2', '4-3-3', '4-5-1', '3-5-2', '4-2-3-1']).toContain(getPreferredFormationForTier('strong', rng));
    expect(['4-4-2', '4-3-3', '4-5-1', '3-5-2', '4-2-3-1']).toContain(getPreferredFormationForTier('mid', rng));
    expect(['4-4-2', '4-3-3', '4-5-1', '3-5-2', '4-2-3-1']).toContain(getPreferredFormationForTier('weak', rng));
  });
});
