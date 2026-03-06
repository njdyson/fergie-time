import { describe, it, expect } from 'vitest';
import { createInitialTable, updateTable, sortTable } from './leagueTable.ts';
import type { TeamRecord } from './leagueTable.ts';

const TEAMS = [
  { id: 'a', name: 'Team A' },
  { id: 'b', name: 'Team B' },
  { id: 'c', name: 'Team C' },
];

describe('createInitialTable', () => {
  it('returns array of TeamRecord with all counts zero', () => {
    const table = createInitialTable(TEAMS);
    expect(table).toHaveLength(3);
    for (const row of table) {
      expect(row.played).toBe(0);
      expect(row.won).toBe(0);
      expect(row.drawn).toBe(0);
      expect(row.lost).toBe(0);
      expect(row.goalsFor).toBe(0);
      expect(row.goalsAgainst).toBe(0);
      expect(row.points).toBe(0);
    }
  });

  it('preserves team id and name', () => {
    const table = createInitialTable(TEAMS);
    expect(table[0]!.teamId).toBe('a');
    expect(table[0]!.teamName).toBe('Team A');
  });
});

describe('updateTable', () => {
  it('home win: home W+1 pts+3, away L+1 pts+0', () => {
    let table = createInitialTable(TEAMS);
    table = updateTable(table, 'a', 'b', 2, 0);

    const a = table.find(r => r.teamId === 'a')!;
    const b = table.find(r => r.teamId === 'b')!;

    expect(a.won).toBe(1);
    expect(a.points).toBe(3);
    expect(a.goalsFor).toBe(2);
    expect(a.goalsAgainst).toBe(0);

    expect(b.lost).toBe(1);
    expect(b.points).toBe(0);
    expect(b.goalsFor).toBe(0);
    expect(b.goalsAgainst).toBe(2);
  });

  it('draw: both D+1 pts+1', () => {
    let table = createInitialTable(TEAMS);
    table = updateTable(table, 'a', 'b', 1, 1);

    const a = table.find(r => r.teamId === 'a')!;
    const b = table.find(r => r.teamId === 'b')!;

    expect(a.drawn).toBe(1);
    expect(a.points).toBe(1);
    expect(b.drawn).toBe(1);
    expect(b.points).toBe(1);
  });

  it('away win: away W+1 pts+3, home L+1 pts+0', () => {
    let table = createInitialTable(TEAMS);
    table = updateTable(table, 'a', 'b', 0, 3);

    const a = table.find(r => r.teamId === 'a')!;
    const b = table.find(r => r.teamId === 'b')!;

    expect(a.lost).toBe(1);
    expect(a.points).toBe(0);
    expect(b.won).toBe(1);
    expect(b.points).toBe(3);
    expect(b.goalsFor).toBe(3);
  });

  it('GF and GA accumulate correctly across multiple results', () => {
    let table = createInitialTable(TEAMS);
    table = updateTable(table, 'a', 'b', 2, 1); // A wins
    table = updateTable(table, 'a', 'c', 0, 0); // draw
    table = updateTable(table, 'b', 'c', 3, 2); // B wins

    const a = table.find(r => r.teamId === 'a')!;
    expect(a.played).toBe(2);
    expect(a.goalsFor).toBe(2);
    expect(a.goalsAgainst).toBe(1);
    expect(a.points).toBe(4); // 3 + 1

    const b = table.find(r => r.teamId === 'b')!;
    expect(b.played).toBe(2);
    expect(b.goalsFor).toBe(4); // 1 + 3
    expect(b.goalsAgainst).toBe(4); // 2 + 2
    expect(b.points).toBe(3); // 0 + 3

    const c = table.find(r => r.teamId === 'c')!;
    expect(c.played).toBe(2);
    expect(c.goalsFor).toBe(2); // 0 + 2
    expect(c.goalsAgainst).toBe(3); // 0 + 3
    expect(c.points).toBe(1); // 1 + 0
  });
});

describe('sortTable', () => {
  it('orders by points desc', () => {
    let table = createInitialTable(TEAMS);
    table = updateTable(table, 'a', 'b', 2, 0); // A: 3pts
    table = updateTable(table, 'b', 'c', 1, 1); // B: 1pt, C: 1pt

    const sorted = sortTable(table);
    expect(sorted[0]!.teamId).toBe('a');
  });

  it('tiebreaker: goal difference desc when points equal', () => {
    let table = createInitialTable(TEAMS);
    // A beats C 3-0 -> A: 3pts, GD +3
    table = updateTable(table, 'a', 'c', 3, 0);
    // B beats C 1-0 -> B: 3pts, GD +1
    table = updateTable(table, 'b', 'c', 1, 0);

    const sorted = sortTable(table);
    expect(sorted[0]!.teamId).toBe('a'); // GD +3 > +1
    expect(sorted[1]!.teamId).toBe('b');
  });

  it('tiebreaker: goals for desc when points and GD equal', () => {
    let table = createInitialTable([
      { id: 'x', name: 'X' },
      { id: 'y', name: 'Y' },
      { id: 'z', name: 'Z' },
      { id: 'w', name: 'W' },
    ]);
    // X beats Z 4-2 -> X: 3pts, GF=4, GA=2, GD=+2
    table = updateTable(table, 'x', 'z', 4, 2);
    // Y beats W 3-1 -> Y: 3pts, GF=3, GA=1, GD=+2
    table = updateTable(table, 'y', 'w', 3, 1);

    const sorted = sortTable(table);
    // Same pts (3), same GD (+2), but X has GF=4 > Y GF=3
    expect(sorted[0]!.teamId).toBe('x');
    expect(sorted[1]!.teamId).toBe('y');
  });

  it('does not mutate the original table', () => {
    let table = createInitialTable(TEAMS);
    table = updateTable(table, 'b', 'a', 2, 0);
    const original = [...table];
    const sorted = sortTable(table);
    expect(table).toEqual(original);
    expect(sorted).not.toBe(table);
  });
});
