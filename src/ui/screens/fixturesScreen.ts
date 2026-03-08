/**
 * Fixtures Screen — shows all 38 matchdays with fixture results.
 * Player team fixtures are highlighted. Current matchday is marked.
 */

import type { SeasonState } from '../../season/season.ts';
import type { Fixture } from '../../season/fixtures.ts';

// Color palette (dark theme)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const HIGHLIGHT_BG = '#1e3a5f';

export class FixturesScreen {
  private container: HTMLElement;
  private teamClickCallbacks: Array<(teamId: string) => void> = [];
  private statsClickCallbacks: Array<(fixture: Fixture) => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.padding = '16px';
    this.container.style.boxSizing = 'border-box';
    this.container.style.overflowY = 'auto';
    this.container.style.height = '100%';
  }

  update(state: SeasonState, playerTeamId: string): void {
    const getTeamName = (id: string) => state.teams.find(t => t.id === id)?.name ?? id;

    // Group fixtures by matchday
    const byMatchday = new Map<number, typeof state.fixtures>();
    for (const f of state.fixtures) {
      const group = byMatchday.get(f.matchday) ?? [];
      group.push(f);
      byMatchday.set(f.matchday, group);
    }

    const matchdays = Array.from(byMatchday.keys()).sort((a, b) => a - b);
    let currentMdElementId = '';
    const fixtureLookup = new Map<string, Fixture>();
    let fixtureRowIndex = 0;

    let html = '<div style="max-width: 700px; margin: 0 auto;">';
    html += `<h2 style="color: ${TEXT_BRIGHT}; font-size: 22px; margin: 0 0 16px 0;">Fixtures</h2>`;

    for (const md of matchdays) {
      const fixtures = byMatchday.get(md)!;
      const isCurrent = md === state.currentMatchday;
      const elementId = `matchday-${md}`;

      if (isCurrent) currentMdElementId = elementId;

      html += `<div id="${elementId}" style="margin-bottom: 16px;">`;
      html += `<div style="color: ${isCurrent ? ACCENT_BLUE : TEXT}; font-size: 14px; font-weight: bold; margin-bottom: 6px;">`;
      html += `Matchday ${md}`;
      if (isCurrent) html += ` <span style="color: ${ACCENT_BLUE}; font-size: 12px; margin-left: 8px;">NEXT</span>`;
      html += `</div>`;

      for (const f of fixtures) {
        const isPlayerMatch = f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId;
        const rowBg = isPlayerMatch ? HIGHLIGHT_BG : PANEL_BG;
        const homeName = getTeamName(f.homeTeamId);
        const awayName = getTeamName(f.awayTeamId);

        let scoreText: string;
        if (f.result) {
          scoreText = `<span style="color: ${TEXT_BRIGHT}; font-weight: bold;">${f.result.homeGoals} - ${f.result.awayGoals}</span>`;
        } else {
          scoreText = `<span style="color: ${TEXT};">vs</span>`;
        }
        const fixtureKey = `${f.matchday}-${fixtureRowIndex++}`;
        fixtureLookup.set(fixtureKey, f);
        const statsBtn = f.result
          ? (f.matchStats
              ? `<button data-fixture-stats="${fixtureKey}" style="margin-left: 10px; background: #334155; color: ${TEXT_BRIGHT}; border: 1px solid #475569; border-radius: 4px; font: 600 11px/1 'Segoe UI', system-ui, sans-serif; padding: 4px 8px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.04em;">Stats</button>`
              : `<button disabled title="Detailed stats not available for this fixture save state" style="margin-left: 10px; background: #1f2937; color: #64748b; border: 1px solid #334155; border-radius: 4px; font: 600 11px/1 'Segoe UI', system-ui, sans-serif; padding: 4px 8px; cursor: not-allowed; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8;">Stats</button>`)
          : `<span style="width: 56px; margin-left: 10px;"></span>`;

        html += `<div style="background: ${rowBg}; border-radius: 4px; padding: 8px 12px; margin-bottom: 2px; display: flex; align-items: center; font-size: 14px;">`;
        html += `<span data-fixture-team="${f.homeTeamId}" style="color: ${ACCENT_BLUE}; flex: 1; text-align: right; cursor: pointer;" title="View squad">${homeName}</span>`;
        html += `<span style="width: 80px; text-align: center;">${scoreText}</span>`;
        html += `<span data-fixture-team="${f.awayTeamId}" style="color: ${ACCENT_BLUE}; flex: 1; text-align: left; cursor: pointer;" title="View squad">${awayName}</span>`;
        html += statsBtn;
        html += `</div>`;
      }

      html += `</div>`;
    }

    html += '</div>';
    this.container.innerHTML = html;

    // Scroll current matchday into view
    if (currentMdElementId) {
      const el = this.container.querySelector(`#${currentMdElementId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const teamLinks = this.container.querySelectorAll('[data-fixture-team]');
    for (const link of teamLinks) {
      const teamId = (link as HTMLElement).dataset.fixtureTeam!;
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        if (teamId === playerTeamId) return;
        for (const cb of this.teamClickCallbacks) cb(teamId);
      });
    }

    const statsButtons = this.container.querySelectorAll('[data-fixture-stats]');
    for (const btn of statsButtons) {
      const key = (btn as HTMLElement).dataset.fixtureStats!;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fixture = fixtureLookup.get(key);
        if (!fixture || !fixture.result || !fixture.matchStats) return;
        for (const cb of this.statsClickCallbacks) cb(fixture);
      });
    }
  }

  onTeamClick(cb: (teamId: string) => void): void {
    this.teamClickCallbacks.push(cb);
  }

  onStatsClick(cb: (fixture: Fixture) => void): void {
    this.statsClickCallbacks.push(cb);
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
