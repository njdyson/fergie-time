/**
 * League table creation, update, and sorting logic.
 */

export interface TeamRecord {
  readonly teamId: string;
  readonly teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/**
 * Create a fresh league table with all stats at zero.
 */
export function createInitialTable(teams: Array<{ id: string; name: string }>): TeamRecord[] {
  return teams.map(t => ({
    teamId: t.id,
    teamName: t.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));
}

/**
 * Apply a match result to the league table. Returns a new table (immutable update).
 * Awards 3 points for a win, 1 for a draw, 0 for a loss.
 */
export function updateTable(
  table: TeamRecord[],
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
): TeamRecord[] {
  return table.map(row => {
    if (row.teamId !== homeId && row.teamId !== awayId) return row;

    const isHome = row.teamId === homeId;
    const scored = isHome ? homeGoals : awayGoals;
    const conceded = isHome ? awayGoals : homeGoals;
    const won = scored > conceded ? 1 : 0;
    const drawn = scored === conceded ? 1 : 0;
    const lost = scored < conceded ? 1 : 0;

    return {
      ...row,
      played: row.played + 1,
      won: row.won + won,
      drawn: row.drawn + drawn,
      lost: row.lost + lost,
      goalsFor: row.goalsFor + scored,
      goalsAgainst: row.goalsAgainst + conceded,
      points: row.points + (won ? 3 : drawn ? 1 : 0),
    };
  });
}

/**
 * Sort the league table by: points desc, goal difference desc, goals for desc.
 * Returns a new sorted array (does not mutate input).
 */
export function sortTable(table: TeamRecord[]): TeamRecord[] {
  return [...table].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return b.goalsFor - a.goalsFor;
  });
}
