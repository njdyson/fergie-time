import { describe, expect, it } from 'vitest';
import { choosePreferredBuiltInTacticName, getDefaultBuiltInTacticName, loadBuiltInTacticSystem } from './tacticalPresets.ts';

describe('tacticalPresets', () => {
  it('loads built-in system with in/out configs', () => {
    const name = getDefaultBuiltInTacticName();
    const system = loadBuiltInTacticSystem(name);
    expect(system).not.toBeNull();
    expect(system?.inPossession.roles).toHaveLength(11);
    expect(system?.outOfPossession.roles).toHaveLength(11);
    expect(system?.inPossession.multipliers).toHaveLength(11);
    expect(system?.outOfPossession.multipliers).toHaveLength(11);
  });

  it('chooses a tactic name for each team tier', () => {
    const rng = () => 0.25;
    expect(choosePreferredBuiltInTacticName('strong', rng).length).toBeGreaterThan(0);
    expect(choosePreferredBuiltInTacticName('mid', rng).length).toBeGreaterThan(0);
    expect(choosePreferredBuiltInTacticName('weak', rng).length).toBeGreaterThan(0);
  });
});
