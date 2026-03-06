/**
 * Hub Screen — the season management home screen.
 * Shows team name, season number, league position, next fixture, and last result.
 */

import type { SeasonState } from '../../season/season.ts';
import { sortTable } from '../../season/leagueTable.ts';

// Color palette (dark theme)
const BG = '#111111';
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const ACCENT_ORANGE = '#fb923c';

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0])!;
}

export class HubScreen {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.backgroundColor = BG;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.padding = '24px';
    this.container.style.boxSizing = 'border-box';
  }

  update(state: SeasonState, playerTeamName: string): void {
    const sorted = sortTable(state.table);
    const positionIndex = sorted.findIndex(r => r.teamId === state.playerTeamId);
    const position = positionIndex + 1;

    // Find next fixture (first without result for player team)
    const nextFixture = state.fixtures.find(
      f => !f.result && (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId)
    );

    // Find last result (most recent fixture with result for player team)
    const playedFixtures = state.fixtures
      .filter(f => f.result && (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId))
      .sort((a, b) => b.matchday - a.matchday);
    const lastResult = playedFixtures[0];

    // Resolve team names
    const getTeamName = (id: string) => state.teams.find(t => t.id === id)?.name ?? id;

    // Build next fixture text
    let nextText = 'Season complete';
    if (nextFixture) {
      const isHome = nextFixture.homeTeamId === state.playerTeamId;
      const opponentId = isHome ? nextFixture.awayTeamId : nextFixture.homeTeamId;
      const ha = isHome ? 'H' : 'A';
      nextText = `${getTeamName(opponentId)} (${ha})`;
    }

    // Build last result text
    let lastText = 'No matches played';
    if (lastResult && lastResult.result) {
      const isHome = lastResult.homeTeamId === state.playerTeamId;
      const opponentId = isHome ? lastResult.awayTeamId : lastResult.homeTeamId;
      const playerGoals = isHome ? lastResult.result.homeGoals : lastResult.result.awayGoals;
      const opponentGoals = isHome ? lastResult.result.awayGoals : lastResult.result.homeGoals;
      lastText = `${getTeamName(opponentId)} ${playerGoals}-${opponentGoals}`;
    }

    this.container.innerHTML = `
      <div style="max-width: 600px; margin: 0 auto;">
        <h1 style="color: ${TEXT_BRIGHT}; font-size: 28px; margin: 0 0 4px 0;">${playerTeamName}</h1>
        <div style="color: ${ACCENT_BLUE}; font-size: 16px; margin-bottom: 32px;">Season ${state.seasonNumber}</div>

        <div style="display: grid; gap: 16px;">
          <div style="background: ${PANEL_BG}; border-radius: 8px; padding: 20px;">
            <div style="color: ${TEXT}; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">League Position</div>
            <div style="color: ${ACCENT_ORANGE}; font-size: 36px; font-weight: bold;">${ordinalSuffix(position)}</div>
          </div>

          <div style="background: ${PANEL_BG}; border-radius: 8px; padding: 20px;">
            <div style="color: ${TEXT}; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Next Fixture</div>
            <div style="color: ${TEXT_BRIGHT}; font-size: 20px;">${nextText}</div>
          </div>

          <div style="background: ${PANEL_BG}; border-radius: 8px; padding: 20px;">
            <div style="color: ${TEXT}; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Last Result</div>
            <div style="color: ${TEXT_BRIGHT}; font-size: 20px;">${lastText}</div>
          </div>
        </div>
      </div>
    `;
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
