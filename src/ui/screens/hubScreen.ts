/**
 * Hub Screen — the season management home screen.
 * Shows team name, season number, league position, next fixture, and last result.
 */

import type { SeasonState } from '../../season/season.ts';
import { isSeasonComplete } from '../../season/season.ts';
import { sortTable } from '../../season/leagueTable.ts';

// Color palette (dark theme)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const ACCENT_ORANGE = '#fb923c';
const GREEN = '#4ade80';

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0])!;
}

export class HubScreen {
  private container: HTMLElement;
  private kickoffCallbacks: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.padding = '24px';
    this.container.style.boxSizing = 'border-box';
    this.container.style.background = `
      radial-gradient(ellipse at 20% 0%, rgba(22,101,52,0.15) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 100%, rgba(30,64,175,0.10) 0%, transparent 60%),
      repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.015) 39px, rgba(255,255,255,0.015) 40px),
      repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.015) 39px, rgba(255,255,255,0.015) 40px),
      #0a0f1a`;
  }

  onKickoff(cb: () => void): void {
    this.kickoffCallbacks.push(cb);
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

    // Stats for the record bar
    const record = sorted.find(r => r.teamId === state.playerTeamId);
    const wins = record?.won ?? 0;
    const draws = record?.drawn ?? 0;
    const losses = record?.lost ?? 0;
    const gf = record?.goalsFor ?? 0;
    const ga = record?.goalsAgainst ?? 0;
    const pts = record?.points ?? 0;
    const played = record?.played ?? 0;

    // Result badge for last match
    let resultBadge = '';
    if (lastResult?.result) {
      const isHome = lastResult.homeTeamId === state.playerTeamId;
      const pg = isHome ? lastResult.result.homeGoals : lastResult.result.awayGoals;
      const og = isHome ? lastResult.result.awayGoals : lastResult.result.homeGoals;
      if (pg > og) resultBadge = `<span style="background:#166534; color:${GREEN}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; margin-left:8px;">W</span>`;
      else if (pg < og) resultBadge = `<span style="background:#7f1d1d; color:#f87171; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; margin-left:8px;">L</span>`;
      else resultBadge = `<span style="background:#1e3a5f; color:${ACCENT_BLUE}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; margin-left:8px;">D</span>`;
    }

    const cardStyle = `background: linear-gradient(135deg, ${PANEL_BG} 0%, #151d2e 100%); border-radius: 12px; padding: 20px 24px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 16px rgba(0,0,0,0.3);`;
    const labelStyle = `color: ${TEXT}; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; font-weight: 600;`;

    this.container.innerHTML = `
      <div style="max-width: 640px; margin: 0 auto;">
        <!-- Team header -->
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: ${TEXT_BRIGHT}; font-size: 32px; margin: 0 0 6px 0; font-weight: 800; letter-spacing: -0.5px;">${playerTeamName}</h1>
          <div style="color: ${ACCENT_BLUE}; font-size: 14px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;">Season ${state.seasonNumber} &bull; Matchday ${state.currentMatchday}</div>
        </div>

        <div style="display: grid; gap: 14px;">
          <!-- Position card (prominent) -->
          <div style="${cardStyle} display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="${labelStyle}">League Position</div>
              <div style="color: ${ACCENT_ORANGE}; font-size: 42px; font-weight: 900; line-height: 1;">${ordinalSuffix(position)}</div>
            </div>
            <div style="text-align: right;">
              <div style="color: ${TEXT_BRIGHT}; font-size: 28px; font-weight: 800;">${pts} <span style="color: ${TEXT}; font-size: 13px; font-weight: 600;">PTS</span></div>
              <div style="color: ${TEXT}; font-size: 12px; margin-top: 4px;">P${played} &middot; W${wins} D${draws} L${losses} &middot; ${gf}:${ga}</div>
            </div>
          </div>

          <!-- Two-column row -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div style="${cardStyle}">
              <div style="${labelStyle}">Next Fixture</div>
              <div style="color: ${TEXT_BRIGHT}; font-size: 17px; font-weight: 600;">${nextText}</div>
              ${nextFixture ? `<div style="color: ${TEXT}; font-size: 11px; margin-top: 6px;">Matchday ${nextFixture.matchday}</div>` : ''}
            </div>

            <div style="${cardStyle}">
              <div style="${labelStyle}">Last Result</div>
              <div style="color: ${TEXT_BRIGHT}; font-size: 17px; font-weight: 600;">${lastText}${resultBadge}</div>
              ${lastResult ? `<div style="color: ${TEXT}; font-size: 11px; margin-top: 6px;">Matchday ${lastResult.matchday}</div>` : ''}
            </div>
          </div>

          <!-- Kick Off button -->
          ${!isSeasonComplete(state) ? `<button id="hub-kickoff-btn" style="display:block; width:100%; margin-top:4px; padding:16px 32px; background: linear-gradient(135deg, #166534 0%, #14532d 100%); color:#bbf7d0; border:2px solid #22c55e; border-radius:12px; font:bold 18px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; text-transform:uppercase; letter-spacing:0.1em; box-shadow: 0 4px 20px rgba(34,197,94,0.2); transition: transform 0.1s, box-shadow 0.1s;" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 24px rgba(34,197,94,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 20px rgba(34,197,94,0.2)'">Kick Off</button>` : `<div style="${cardStyle} text-align: center;"><div style="color: ${ACCENT_ORANGE}; font-size: 20px; font-weight: bold;">Season Complete</div></div>`}
        </div>
      </div>
    `;

    this.container.querySelector('#hub-kickoff-btn')?.addEventListener('click', () => {
      for (const cb of this.kickoffCallbacks) cb();
    });
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
