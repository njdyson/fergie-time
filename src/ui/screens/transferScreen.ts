/**
 * Transfer Market Screen — browse listings, bid for players, manage squad transfers.
 *
 * Three sub-views:
 *  1. Transfer List — all listed players + free agents
 *  2. My Squad — your players with list/unlist controls
 *  3. Search — browse all league players
 */

import type { SeasonState, SeasonTeam } from '../../season/season.ts';
import type { TransferMarketState, Bid } from '../../season/transferMarket.ts';
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

type ViewMode = 'listings' | 'squad' | 'search' | 'bids';
type SortColumn = 'name' | 'age' | 'pos' | 'rating' | 'team' | 'price' | 'value';

export class TransferScreen {
  private container: HTMLElement;
  private viewMode: ViewMode = 'listings';
  private sortCol: SortColumn = 'rating';
  private sortAsc: boolean = false;
  private positionFilter: string = 'all';
  private searchTeamFilter: string = 'all';

  private bidStatusFilter: Bid['status'] | 'all' = 'all';

  // Callbacks
  private playerClickCallbacks: Array<(playerId: string) => void> = [];
  private bidCallbacks: Array<(playerId: string, toTeamId: string, amount: number) => void> = [];
  private listCallbacks: Array<(playerId: string) => void> = [];
  private unlistCallbacks: Array<(playerId: string) => void> = [];
  private signFreeAgentCallbacks: Array<(playerId: string) => void> = [];

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

  /** Open a bid modal for a player. Can be called externally (e.g. from profile screen). */
  openBidModal(playerName: string, playerId: string, toTeamId: string, suggestedAmount: number, budget: number): void {
    this.showBidModal(playerName, playerId, toTeamId, suggestedAmount, budget);
  }

  private showBidModal(playerName: string, playerId: string, toTeamId: string, suggestedAmount: number, budget: number): void {
    // Remove any existing modal
    document.getElementById('bid-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'bid-modal-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000;';

    const modal = document.createElement('div');
    modal.style.cssText = `background:${PANEL_BG}; border:1px solid #334155; border-radius:12px; padding:24px; min-width:280px; max-width:360px; width:90%; box-shadow:0 8px 32px rgba(0,0,0,0.5);`;

    modal.innerHTML = `
      <div style="color:${TEXT_BRIGHT}; font-size:16px; font-weight:bold; margin-bottom:4px;">Place Bid</div>
      <div style="color:${ACCENT_BLUE}; font-size:14px; margin-bottom:16px;">${playerName}</div>
      <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
        <span style="color:${TEXT}; font-size:11px;">Suggested: £${formatMoney(suggestedAmount)}</span>
        <span style="color:${GREEN}; font-size:11px;">Budget: £${formatMoney(budget)}</span>
      </div>
      <div style="margin-bottom:16px;">
        <label style="color:${TEXT}; font-size:11px; display:block; margin-bottom:4px;">Bid Amount (£)</label>
        <input id="bid-modal-input" type="number" min="100" step="100" value="${suggestedAmount}"
          style="width:100%; padding:8px 12px; border:1px solid #334155; border-radius:6px; background:#0f172a; color:${TEXT_BRIGHT}; font-size:14px; box-sizing:border-box;">
      </div>
      <div style="display:flex; gap:8px;">
        <button id="bid-modal-submit" style="flex:1; padding:10px; border-radius:6px; border:2px solid ${GREEN}; background:transparent; color:${GREEN}; font:bold 13px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer;">Submit Bid</button>
        <button id="bid-modal-cancel" style="flex:1; padding:10px; border-radius:6px; border:2px solid #334155; background:transparent; color:${TEXT}; font:bold 13px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer;">Cancel</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    modal.querySelector('#bid-modal-cancel')!.addEventListener('click', closeModal);

    modal.querySelector('#bid-modal-submit')!.addEventListener('click', () => {
      const input = modal.querySelector('#bid-modal-input') as HTMLInputElement;
      const amount = parseInt(input.value, 10);
      if (amount > 0) {
        closeModal();
        this.bidCallbacks.forEach(cb => cb(playerId, toTeamId, amount));
      }
    });

    // Focus the input
    (modal.querySelector('#bid-modal-input') as HTMLInputElement).focus();
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
      { id: 'bids', label: 'My Bids' },
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
    } else if (this.viewMode === 'bids') {
      html += this.renderBids(seasonState, market, playerTeam);
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

    let html = `<div style="overflow-x: auto;"><div class="mobile-no-minwidth" style="min-width: 600px;">`;

    // Header
    html += `<div class="transfer-grid" style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #334155; align-items: center;">`;
    html += this.sortHeader('name', 'Name');
    html += this.sortHeader('age', 'Age', true, 'transfer-col-age');
    html += this.sortHeader('pos', 'Pos', true);
    html += this.sortHeader('rating', 'Rtg', true);
    html += this.sortHeader('team', 'Team', false, 'transfer-col-team');
    html += this.sortHeader('price', 'Ask', true);
    html += this.sortHeader('value', 'Value', true, 'transfer-col-value');
    html += `<span style="text-align:center; color: ${TEXT};">Action</span>`;
    html += `</div>`;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const ratingColor = r.rating >= 70 ? GREEN : r.rating >= 50 ? ACCENT_ORANGE : RED;

      html += `<div class="transfer-grid" style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;
      html += `<span data-player-click="${r.player.id}" style="color: ${ACCENT_BLUE}; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.player.name ?? 'Unknown'}</span>`;
      html += `<span class="transfer-col-age" style="text-align:center; color: ${TEXT_BRIGHT};">${r.player.age ?? '?'}</span>`;
      html += `<span style="text-align:center; color: ${ACCENT_ORANGE}; font-weight: bold; font-size: 11px;">${r.player.role}</span>`;
      html += `<span style="text-align:center; color: ${ratingColor}; font-weight: bold;">${r.rating}</span>`;
      html += `<span class="transfer-col-team" style="color: ${TEXT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;">${r.teamName}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">£${formatMoney(r.askingPrice)}</span>`;
      html += `<span class="transfer-col-value" style="text-align:center; color: ${TEXT};">£${formatMoney(r.value)}</span>`;

      // Action button
      if (r.teamId === playerTeam.id) {
        html += `<span style="text-align:center; color: ${TEXT}; font-size: 10px;">Your player</span>`;
      } else if (r.isFreeAgent) {
        html += `<button data-sign-free="${r.player.id}" style="padding: 3px 10px; border-radius: 4px; border: 1px solid ${GREEN}; background: transparent; color: ${GREEN}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Sign</button>`;
      } else {
        html += `<button data-bid-open="${r.player.id}" data-bid-team="${r.teamId}" data-bid-name="${r.player.name ?? 'Unknown'}" data-bid-amount="${r.askingPrice}" style="padding: 3px 10px; border-radius: 4px; border: 1px solid ${ACCENT_BLUE}; background: transparent; color: ${ACCENT_BLUE}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Bid</button>`;
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

    let html = `<div style="overflow-x: auto;"><div class="mobile-no-minwidth" style="min-width: 500px;">`;

    html += `<div class="transfer-grid" style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #334155; align-items: center;">`;
    html += this.sortHeader('name', 'Name');
    html += this.sortHeader('age', 'Age', true, 'transfer-col-age');
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

      html += `<div class="transfer-grid" style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;
      html += `<span data-player-click="${p.id}" style="color: ${ACCENT_BLUE}; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name ?? 'Unknown'}</span>`;
      html += `<span class="transfer-col-age" style="text-align:center; color: ${TEXT_BRIGHT};">${p.age ?? '?'}</span>`;
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

    html += `<div style="overflow-x: auto;"><div class="mobile-no-minwidth" style="min-width: 600px;">`;

    html += `<div class="transfer-grid" style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #334155; align-items: center;">`;
    html += this.sortHeader('name', 'Name');
    html += this.sortHeader('age', 'Age', true, 'transfer-col-age');
    html += this.sortHeader('pos', 'Pos', true);
    html += this.sortHeader('rating', 'Rtg', true);
    html += this.sortHeader('team', 'Team', false, 'transfer-col-team');
    html += this.sortHeader('value', 'Value', true, 'transfer-col-value');
    html += `<span style="text-align:center; color: ${TEXT};">TL</span>`;
    html += `<span style="text-align:center; color: ${TEXT};">Action</span>`;
    html += `</div>`;

    for (let i = 0; i < Math.min(rows.length, 100); i++) {
      const r = rows[i]!;
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const ratingColor = r.rating >= 70 ? GREEN : r.rating >= 50 ? ACCENT_ORANGE : RED;

      html += `<div class="transfer-grid" style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;
      html += `<span data-player-click="${r.player.id}" style="color: ${ACCENT_BLUE}; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.player.name ?? 'Unknown'}</span>`;
      html += `<span class="transfer-col-age" style="text-align:center; color: ${TEXT_BRIGHT};">${r.player.age ?? '?'}</span>`;
      html += `<span style="text-align:center; color: ${ACCENT_ORANGE}; font-weight: bold; font-size: 11px;">${r.player.role}</span>`;
      html += `<span style="text-align:center; color: ${ratingColor}; font-weight: bold;">${r.rating}</span>`;
      html += `<span class="transfer-col-team" style="color: ${TEXT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;">${r.teamName}</span>`;
      html += `<span class="transfer-col-value" style="text-align:center; color: ${TEXT_BRIGHT};">£${formatMoney(r.value)}</span>`;
      html += `<span style="text-align:center; color: ${r.isListed ? GREEN : TEXT};">${r.isListed ? 'Yes' : '-'}</span>`;

      if (r.teamId === playerTeam.id) {
        html += `<span style="text-align:center; color: ${TEXT}; font-size: 10px;">Your player</span>`;
      } else {
        html += `<button data-bid-open="${r.player.id}" data-bid-team="${r.teamId}" data-bid-name="${r.player.name ?? 'Unknown'}" data-bid-amount="${r.value}" style="padding: 3px 10px; border-radius: 4px; border: 1px solid ${ACCENT_BLUE}; background: transparent; color: ${ACCENT_BLUE}; font: bold 10px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Bid</button>`;
      }

      html += `</div>`;
    }

    html += `</div></div>`;
    return html;
  }

  private renderBids(state: SeasonState, market: TransferMarketState, playerTeam: SeasonTeam): string {
    // Status filter buttons
    const statuses: Array<{ id: Bid['status'] | 'all'; label: string; color: string }> = [
      { id: 'all', label: 'All', color: TEXT_BRIGHT },
      { id: 'pending', label: 'Pending', color: ACCENT_BLUE },
      { id: 'accepted', label: 'Accepted', color: GREEN },
      { id: 'rejected', label: 'Rejected', color: RED },
    ];

    let html = `<div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;">`;
    html += `<span style="font-size: 11px; color: ${TEXT};">Status:</span>`;
    for (const s of statuses) {
      const active = this.bidStatusFilter === s.id;
      html += `<button data-bid-status-filter="${s.id}" style="padding: 4px 12px; border-radius: 4px; border: 1px solid ${active ? s.color : '#334155'}; background: ${active ? 'rgba(255,255,255,0.08)' : 'transparent'}; color: ${active ? s.color : TEXT}; font: 11px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">${s.label}</button>`;
    }
    html += `</div>`;

    // Filter bids to player team outgoing bids
    let bids = market.bids.filter(b => b.fromTeamId === playerTeam.id);
    if (this.bidStatusFilter !== 'all') {
      bids = bids.filter(b => b.status === this.bidStatusFilter);
    }
    // Sort newest first
    bids = [...bids].sort((a, b) => b.matchday - a.matchday);

    if (bids.length === 0) {
      html += `<p style="color: ${TEXT}; text-align: center; padding: 40px 0;">No bids placed yet.</p>`;
      return html;
    }

    const cols = `minmax(120px,2fr) 48px minmax(80px,1.5fr) 80px 80px 64px`;

    html += `<div style="overflow-x: auto;"><div class="mobile-no-minwidth" style="min-width: 520px;">`;

    // Header
    html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #334155; align-items: center; color: ${TEXT};">`;
    html += `<span>Player</span>`;
    html += `<span style="text-align:center;">Pos</span>`;
    html += `<span>To Team</span>`;
    html += `<span style="text-align:center;">Amount</span>`;
    html += `<span style="text-align:center;">Status</span>`;
    html += `<span style="text-align:center;">Day</span>`;
    html += `</div>`;

    for (let i = 0; i < bids.length; i++) {
      const bid = bids[i]!;
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';

      // Resolve player and team names
      let playerName = 'Unknown';
      let playerRole = '-';
      let toTeamName = 'Unknown';

      for (const team of state.teams) {
        const p = team.squad.find(pl => pl.id === bid.playerId);
        if (p) { playerName = p.name ?? 'Unknown'; playerRole = p.role as string; break; }
      }
      if (!playerName || playerName === 'Unknown') {
        const fa = market.freeAgents.find(p => p.id === bid.playerId);
        if (fa) { playerName = fa.name ?? 'Unknown'; playerRole = fa.role as string; }
      }

      if (bid.toTeamId === 'free-agent') {
        toTeamName = 'Free Agent';
      } else {
        const toTeam = state.teams.find(t => t.id === bid.toTeamId);
        toTeamName = toTeam?.name ?? bid.toTeamId;
      }

      // Status badge styling
      let statusColor = TEXT;
      let statusBg = 'transparent';
      if (bid.status === 'pending') { statusColor = ACCENT_BLUE; statusBg = 'rgba(96,165,250,0.12)'; }
      else if (bid.status === 'accepted') { statusColor = GREEN; statusBg = 'rgba(74,222,128,0.12)'; }
      else if (bid.status === 'rejected') { statusColor = RED; statusBg = 'rgba(248,113,113,0.12)'; }

      html += `<div style="display: grid; grid-template-columns: ${cols}; gap: 4px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;
      html += `<span data-player-click="${bid.playerId}" style="color: ${ACCENT_BLUE}; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${playerName}</span>`;
      html += `<span style="text-align:center; color: ${ACCENT_ORANGE}; font-weight: bold; font-size: 11px;">${playerRole}</span>`;
      html += `<span style="color: ${TEXT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;">${toTeamName}</span>`;
      html += `<span style="text-align:center; color: ${TEXT_BRIGHT};">£${formatMoney(bid.amount)}</span>`;
      html += `<span style="text-align:center;"><span style="padding: 2px 8px; border-radius: 4px; background: ${statusBg}; color: ${statusColor}; font-size: 11px; font-weight: bold;">${bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}</span></span>`;
      html += `<span style="text-align:center; color: ${TEXT}; font-size: 11px;">${bid.matchday}</span>`;
      html += `</div>`;
    }

    html += `</div></div>`;
    return html;
  }

  private sortHeader(col: SortColumn, label: string, center = false, className = ''): string {
    const active = this.sortCol === col;
    const arrow = active ? (this.sortAsc ? ' ▲' : ' ▼') : '';
    const style = `cursor: pointer; user-select: none; color: ${active ? ACCENT_BLUE : TEXT}; white-space: nowrap;${center ? ' text-align: center;' : ''}`;
    const cls = className ? ` class="${className}"` : '';
    return `<span data-sort-col="${col}"${cls} style="${style}">${label}${arrow}</span>`;
  }

  private attachHandlers(seasonState: SeasonState): void {
    const market = seasonState.transferMarket;
    const playerTeam = seasonState.teams.find(t => t.isPlayerTeam)!;
    const budget = market.teamBudgets.get(playerTeam.id) ?? 0;

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

    // Bid open → modal
    for (const btn of this.container.querySelectorAll('[data-bid-open]')) {
      const el = btn as HTMLElement;
      const playerId = el.dataset.bidOpen!;
      const toTeamId = el.dataset.bidTeam!;
      const playerName = el.dataset.bidName!;
      const suggestedAmount = parseInt(el.dataset.bidAmount!, 10);
      btn.addEventListener('click', () => {
        this.showBidModal(playerName, playerId, toTeamId, suggestedAmount, budget);
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

    // Bid status filter
    for (const btn of this.container.querySelectorAll('[data-bid-status-filter]')) {
      const status = (btn as HTMLElement).dataset.bidStatusFilter as Bid['status'] | 'all';
      btn.addEventListener('click', () => { this.bidStatusFilter = status; this.render(seasonState); });
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
