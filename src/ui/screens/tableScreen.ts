/**
 * Table Screen — shows the full league table sorted by points, GD, GF.
 * Player team row is highlighted.
 */

import type { SeasonState } from '../../season/season.ts';
import { sortTable } from '../../season/leagueTable.ts';

// Color palette (dark theme)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const HIGHLIGHT_BG = '#1e3a5f';
const HEADER_TEXT = '#64748b';

export class TableScreen {
  private container: HTMLElement;
  private teamClickCallbacks: Array<(teamId: string) => void> = [];

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
    const sorted = sortTable(state.table);

    let html = '<div style="max-width: 700px; margin: 0 auto;">';
    html += `<h2 style="color: ${TEXT_BRIGHT}; font-size: 22px; margin: 0 0 16px 0; font-family: 'Segoe UI', system-ui, sans-serif;">League Table</h2>`;

    // Table header
    html += `<div class="table-grid" style="display: grid; grid-template-columns: 32px 1fr repeat(9, 40px); padding: 8px 12px; font-size: 12px; color: ${HEADER_TEXT}; border-bottom: 1px solid #334155;">`;
    html += '<span>Pos</span><span>Team</span>';
    html += '<span style="text-align: center;">P</span>';
    html += '<span style="text-align: center;">W</span>';
    html += '<span style="text-align: center;">D</span>';
    html += '<span style="text-align: center;">L</span>';
    html += '<span class="table-col-gf" style="text-align: center;">GF</span>';
    html += '<span class="table-col-ga" style="text-align: center;">GA</span>';
    html += '<span class="table-col-gd" style="text-align: center;">GD</span>';
    html += '<span style="text-align: center;">Pts</span>';
    html += '</div>';

    // Table rows
    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i]!;
      const isPlayer = row.teamId === playerTeamId;
      const bg = isPlayer ? HIGHLIGHT_BG : (i % 2 === 0 ? PANEL_BG : '#151f2e');
      const textColor = isPlayer ? TEXT_BRIGHT : TEXT;
      const gd = row.goalsFor - row.goalsAgainst;
      const gdStr = gd > 0 ? `+${gd}` : `${gd}`;

      html += `<div class="table-grid" style="display: grid; grid-template-columns: 32px 1fr repeat(9, 40px); padding: 8px 12px; font-size: 13px; color: ${textColor}; background: ${bg}; border-radius: 2px;">`;
      html += `<span>${i + 1}</span>`;
      html += `<span data-table-team="${row.teamId}" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${ACCENT_BLUE}; cursor: pointer;" title="View squad">${row.teamName}</span>`;
      html += `<span style="text-align: center;">${row.played}</span>`;
      html += `<span style="text-align: center;">${row.won}</span>`;
      html += `<span style="text-align: center;">${row.drawn}</span>`;
      html += `<span style="text-align: center;">${row.lost}</span>`;
      html += `<span class="table-col-gf" style="text-align: center;">${row.goalsFor}</span>`;
      html += `<span class="table-col-ga" style="text-align: center;">${row.goalsAgainst}</span>`;
      html += `<span class="table-col-gd" style="text-align: center;">${gdStr}</span>`;
      html += `<span style="text-align: center; font-weight: bold;">${row.points}</span>`;
      html += '</div>';
    }

    html += '</div>';
    this.container.innerHTML = html;

    const teamLinks = this.container.querySelectorAll('[data-table-team]');
    for (const link of teamLinks) {
      const teamId = (link as HTMLElement).dataset.tableTeam!;
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        if (teamId === playerTeamId) return;
        for (const cb of this.teamClickCallbacks) cb(teamId);
      });
    }
  }

  onTeamClick(cb: (teamId: string) => void): void {
    this.teamClickCallbacks.push(cb);
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
