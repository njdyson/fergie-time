/**
 * Stats Screen — per-player season statistics view.
 * Two views: My Squad (sortable per-player table) and Top Scorers (league-wide golden boot).
 */

import type { SeasonState } from '../../season/season.ts';
import type { PlayerSeasonStats } from '../../season/playerStats.ts';
import { createEmptySeasonStats } from '../../season/playerStats.ts';

// Color palette (dark theme — matches squad screen)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const GREEN = '#4ade80';
const ACCENT_ORANGE = '#fb923c';

type ViewMode = 'squad' | 'topscorers';

type SortColumn =
  | 'name' | 'pos' | 'apps' | 'goals' | 'assists'
  | 'shots' | 'shotsOnTarget' | 'passPercent' | 'tacklesWon'
  | 'yellowCards' | 'redCards' | 'cleanSheets' | 'minsPlayed' | 'goalsPerGame';

function passPercent(s: PlayerSeasonStats): number {
  if (s.passes === 0) return 0;
  return (s.passesCompleted / s.passes) * 100;
}

function goalsPerGame(s: PlayerSeasonStats): number {
  if (s.appearances === 0) return 0;
  return s.goals / s.appearances;
}

export class StatsScreen {
  private container: HTMLElement;
  private viewMode: ViewMode = 'squad';
  private sortCol: SortColumn = 'goals';
  private sortAsc: boolean = false;

  // Callback for player name click (for Plan 03 player profile)
  private playerClickCallbacks: Array<(playerId: string) => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.padding = '16px';
    this.container.style.boxSizing = 'border-box';
    this.container.style.overflowY = 'auto';
    this.container.style.height = '100%';
  }

  /** Register a callback fired when a player name is clicked. */
  onPlayerClick(cb: (playerId: string) => void): void {
    this.playerClickCallbacks.push(cb);
  }

  /** Update display with current season state. */
  update(seasonState: SeasonState): void {
    this.render(seasonState);
  }

  private render(seasonState: SeasonState): void {
    let html = '<div style="max-width: 1100px; margin: 0 auto;">';
    html += `<h2 style="color: ${TEXT_BRIGHT}; font-size: 22px; margin: 0 0 16px 0;">Stats</h2>`;

    // Toggle bar: My Squad | Top Scorers
    const squadActive = this.viewMode === 'squad';
    const topActive = this.viewMode === 'topscorers';
    html += `<div style="display: flex; gap: 8px; margin-bottom: 16px;">`;
    html += `<button data-view="squad" style="padding: 8px 20px; border-radius: 6px; border: 2px solid ${squadActive ? ACCENT_BLUE : '#334155'}; background: ${squadActive ? ACCENT_BLUE : '#0f172a'}; color: ${squadActive ? '#000' : TEXT_BRIGHT}; font: bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">My Squad</button>`;
    html += `<button data-view="topscorers" style="padding: 8px 20px; border-radius: 6px; border: 2px solid ${topActive ? ACCENT_BLUE : '#334155'}; background: ${topActive ? ACCENT_BLUE : '#0f172a'}; color: ${topActive ? '#000' : TEXT_BRIGHT}; font: bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Top Scorers</button>`;
    html += `</div>`;

    if (this.viewMode === 'squad') {
      html += this.renderSquadView(seasonState);
    } else {
      html += this.renderTopScorers(seasonState);
    }

    html += '</div>';
    this.container.innerHTML = html;

    // Attach toggle handlers
    const viewBtns = this.container.querySelectorAll('[data-view]');
    for (const btn of viewBtns) {
      const view = (btn as HTMLElement).dataset.view as ViewMode;
      btn.addEventListener('click', () => {
        this.viewMode = view;
        this.render(seasonState);
      });
    }

    // Attach sort header handlers
    const sortHdrs = this.container.querySelectorAll('[data-sort-col]');
    for (const hdr of sortHdrs) {
      const col = (hdr as HTMLElement).dataset.sortCol as SortColumn;
      hdr.addEventListener('click', () => {
        if (this.sortCol === col) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortCol = col;
          this.sortAsc = col === 'name' || col === 'pos'; // text cols default asc
        }
        this.render(seasonState);
      });
    }

    // Attach player click handlers
    const playerLinks = this.container.querySelectorAll('[data-player-click]');
    for (const link of playerLinks) {
      const playerId = (link as HTMLElement).dataset.playerClick!;
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const cb of this.playerClickCallbacks) cb(playerId);
      });
    }
  }

  private sortArrow(col: SortColumn): string {
    if (this.sortCol !== col) return '';
    return this.sortAsc ? ' ▲' : ' ▼';
  }

  private hdrStyle(col: SortColumn): string {
    const active = this.sortCol === col;
    return `cursor: pointer; user-select: none; color: ${active ? ACCENT_BLUE : TEXT}; white-space: nowrap;`;
  }

  private renderSquadView(seasonState: SeasonState): string {
    const playerTeam = seasonState.teams.find(t => t.isPlayerTeam);
    if (!playerTeam) return '<p style="color: #f87171;">No player team found.</p>';

    const players = playerTeam.squad;
    const stats = seasonState.playerSeasonStats;

    // Sort players
    type SortKey = SortColumn;
    const sorted = [...players].sort((a, b) => {
      const sa = stats.get(a.id) ?? createEmptySeasonStats();
      const sb = stats.get(b.id) ?? createEmptySeasonStats();
      const dir = this.sortAsc ? 1 : -1;

      switch (this.sortCol as SortKey) {
        case 'name': return dir * (a.name ?? '').localeCompare(b.name ?? '');
        case 'pos': return dir * (a.role ?? '').localeCompare(b.role ?? '');
        case 'apps': return dir * (sa.appearances - sb.appearances);
        case 'goals': return dir * (sa.goals - sb.goals);
        case 'assists': return dir * (sa.assists - sb.assists);
        case 'shots': return dir * (sa.shots - sb.shots);
        case 'shotsOnTarget': return dir * (sa.shotsOnTarget - sb.shotsOnTarget);
        case 'passPercent': return dir * (passPercent(sa) - passPercent(sb));
        case 'tacklesWon': return dir * (sa.tacklesWon - sb.tacklesWon);
        case 'yellowCards': return dir * (sa.yellowCards - sb.yellowCards);
        case 'redCards': return dir * (sa.redCards - sb.redCards);
        case 'cleanSheets': return dir * (sa.cleanSheets - sb.cleanSheets);
        case 'minsPlayed': return dir * (sa.minutesPlayed - sb.minutesPlayed);
        case 'goalsPerGame': return dir * (goalsPerGame(sa) - goalsPerGame(sb));
        default: return 0;
      }
    });

    const cols = `minmax(120px,2fr) 48px 36px 36px 36px 44px 44px 52px 52px 36px 36px 52px 52px 60px`;

    let html = '';
    html += `<div style="overflow-x: auto;">`;
    html += `<div style="min-width: 700px;">`;

    // Header row
    html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #334155; align-items: center;">`;
    html += `<span data-sort-col="name" style="${this.hdrStyle('name')}">Name${this.sortArrow('name')}</span>`;
    html += `<span data-sort-col="pos" style="${this.hdrStyle('pos')}">Pos${this.sortArrow('pos')}</span>`;
    html += `<span data-sort-col="apps" style="text-align:center; ${this.hdrStyle('apps')}">App${this.sortArrow('apps')}</span>`;
    html += `<span data-sort-col="goals" style="text-align:center; ${this.hdrStyle('goals')}">G${this.sortArrow('goals')}</span>`;
    html += `<span data-sort-col="assists" style="text-align:center; ${this.hdrStyle('assists')}">A${this.sortArrow('assists')}</span>`;
    html += `<span data-sort-col="shots" style="text-align:center; ${this.hdrStyle('shots')}">Shots${this.sortArrow('shots')}</span>`;
    html += `<span data-sort-col="shotsOnTarget" style="text-align:center; ${this.hdrStyle('shotsOnTarget')}">SoT${this.sortArrow('shotsOnTarget')}</span>`;
    html += `<span data-sort-col="passPercent" style="text-align:center; ${this.hdrStyle('passPercent')}">Pass%${this.sortArrow('passPercent')}</span>`;
    html += `<span data-sort-col="tacklesWon" style="text-align:center; ${this.hdrStyle('tacklesWon')}">Tkl${this.sortArrow('tacklesWon')}</span>`;
    html += `<span data-sort-col="yellowCards" style="text-align:center; ${this.hdrStyle('yellowCards')}">YC${this.sortArrow('yellowCards')}</span>`;
    html += `<span data-sort-col="redCards" style="text-align:center; ${this.hdrStyle('redCards')}">RC${this.sortArrow('redCards')}</span>`;
    html += `<span data-sort-col="cleanSheets" style="text-align:center; ${this.hdrStyle('cleanSheets')}">CS${this.sortArrow('cleanSheets')}</span>`;
    html += `<span data-sort-col="minsPlayed" style="text-align:center; ${this.hdrStyle('minsPlayed')}">Mins${this.sortArrow('minsPlayed')}</span>`;
    html += `<span data-sort-col="goalsPerGame" style="text-align:center; ${this.hdrStyle('goalsPerGame')}">G/G${this.sortArrow('goalsPerGame')}</span>`;
    html += `</div>`;

    // Player rows
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]!;
      const s = stats.get(p.id) ?? createEmptySeasonStats();
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const ppct = s.passes > 0 ? `${(passPercent(s)).toFixed(0)}%` : '-';
      const gpg = s.appearances > 0 ? goalsPerGame(s).toFixed(2) : '-';
      const isGK = p.role === 'GK';

      html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;

      // Name (clickable for player profile)
      html += `<span data-player-click="${p.id}" style="color: ${ACCENT_BLUE}; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Click for player profile">${p.name ?? 'Unknown'}</span>`;
      html += `<span style="color: ${ACCENT_ORANGE}; font-weight: bold; font-size: 11px;">${p.role}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">${s.appearances}</span>`;
      html += `<span style="text-align:center; color: ${s.goals > 0 ? GREEN : TEXT_BRIGHT}; font-weight: ${s.goals > 0 ? 'bold' : 'normal'};">${s.goals}</span>`;
      html += `<span style="text-align:center; color: ${s.assists > 0 ? ACCENT_BLUE : TEXT_BRIGHT};">${s.assists}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">${s.shots}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">${s.shotsOnTarget}</span>`;
      html += `<span style="text-align:center; color: ${TEXT};">${ppct}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">${s.tacklesWon}</span>`;
      html += `<span style="text-align:center; color: ${s.yellowCards > 0 ? '#fbbf24' : TEXT};">${s.yellowCards || '-'}</span>`;
      html += `<span style="text-align:center; color: ${s.redCards > 0 ? '#f87171' : TEXT};">${s.redCards || '-'}</span>`;
      html += `<span style="text-align:center; color: ${isGK ? TEXT_BRIGHT : TEXT};">${isGK ? s.cleanSheets : '-'}</span>`;
      html += `<span style="text-align:center; color: ${TEXT};">${s.minutesPlayed}</span>`;
      html += `<span style="text-align:center; color: ${TEXT};">${gpg}</span>`;
      html += `</div>`;
    }

    html += `</div></div>`;
    return html;
  }

  private renderTopScorers(seasonState: SeasonState): string {
    const stats = seasonState.playerSeasonStats;

    // Build entries: all players from all teams with at least 1 goal OR some appearances
    interface ScoreEntry {
      playerId: string;
      name: string;
      teamName: string;
      goals: number;
      assists: number;
      appearances: number;
      goalsPerGame: number;
    }

    const entries: ScoreEntry[] = [];

    for (const team of seasonState.teams) {
      for (const player of team.squad) {
        const s = stats.get(player.id) ?? createEmptySeasonStats();
        if (s.goals === 0 && s.appearances === 0) continue; // skip players with no activity
        entries.push({
          playerId: player.id,
          name: player.name ?? 'Unknown',
          teamName: team.name,
          goals: s.goals,
          assists: s.assists,
          appearances: s.appearances,
          goalsPerGame: s.appearances > 0 ? s.goals / s.appearances : 0,
        });
      }
    }

    // Sort: goals desc, then assists desc, then appearances asc (fewer apps = more efficient)
    entries.sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      return a.appearances - b.appearances;
    });

    // Top 20
    const top20 = entries.slice(0, 20);

    if (top20.length === 0) {
      return `<p style="color: ${TEXT}; margin-top: 24px; text-align: center;">No stats yet — play some matches to see the golden boot table.</p>`;
    }

    const cols = `32px minmax(120px,2fr) minmax(100px,1.5fr) 48px 48px 48px 64px`;

    let html = '';
    html += `<div style="overflow-x: auto;">`;
    html += `<div style="min-width: 500px;">`;

    // Header
    html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 10px; color: ${TEXT}; border-bottom: 1px solid #334155; align-items: center;">`;
    html += `<span style="text-align:center;">#</span>`;
    html += `<span>Name</span>`;
    html += `<span>Team</span>`;
    html += `<span style="text-align:center;">Goals</span>`;
    html += `<span style="text-align:center;">Assists</span>`;
    html += `<span style="text-align:center;">Apps</span>`;
    html += `<span style="text-align:center;">G/Game</span>`;
    html += `</div>`;

    for (let i = 0; i < top20.length; i++) {
      const e = top20[i]!;
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const rank = i + 1;
      const rankColor = rank === 1 ? '#fbbf24' : rank <= 3 ? ACCENT_ORANGE : TEXT_BRIGHT;
      const gpg = e.appearances > 0 ? (e.goals / e.appearances).toFixed(2) : '-';

      html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;
      html += `<span style="text-align:center; color: ${rankColor}; font-weight: bold;">${rank}</span>`;
      html += `<span data-player-click="${e.playerId}" style="color: ${ACCENT_BLUE}; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.name}</span>`;
      html += `<span style="color: ${TEXT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;">${e.teamName}</span>`;
      html += `<span style="text-align:center; color: ${GREEN}; font-weight: bold;">${e.goals}</span>`;
      html += `<span style="text-align:center; color: ${ACCENT_BLUE};">${e.assists}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">${e.appearances}</span>`;
      html += `<span style="text-align:center; color: ${TEXT};">${gpg}</span>`;
      html += `</div>`;
    }

    html += `</div></div>`;
    return html;
  }
}
