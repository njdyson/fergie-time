import { describe, it, expect } from 'vitest';
import { generateFixtures } from './fixtures.ts';
import type { Fixture as _Fixture } from './fixtures.ts';

function makeTeamIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `team-${i}`);
}

describe('generateFixtures', () => {
  it('returns exactly 380 fixtures for 20 teams', () => {
    const fixtures = generateFixtures(makeTeamIds(20));
    expect(fixtures).toHaveLength(380);
  });

  it('matchday values are 1..38', () => {
    const fixtures = generateFixtures(makeTeamIds(20));
    const matchdays = new Set(fixtures.map(f => f.matchday));
    expect(matchdays.size).toBe(38);
    for (const md of matchdays) {
      expect(md).toBeGreaterThanOrEqual(1);
      expect(md).toBeLessThanOrEqual(38);
    }
  });

  it('each team appears in exactly 38 fixtures (19 home + 19 away)', () => {
    const teamIds = makeTeamIds(20);
    const fixtures = generateFixtures(teamIds);

    for (const id of teamIds) {
      const homeCount = fixtures.filter(f => f.homeTeamId === id).length;
      const awayCount = fixtures.filter(f => f.awayTeamId === id).length;
      expect(homeCount).toBe(19);
      expect(awayCount).toBe(19);
    }
  });

  it('no team plays itself', () => {
    const fixtures = generateFixtures(makeTeamIds(20));
    for (const f of fixtures) {
      expect(f.homeTeamId).not.toBe(f.awayTeamId);
    }
  });

  it('throws if odd number of teams', () => {
    expect(() => generateFixtures(makeTeamIds(5))).toThrow('even');
  });

  it('result field is undefined on all generated fixtures', () => {
    const fixtures = generateFixtures(makeTeamIds(20));
    for (const f of fixtures) {
      expect(f.result).toBeUndefined();
    }
  });

  it('works with small even counts (4 teams = 12 fixtures)', () => {
    const fixtures = generateFixtures(makeTeamIds(4));
    expect(fixtures).toHaveLength(12);
  });
});
