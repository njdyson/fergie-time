import { beforeEach, describe, expect, it } from 'vitest';
import {
  listBuiltInTactics,
  listTactics,
  loadTactic,
  saveTactic,
  deleteTactic,
  type SavedTactic,
} from './tacticStore.ts';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function cloneTactic(tactic: SavedTactic): SavedTactic {
  return JSON.parse(JSON.stringify(tactic)) as SavedTactic;
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
});

describe('tacticStore built-in presets', () => {
  it('lists built-ins in the main tactic list and can load one', () => {
    const builtIns = listBuiltInTactics();
    expect(builtIns.length).toBeGreaterThanOrEqual(5);
    expect(listTactics()).toEqual(builtIns);

    const preset = loadTactic(builtIns[0]!);
    expect(preset).not.toBeNull();
    expect(preset?.phases.inPossession.positions).toHaveLength(11);
    expect(preset?.phases.outOfPossession.positions).toHaveLength(11);
  });

  it('allows overriding a built-in and deleting the override to fall back', () => {
    const tacticName = listBuiltInTactics()[0]!;
    const base = loadTactic(tacticName)!;

    const overridden = cloneTactic(base);
    overridden.phases.inPossession.teamControls = {
      ...overridden.phases.inPossession.teamControls,
      tempo: 0.99,
    };
    saveTactic(overridden);

    expect(loadTactic(tacticName)?.phases.inPossession.teamControls.tempo).toBe(0.99);

    deleteTactic(tacticName);

    expect(loadTactic(tacticName)?.phases.inPossession.teamControls.tempo)
      .toBe(base.phases.inPossession.teamControls.tempo);
  });

  it('keeps custom non-built-in tactics in the picker list', () => {
    const base = loadTactic(listBuiltInTactics()[0]!)!;
    const custom = cloneTactic(base);
    custom.name = 'My Custom System';
    saveTactic(custom);

    const listed = listTactics();
    expect(listed).toContain('My Custom System');
    expect(loadTactic('My Custom System')?.name).toBe('My Custom System');
  });
});
