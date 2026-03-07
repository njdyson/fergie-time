/**
 * Transfer Market Screen — browse listings, bid for players, manage squad transfers.
 *
 * Three sub-views:
 *  1. Transfer List — all listed players + free agents
 *  2. My Squad — your players with list/unlist controls
 *  3. Search — browse all league players
 */

import type { SeasonState, SeasonTeam } from '../../season/season.ts';
import type { TransferMarketState } from '../../season/transferMarket.ts';
import { formatMoney } from '../../season/transferMarket.ts';
import { calculatePlayerRating } from '../../season/playerAnalysis.ts';
import type { PlayerState } from '../../simulation/types.ts';

// Color palette (dark theme)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const GREEN = '#4ade80';
const ACCENT_ORANGE = '#fb923c';
const RED = '#f87171';

type ViewMode = 'listings' | 'squad' | 'search';
type SortColumn = 'name' | 'age' | 'pos' | 'rating' | 'team' | 'price' | 'value';

export class TransferScreen {
  private container: HTMLElement;
  private viewMode: ViewMode = 'listings';
  private sortCol: SortColumn = 'rating';
  private sortAsc: boolean = false;
  private positionFilter: string = 'all';
  private searchTeamFilter: string = 'all';

  // Callbacks
  private playerClickCallbacks: Array<(playerId: string) => void> = [];
  private bidCallbacks: Array<(playerId: string, toTeamId: string, amount: number) => void> = [];
  private listCallbacks: Array<(playerId: string) => void> = [];
  private unlistCallbacks: Array<(playerId: string) => void> = [];
  private signFreeAgentCallbacks: Array<(playerId: string) => void> = [];

  // Active bid input (playerId if open)
  private activeBidPlayerId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.padding = '16px';
    this.container.style.boxSizing = 'border-box';
    this.container.style.overflowY = 'auto';
    this.container.style.height = '100%';
  }

  onPlayerClick(cb: (playerId: string) => void): void { this.playerClickCallbacks.push(cb); }
  onBid(cb: (playerId: string, toTeamId: string, amount: number) => void): void { this.bidCallbacks.push(cb); }
  onList(cb: (playerId: string) => void): void { this.listCallbacks.push(cb); }
  onUnlist(cb: (playerId: string) => void): void { this.unlistCallbacks.push(cb); }
  onSignFreeAgent(cb: (playerId: string) => void): void { this.signFreeAgentCallbacks.push(cb); }

  update(seasonState: SeasonState): void {
    this.render(seasonState);
  }

  private render(seasonState: SeasonState): void {
    const market = seasonState.transferMarket;
    const playerTeam = seasonState.teams.find(t => t.isPlayerTeam)!;
    const budget = market.teamBudgets.get(playerTeam.id) ?? 0;

    let html = '<div style="max-width: 1100px; margin: 0 auto;">';
    html += `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">`;
    html += `<h2 style="color: ${TEXT_BRIGHT}; font-size: 22px; margin: 0;">Transfer Market</h2>`;
    html += `<div style="color: ${GREEN}; font-size: 14px; font-weight: bold;">Budget: £${formatMoney(budget)}</div>`;
    html += `</div>`;

    // Tab bar
    const tabs: { id: ViewMode; label: string }[] = [
      { id: 'listings', label: 'Transfer List' },
      { id: 'squad', label: 'My Squad' },
      { id: 'search', label: 'Squad Search' },
    ];
    html += `<div style="display: flex; gap: 8px; margin-bottom: 16px;">`;
    for (const tab of tabs) {
      const active = this.viewMode === tab.id;
      html += `<button data-view="${tab.id}" style="padding: 8px 20px; border-radius: 6px; border: 2px solid ${active ? ACCENT_BLUE : '#334155'}; background: ${active ? ACCENT_BLUE : '#0f172a'}; color: ${active ? '#000' : TEXT_BRIGHT}; font: bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">${tab.label}</button>`;
    }
    html += `</div>`;

    // Position filter
    html += `<div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;">`;
    html += `<span style="font-size: 11px; color: ${TEXT};">Filter:</span>`;
    const positions = ['all', 'GK', 'DEF', 'MID', 'FWD'];
    for (const pos of positions) {
      const active = this.positionFilter === pos;
      html += `<button data-pos-filter="${pos}" style="padding: 4px 12px; border-radius: 4px; border: 1px solid ${active ? ACCENT_ORANGE : '#334155'}; background: ${active ? '#3d2008' : 'transparent'}; color: ${active ? ACCENT_ORANGE : TEXT}; font: 11px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">${pos === 'all' ? 'All' : pos}</button>`;
    }
    html += `</div>`;

    if (this.viewMode === 'listings') {
      html += this.renderListings(seasonState, market, playerTeam);
    } else if (this.viewMode === 'squad') {
      html += this.renderMySquad(seasonState, market, playerTeam);
    } else {
      html += this.renderSearch(seasonState, market, playerTeam);
    }

    html += '</div>';
    this.container.innerHTML = html;
    this.attachHandlers(seasonState);
  }

  private matchesPositionFilter(role: string): boolean {
    if (this.positionFilter === 'all') return true;
    const group = roleToGroup(role);
    return group === this.positionFilter;
  }

  private renderListings(state: SeasonState, market: TransferMarketState, playerTeam: SeasonTeam): string {
    // Combine listed players and free agents
    interface ListingRow {
      player: PlayerState;
      teamId: string;
      teamName: string;
      askingPrice: number;
      value: number;
      rating: number;
      isFreeAgent: boolean;
    }

    const rows: ListingRow[] = [];

    for (const listing of market.listings) {
      let player: PlayerState | undefined;
      let teamName = 'Free Agent';

      if (listing.teamId === 'free-agent') {
        player = market.freeAgents.find(p => p.id === listing.playerId);
      } else {
        const team = state.teams.find(t => t.id === listing.teamId);
        teamName = team?.name ?? 'Unknown';
        player = team?.squad.find(p => p.id === listing.playerId);
      }

      if (!player) continue;
      if (!this.matchesPositionFilter(player.role as string)) continue;

      rows.push({
        player,
        teamId: listing.teamId,
        teamName,
        askingPrice: listing.askingPrice,
        value: market.playerValues.get(player.id) ?? 0,
        rating: calculatePlayerRating(player),
        isFreeAgent: listing.teamId === 'free-agent',
      });
    }

    // Sort
    rows.sort((a, b) => {
      const dir = this.sortAsc ? 1 : -1;
      switch (this.sortCol) {
        case 'name': return dir * (a.player.name ?? '').localeCompare(b.player.name ?? '');
        case 'age': return dir * ((a.player.age ?? 0) - (b.player.age ?? 0));
        case 'pos': return dir * (a.player.role as string).localeCompare(b.player.role as string);
        case 'rating': return dir * (a.rating - b.rating);
        case 'team': return dir * a.teamName.localeCompare(b.teamName);
        case 'price': return dir * (a.askingPrice - b.askingPrice);
        case 'value': return dir * (a.value - b.value);
        default: return 0;
      }
    });

    if (rows.length === 0) {
      return `<p style="color: ${TEXT}; text-align: center; padding: 40px 0;">No players currently listed in this position.</p>`;
    }

    const cols = `minmax(120px,2fr) 36px 48px 52px minmax(80px,1.5fr) 72px 72px 80px`;

    let html = `<div style="overflow-x: auto;"><div style="min-width: 600px;">`;

    // Header
    html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #334155; align-items: center;">`;
    html += this.sortHeader('name', 'Name');
    html += this.sortHeader('age', 'Age', true);
    html += this.sortHeader('pos', 'Pos', true);
    html += this.sortHeader('rating', 'Rtg', true);
    html += this.sortHeader('team', 'Team');
    html += this.sortHeader('price', 'Ask', true);
    html += this.sortHeader('value', 'Value', true);
    html += `<span style="text-align:center; color: ${TEXT};">Action</span>`;
    html += `</div>`;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const ratingColor = r.rating >= 70 ? GREEN : r.rating >= 50 ? ACCENT_ORANGE : RED;

      html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;
      html += `<span data-player-click="${r.player.id}" style="color: ${ACCENT_BLUE}; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.player.name ?? 'Unknown'}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">${r.player.age ?? '?'}</span>`;
      html += `<span style="text-align:center; color: ${ACCENT_ORANGE}; font-weight: bold; font-size: 11px;">${r.player.role}</span>`;
      html += `<span style="text-align:center; color: ${ratingColor}; font-weight: bold;">${r.rating}</span>`;
      html += `<span style="color: ${TEXT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;">${r.teamName}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">£${formatMoney(r.askingPrice)}</span>`;
      html += `<span style="text-align:center; color: ${TEXT};">£${formatMoney(r.value)}</span>`;

      // Action button
      if (r.teamId === playerTeam.id) {
        html += `<span style="text-align:center; color: ${TEXT}; font-size: 10px;">Your player</span>`;
      } else if (r.isFreeAgent) {
        html += `<button data-sign-free="${r.player.id}" style="padding: 3px 10px; border-radius: 4px; border: 1px solid ${GREEN}; background: transparent; color: ${GREEN}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Sign</button>`;
      } else if (this.activeBidPlayerId === r.player.id) {
        html += `<div style="display: flex; gap: 4px; align-items: center;">`;
        html += `<input data-bid-input="${r.player.id}" type="number" min="100" step="100" value="${r.askingPrice}" style="width: 60px; padding: 2px 4px; border: 1px solid #334155; border-radius: 3px; background: #0f172a; color: ${TEXT_BRIGHT}; font-size: 10px;">`;
        html += `<button data-bid-submit="${r.player.id}" data-to-team="${r.teamId}" style="padding: 2px 8px; border-radius: 3px; border: 1px solid ${GREEN}; background: transparent; color: ${GREEN}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">OK</button>`;
        html += `</div>`;
      } else {
        html += `<button data-bid-open="${r.player.id}" style="padding: 3px 10px; border-radius: 4px; border: 1px solid ${ACCENT_BLUE}; background: transparent; color: ${ACCENT_BLUE}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Bid</button>`;
      }

      html += `</div>`;
    }

    html += `</div></div>`;
    return html;
  }

  private renderMySquad(_state: SeasonState, market: TransferMarketState, playerTeam: SeasonTeam): string {
    const squad = playerTeam.squad.filter(p => this.matchesPositionFilter(p.role as string));
    const listedIds = new Set(market.listings.filter(l => l.teamId === playerTeam.id).map(l => l.playerId));

    const sorted = [...squad].sort((a, b) => {
      const dir = this.sortAsc ? 1 : -1;
      switch (this.sortCol) {
        case 'name': return dir * (a.name ?? '').localeCompare(b.name ?? '');
        case 'age': return dir * ((a.age ?? 0) - (b.age ?? 0));
        case 'pos': return dir * (a.role as string).localeCompare(b.role as string);
        case 'rating': return dir * (calculatePlayerRating(a) - calculatePlayerRating(b));
        case 'value': return dir * ((market.playerValues.get(a.id) ?? 0) - (market.playerValues.get(b.id) ?? 0));
        default: return 0;
      }
    });

    const cols = `minmax(120px,2fr) 36px 48px 52px 72px 80px`;

    let html = `<div style="overflow-x: auto;"><div style="min-width: 500px;">`;

    html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #334155; align-items: center;">`;
    html += this.sortHeader('name', 'Name');
    html += this.sortHeader('age', 'Age', true);
    html += this.sortHeader('pos', 'Pos', true);
    html += this.sortHeader('rating', 'Rtg', true);
    html += this.sortHeader('value', 'Value', true);
    html += `<span style="text-align:center; color: ${TEXT};">Action</span>`;
    html += `</div>`;

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]!;
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const rating = calculatePlayerRating(p);
      const value = market.playerValues.get(p.id) ?? 0;
      const isListed = listedIds.has(p.id);
      const ratingColor = rating >= 70 ? GREEN : rating >= 50 ? ACCENT_ORANGE : RED;

      html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;
      html += `<span data-player-click="${p.id}" style="color: ${ACCENT_BLUE}; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name ?? 'Unknown'}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">${p.age ?? '?'}</span>`;
      html += `<span style="text-align:center; color: ${ACCENT_ORANGE}; font-weight: bold; font-size: 11px;">${p.role}</span>`;
      html += `<span style="text-align:center; color: ${ratingColor}; font-weight: bold;">${rating}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">£${formatMoney(value)}</span>`;

      if (isListed) {
        html += `<button data-unlist="${p.id}" style="padding: 3px 10px; border-radius: 4px; border: 1px solid ${RED}; background: transparent; color: ${RED}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Unlist</button>`;
      } else {
        html += `<button data-list="${p.id}" style="padding: 3px 10px; border-radius: 4px; border: 1px solid ${ACCENT_ORANGE}; background: transparent; color: ${ACCENT_ORANGE}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">List</button>`;
      }

      html += `</div>`;
    }

    html += `</div></div>`;
    return html;
  }

  private renderSearch(state: SeasonState, market: TransferMarketState, playerTeam: SeasonTeam): string {
    // Team filter dropdown
    let html = `<div style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center;">`;
    html += `<span style="font-size: 11px; color: ${TEXT};">Team:</span>`;
    html += `<select data-team-filter style="padding: 4px 8px; border: 1px solid #334155; border-radius: 4px; background: #0f172a; color: ${TEXT_BRIGHT}; font-size: 11px;">`;
    html += `<option value="all"${this.searchTeamFilter === 'all' ? ' selected' : ''}>All Teams</option>`;
    for (const team of state.teams) {
      html += `<option value="${team.id}"${this.searchTeamFilter === team.id ? ' selected' : ''}>${team.name}</option>`;
    }
    html += `</select></div>`;

    // Collect all players
    interface SearchRow {
      player: PlayerState;
      teamId: string;
      teamName: string;
      rating: number;
      value: number;
      isListed: boolean;
    }

    const rows: SearchRow[] = [];
    const listedIds = new Set(market.listings.map(l => l.playerId));

    for (const team of state.teams) {
      if (this.searchTeamFilter !== 'all' && team.id !== this.searchTeamFilter) continue;
      for (const p of team.squad) {
        if (!this.matchesPositionFilter(p.role as string)) continue;
        rows.push({
          player: p,
          teamId: team.id,
          teamName: team.name,
          rating: calculatePlayerRating(p),
          value: market.playerValues.get(p.id) ?? 0,
          isListed: listedIds.has(p.id),
        });
      }
    }

    rows.sort((a, b) => {
      const dir = this.sortAsc ? 1 : -1;
      switch (this.sortCol) {
        case 'name': return dir * (a.player.name ?? '').localeCompare(b.player.name ?? '');
        case 'age': return dir * ((a.player.age ?? 0) - (b.player.age ?? 0));
        case 'pos': return dir * (a.player.role as string).localeCompare(b.player.role as string);
        case 'rating': return dir * (a.rating - b.rating);
        case 'team': return dir * a.teamName.localeCompare(b.teamName);
        case 'value': return dir * (a.value - b.value);
        default: return 0;
      }
    });

    const cols = `minmax(120px,2fr) 36px 48px 52px minmax(80px,1.5fr) 72px 44px 80px`;

    html += `<div style="overflow-x: auto;"><div style="min-width: 600px;">`;

    html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #334155; align-items: center;">`;
    html += this.sortHeader('name', 'Name');
    html += this.sortHeader('age', 'Age', true);
    html += this.sortHeader('pos', 'Pos', true);
    html += this.sortHeader('rating', 'Rtg', true);
    html += this.sortHeader('team', 'Team');
    html += this.sortHeader('value', 'Value', true);
    html += `<span style="text-align:center; color: ${TEXT};">TL</span>`;
    html += `<span style="text-align:center; color: ${TEXT};">Action</span>`;
    html += `</div>`;

    for (let i = 0; i < Math.min(rows.length, 100); i++) {
      const r = rows[i]!;
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const ratingColor = r.rating >= 70 ? GREEN : r.rating >= 50 ? ACCENT_ORANGE : RED;

      html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;
      html += `<span data-player-click="${r.player.id}" style="color: ${ACCENT_BLUE}; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.player.name ?? 'Unknown'}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">${r.player.age ?? '?'}</span>`;
      html += `<span style="text-align:center; color: ${ACCENT_ORANGE}; font-weight: bold; font-size: 11px;">${r.player.role}</span>`;
      html += `<span style="text-align:center; color: ${ratingColor}; font-weight: bold;">${r.rating}</span>`;
      html += `<span style="color: ${TEXT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;">${r.teamName}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">£${formatMoney(r.value)}</span>`;
      html += `<span style="text-align:center; color: ${r.isListed ? GREEN : TEXT};">${r.isListed ? 'Yes' : '-'}</span>`;

      if (r.teamId === playerTeam.id) {
        html += `<span style="text-align:center; color: ${TEXT}; font-size: 10px;">Your player</span>`;
      } else if (this.activeBidPlayerId === r.player.id) {
        html += `<div style="display: flex; gap: 4px; align-items: center;">`;
        html += `<input data-bid-input="${r.player.id}" type="number" min="100" step="100" value="${r.value}" style="width: 60px; padding: 2px 4px; border: 1px solid #334155; border-radius: 3px; background: #0f172a; color: ${TEXT_BRIGHT}; font-size: 10px;">`;
        html += `<button data-bid-submit="${r.player.id}" data-to-team="${r.teamId}" style="padding: 2px 8px; border-radius: 3px; border: 1px solid ${GREEN}; background: transparent; color: ${GREEN}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">OK</button>`;
        html += `</div>`;
      } else {
        html += `<button data-bid-open="${r.player.id}" style="padding: 3px 10px; border-radius: 4px; border: 1px solid ${ACCENT_BLUE}; background: transparent; color: ${ACCENT_BLUE}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Bid</button>`;
      }

      html += `</div>`;
    }

    html += `</div></div>`;
    return html;
  }

  private sortHeader(col: SortColumn, label: string, center = false): string {
    const active = this.sortCol === col;
    const arrow = active ? (this.sortAsc ? ' ▲' : ' ▼') : '';
    const style = `cursor: pointer; user-select: none; color: ${active ? ACCENT_BLUE : TEXT}; white-space: nowrap;${center ? ' text-align: center;' : ''}`;
    return `<span data-sort-col="${col}" style="${style}">${label}${arrow}</span>`;
  }

  private attachHandlers(seasonState: SeasonState): void {
    // View toggles
    for (const btn of this.container.querySelectorAll('[data-view]')) {
      const view = (btn as HTMLElement).dataset.view as ViewMode;
      btn.addEventListener('click', () => { this.viewMode = view; this.render(seasonState); });
    }

    // Position filter
    for (const btn of this.container.querySelectorAll('[data-pos-filter]')) {
      const pos = (btn as HTMLElement).dataset.posFilter!;
      btn.addEventListener('click', () => { this.positionFilter = pos; this.render(seasonState); });
    }

    // Sort headers
    for (const hdr of this.container.querySelectorAll('[data-sort-col]')) {
      const col = (hdr as HTMLElement).dataset.sortCol as SortColumn;
      hdr.addEventListener('click', () => {
        if (this.sortCol === col) this.sortAsc = !this.sortAsc;
        else { this.sortCol = col; this.sortAsc = col === 'name' || col === 'pos' || col === 'team'; }
        this.render(seasonState);
      });
    }

    // Player clicks
    for (const link of this.container.querySelectorAll('[data-player-click]')) {
      const id = (link as HTMLElement).dataset.playerClick!;
      link.addEventListener('click', (e) => { e.stopPropagation(); this.playerClickCallbacks.forEach(cb => cb(id)); });
    }

    // Bid open
    for (const btn of this.container.querySelectorAll('[data-bid-open]')) {
      const id = (btn as HTMLElement).dataset.bidOpen!;
      btn.addEventListener('click', () => { this.activeBidPlayerId = id; this.render(seasonState); });
    }

    // Bid submit
    for (const btn of this.container.querySelectorAll('[data-bid-submit]')) {
      const id = (btn as HTMLElement).dataset.bidSubmit!;
      const toTeam = (btn as HTMLElement).dataset.toTeam!;
      btn.addEventListener('click', () => {
        const input = this.container.querySelector(`[data-bid-input="${id}"]`) as HTMLInputElement | null;
        const amount = input ? parseInt(input.value, 10) : 0;
        if (amount > 0) {
          this.activeBidPlayerId = null;
          this.bidCallbacks.forEach(cb => cb(id, toTeam, amount));
        }
      });
    }

    // Sign free agent
    for (const btn of this.container.querySelectorAll('[data-sign-free]')) {
      const id = (btn as HTMLElement).dataset.signFree!;
      btn.addEventListener('click', () => { this.signFreeAgentCallbacks.forEach(cb => cb(id)); });
    }

    // List / Unlist
    for (const btn of this.container.querySelectorAll('[data-list]')) {
      const id = (btn as HTMLElement).dataset.list!;
      btn.addEventListener('click', () => { this.listCallbacks.forEach(cb => cb(id)); });
    }
    for (const btn of this.container.querySelectorAll('[data-unlist]')) {
      const id = (btn as HTMLElement).dataset.unlist!;
      btn.addEventListener('click', () => { this.unlistCallbacks.forEach(cb => cb(id)); });
    }

    // Team filter (search view)
    const teamSelect = this.container.querySelector('[data-team-filter]') as HTMLSelectElement | null;
    if (teamSelect) {
      teamSelect.addEventListener('change', () => {
        this.searchTeamFilter = teamSelect.value;
        this.render(seasonState);
      });
    }
  }
}

// --- Helper ---

function roleToGroup(role: string): string {
  switch (role) {
    case 'GK': return 'GK';
    case 'CB': case 'LB': case 'RB': return 'DEF';
    case 'CDM': case 'CM': case 'CAM': return 'MID';
    case 'LW': case 'RW': case 'ST': return 'FWD';
    default: return 'MID';
  }
}
