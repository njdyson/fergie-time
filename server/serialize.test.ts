/**
 * Round-trip serialization tests for SeasonState.
 * Verifies that Map types survive JSON encode/decode and version envelope is preserved.
 */

import { describe, it, expect } from 'vitest';
import { serializeState, deserializeState } from './serialize.ts';
import type { SeasonState } from '../src/season/season.ts';
import { createSeason } from '../src/season/season.ts';

function makeMinimalState(overrides: Partial<SeasonState> = {}): SeasonState {
  const fatigueMap = new Map<string, number>();
  fatigueMap.set('player-1', 0.35);
  fatigueMap.set('player-2', 0.72);

  return {
    seasonNumber: 1,
    playerTeamId: 'team-player',
    teams: [],
    fixtures: [],
    table: [],
    currentMatchday: 5,
    fatigueMap,
    seed: 'test-seed',
    ...overrides,
  };
}

describe('serializeState / deserializeState', () => {
  it('preserves Map types through JSON encode/decode', () => {
    const state = makeMinimalState();
    const json = serializeState(state);
    const envelope = deserializeState(json);

    expect(envelope.state.fatigueMap).toBeInstanceOf(Map);
    expect(envelope.state.fatigueMap.size).toBe(2);
    expect(envelope.state.fatigueMap.get('player-1')).toBeCloseTo(0.35);
    expect(envelope.state.fatigueMap.get('player-2')).toBeCloseTo(0.72);
  });

  it('preserves version field', () => {
    const state = makeMinimalState();
    const json = serializeState(state, 1);
    const envelope = deserializeState(json);

    expect(envelope.version).toBe(1);
  });

  it('handles empty Map', () => {
    const state = makeMinimalState({ fatigueMap: new Map() });
    const json = serializeState(state);
    const envelope = deserializeState(json);

    expect(envelope.state.fatigueMap).toBeInstanceOf(Map);
    expect(envelope.state.fatigueMap.size).toBe(0);
  });

  it('handles full SeasonState from createSeason', () => {
    const playerSquad = Array.from({ length: 16 }, (_, i) => ({
      id: `p-${i}`,
      name: `Player ${i}`,
      role: i === 0 ? 'GK' as const : 'CM' as const,
      shooting: 50,
      passing: 50,
      tackling: 50,
      pace: 50,
      stamina: 50,
      creativity: 50,
      fatigue: 0,
      personality: { aggression: 0.5, workRate: 0.5, composure: 0.5, creativity: 0.5, leadership: 0.5 },
    }));
    const state = createSeason('team-player', 'My Team', playerSquad, 'seed-42');

    const json = serializeState(state);
    const envelope = deserializeState(json);
    const restored = envelope.state;

    expect(restored.fatigueMap).toBeInstanceOf(Map);
    expect(restored.fatigueMap.size).toBeGreaterThan(0);
    expect(restored.fatigueMap.size).toBe(state.fatigueMap.size);
    expect(restored.teams.length).toBe(state.teams.length);
    expect(restored.teams.map(t => t.name)).toEqual(state.teams.map(t => t.name));
    expect(restored.fixtures.length).toBe(state.fixtures.length);
    expect(restored.table.length).toBe(state.table.length);
    expect(restored.seasonNumber).toBe(state.seasonNumber);
    expect(restored.playerTeamId).toBe(state.playerTeamId);
    expect(restored.currentMatchday).toBe(state.currentMatchday);
    expect(restored.seed).toBe(state.seed);
  });

  it('serialized output is valid JSON string', () => {
    const state = makeMinimalState();
    const json = serializeState(state);

    expect(typeof json).toBe('string');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('version field sits in envelope, not inside state', () => {
    const state = makeMinimalState();
    const json = serializeState(state, 2);
    const raw = JSON.parse(json);

    expect(raw).toHaveProperty('version', 2);
    expect(raw.state).not.toHaveProperty('version');
  });
});
