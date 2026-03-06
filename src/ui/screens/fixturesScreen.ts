/**
 * Fixtures Screen — shows all 38 matchdays with fixture results.
 * Player team fixtures are highlighted. Current matchday is marked.
 */

import type { SeasonState } from '../../season/season.ts';

// Color palette (dark theme)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const HIGHLIGHT_BG = '#1e3a5f';

export class FixturesScreen {
  private container: HTMLElement;

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

        html += `<div style="background: ${rowBg}; border-radius: 4px; padding: 8px 12px; margin-bottom: 2px; display: flex; align-items: center; font-size: 14px;">`;
        html += `<span style="color: ${TEXT_BRIGHT}; flex: 1; text-align: right;">${homeName}</span>`;
        html += `<span style="width: 80px; text-align: center;">${scoreText}</span>`;
        html += `<span style="color: ${TEXT_BRIGHT}; flex: 1; text-align: left;">${awayName}</span>`;
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
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
