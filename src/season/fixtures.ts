/**
 * Berger round-robin fixture generation for a double round-robin season.
 */

export interface Fixture {
  readonly matchday: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  result?: { homeGoals: number; awayGoals: number };
}

/**
 * Generate a full double round-robin fixture list using the Berger algorithm.
 * For n teams: n-1 rounds in first half, mirrored for second half = 2*(n-1) matchdays.
 * Total fixtures = n * (n-1).
 *
 * @param teamIds - Array of team identifiers (must be even length)
 * @returns Array of Fixture objects with matchday 1..2*(n-1)
 */
export function generateFixtures(teamIds: string[]): Fixture[] {
  if (teamIds.length % 2 !== 0) {
    throw new Error('generateFixtures requires even team count');
  }

  const n = teamIds.length;
  const fixed = teamIds[0]!;
  const rotating = [...teamIds.slice(1)];
  const firstHalf: Fixture[] = [];

  for (let round = 0; round < n - 1; round++) {
    const circle = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const home = round % 2 === 0 ? circle[i]! : circle[n - 1 - i]!;
      const away = round % 2 === 0 ? circle[n - 1 - i]! : circle[i]!;
      if (home !== away) {
        firstHalf.push({ matchday: round + 1, homeTeamId: home, awayTeamId: away });
      }
    }
    // Rotate: move last element to front
    rotating.unshift(rotating.pop()!);
  }

  // Second half: mirror home/away, offset matchday
  const secondHalf: Fixture[] = firstHalf.map(f => ({
    matchday: f.matchday + (n - 1),
    homeTeamId: f.awayTeamId,
    awayTeamId: f.homeTeamId,
  }));

  return [...firstHalf, ...secondHalf];
}
