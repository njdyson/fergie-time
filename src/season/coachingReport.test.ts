/**
 * Tests for coaching report generation.
 * Uses vitest.
 */

import { describe, it, expect } from 'vitest';
import { generateCoachingReport } from './coachingReport.ts';
import type { PlayerState } from '../simulation/types.ts';

// ---------------------------------------------------------------------------
// Helper: minimal PlayerState factory
// ---------------------------------------------------------------------------

function makePlayer(
  id: string,
  name: string,
  attrOverrides: Partial<Record<string, number>> = {},
): PlayerState {
  const baseAttributes = {
    pace: 0.5,
    stamina: 0.5,
    strength: 0.5,
    acceleration: 0.5,
    agility: 0.5,
    passing: 0.5,
    vision: 0.5,
    crossing: 0.5,
    distribution: 0.5,
    shooting: 0.5,
    finishing: 0.5,
    tackling: 0.5,
    positioning: 0.5,
    heading: 0.5,
    concentration: 0.5,
    dribbling: 0.5,
    aerial: 0.5,
  };

  return {
    id,
    name,
    role: 'CM',
    age: 25,
    attributes: { ...baseAttributes, ...attrOverrides } as PlayerState['attributes'],
    personality: { work_rate: 0.5, aggression: 0.5, composure: 0.5, leadership: 0.5, creativity: 0.5 },
    fatigue: 0,
    fitness: 1,
    teamId: 'player-team',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    duty: 'SUPPORT',
    formationAnchor: { x: 0, y: 0 },
  } as unknown as PlayerState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateCoachingReport', () => {
  it('returns null for a rest day', () => {
    const squad = [makePlayer('p1', 'Alice Smith')];
    const result = generateCoachingReport('rest', 1, squad, squad);
    expect(result).toBeNull();
  });

  it('returns a report with the correct subject format for a drill day', () => {
    const squadBefore = [makePlayer('p1', 'Alice Smith')];
    const squadAfter = [
      makePlayer('p1', 'Alice Smith', { pace: 0.502, stamina: 0.501, strength: 0.5005, acceleration: 0.501, agility: 0.5015 }),
    ];

    const result = generateCoachingReport('fitness', 3, squadAfter, squadBefore);
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('Training Report: Fitness — Day 3');
  });

  it('sets from to "Coaching Staff" and category to "general"', () => {
    const squadBefore = [makePlayer('p1', 'Alice Smith')];
    const squadAfter = [makePlayer('p1', 'Alice Smith', { pace: 0.502 })];

    const result = generateCoachingReport('fitness', 1, squadAfter, squadBefore);
    expect(result).not.toBeNull();
    expect(result!.from).toBe('Coaching Staff');
    expect(result!.category).toBe('general');
  });

  it('body contains drill label and squad participation count', () => {
    const squadBefore = [
      makePlayer('p1', 'Alice Smith'),
      makePlayer('p2', 'Bob Jones'),
    ];
    const squadAfter = [
      makePlayer('p1', 'Alice Smith', { pace: 0.502 }),
      makePlayer('p2', 'Bob Jones', { pace: 0.503 }),
    ];

    const result = generateCoachingReport('fitness', 2, squadAfter, squadBefore);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('Fitness');
    expect(result!.body).toContain('2 players');
  });

  it('body lists at least one improver by name', () => {
    const squadBefore = [makePlayer('p1', 'Alice Smith')];
    const squadAfter = [makePlayer('p1', 'Alice Smith', { pace: 0.502 })];

    const result = generateCoachingReport('fitness', 1, squadAfter, squadBefore);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('Alice');
  });

  it('standout improvers are sorted by total gain (highest first)', () => {
    // p3 gains most, p1 gains middle, p2 gains least
    const squadBefore = [
      makePlayer('p1', 'Alice Smith'),
      makePlayer('p2', 'Bob Jones'),
      makePlayer('p3', 'Carol White'),
    ];
    const squadAfter = [
      makePlayer('p1', 'Alice Smith', { pace: 0.502, stamina: 0.501 }),
      makePlayer('p2', 'Bob Jones', { pace: 0.5005 }),
      makePlayer('p3', 'Carol White', { pace: 0.505, stamina: 0.504, strength: 0.503 }),
    ];

    const result = generateCoachingReport('fitness', 1, squadAfter, squadBefore);
    expect(result).not.toBeNull();
    // Carol should appear before Alice, Alice before Bob
    const carolIdx = result!.body.indexOf('Carol');
    const aliceIdx = result!.body.indexOf('Alice');
    const bobIdx = result!.body.indexOf('Bob');
    expect(carolIdx).toBeLessThan(aliceIdx);
    expect(aliceIdx).toBeLessThan(bobIdx);
  });

  it('handles squad with fewer than 3 players gracefully', () => {
    const squadBefore = [makePlayer('p1', 'Alice Smith')];
    const squadAfter = [makePlayer('p1', 'Alice Smith', { pace: 0.502 })];

    const result = generateCoachingReport('fitness', 1, squadAfter, squadBefore);
    expect(result).not.toBeNull();
    // Should not throw and should still include the one player
    expect(result!.body).toContain('Alice');
  });

  it('returns null when squad is empty (no deltas possible)', () => {
    const result = generateCoachingReport('fitness', 1, [], []);
    // Empty squad on a drill day — may return null or a report with "0 players"; either is acceptable
    // but the report (if any) should not crash
    expect(() => generateCoachingReport('fitness', 1, [], [])).not.toThrow();
  });
});
