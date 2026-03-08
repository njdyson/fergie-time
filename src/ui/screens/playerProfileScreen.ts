/**
 * Player Profile Screen — detailed per-player view.
 * Shows avatar (canvas), info panel, attribute bars, personality bars, and season stats.
 * Accessible by clicking any player name in the app.
 */

import type { PlayerState } from '../../simulation/types.ts';
import type { PlayerSeasonStats } from '../../season/playerStats.ts';
import type { SeasonTeam, TrainingDeltas } from '../../season/season.ts';
import { calculatePlayerRating } from '../../season/playerAnalysis.ts';
import { formatMoney } from '../../season/transferMarket.ts';
import { getOrGeneratePortrait } from '../portrait/portraitCache.ts';

// Color palette (dark theme)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const ACCENT_ORANGE = '#fb923c';
const GREEN = '#4ade80';
const YELLOW = '#fbbf24';
const RED = '#f87171';

// Team color palette for AI teams (deterministic from team name hash)
const TEAM_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

function hashTeamColor(teamName: string): string {
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = (hash * 31 + teamName.charCodeAt(i)) & 0xffffffff;
  }
  return TEAM_COLORS[Math.abs(hash) % TEAM_COLORS.length]!;
}

function getTeamShirtColor(team: SeasonTeam): string {
  if (team.isPlayerTeam) return ACCENT_BLUE;
  return hashTeamColor(team.name);
}

function getAttrBarColor(value: number): string {
  if (value >= 0.7) return GREEN;
  if (value >= 0.4) return YELLOW;
  return RED;
}

// ISO 2-letter → full name
const NAT_NAMES: Record<string, string> = {
  GB: 'England', ES: 'Spain', FR: 'France', DE: 'Germany', BR: 'Brazil',
  IT: 'Italy', PT: 'Portugal', NL: 'Netherlands', AR: 'Argentina', NG: 'Nigeria',
};

function getNationalityName(code?: string): string {
  if (!code) return 'Unknown';
  return NAT_NAMES[code] ?? code;
}

/** Render a horizontal attribute bar row. */
function renderBar(label: string, value: number, improved?: boolean): string {
  const pct = Math.round(value * 100);
  const barColor = getAttrBarColor(value);
  const borderLeft = improved ? `border-left: 3px solid ${GREEN}` : `border-left: 3px solid transparent`;
  const arrow = improved ? `<span style="color:${GREEN}; font-size:9px; margin-left:2px;">▲</span>` : '';
  return `
    <div style="display:flex; align-items:center; gap:8px; padding:3px 0; ${borderLeft}; padding-left:4px;">
      <span style="color:${TEXT}; font-size:11px; min-width:90px; flex-shrink:0;">${label}</span>
      <div style="flex:1; height:8px; background:#334155; border-radius:4px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:4px; transition:width .2s;"></div>
      </div>
      <span style="color:${TEXT_BRIGHT}; font-size:11px; min-width:26px; text-align:right;">${pct}</span>${arrow}
    </div>
  `;
}

export interface ProfileTransferInfo {
  value: number;
  isPlayerTeam: boolean;
  isListed: boolean;
  isFreeAgent: boolean;
  budget: number;
}

export class PlayerProfileScreen {
  private container: HTMLElement;
  private backCallbacks: Array<() => void> = [];
  private bidCallbacks: Array<(playerId: string, toTeamId: string, suggestedAmount: number, budget: number) => void> = [];
  private listCallbacks: Array<(playerId: string) => void> = [];
  private unlistCallbacks: Array<(playerId: string) => void> = [];
  private signFreeAgentCallbacks: Array<(playerId: string) => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.overflowY = 'auto';
    this.container.style.height = '100%';
    this.container.style.boxSizing = 'border-box';
    this.container.style.backgroundColor = '#0f172a';
  }

  onBack(cb: () => void): void { this.backCallbacks.push(cb); }
  onBid(cb: (playerId: string, toTeamId: string, suggestedAmount: number, budget: number) => void): void { this.bidCallbacks.push(cb); }
  onList(cb: (playerId: string) => void): void { this.listCallbacks.push(cb); }
  onUnlist(cb: (playerId: string) => void): void { this.unlistCallbacks.push(cb); }
  onSignFreeAgent(cb: (playerId: string) => void): void { this.signFreeAgentCallbacks.push(cb); }

  /** Update the profile screen with a specific player's data. */
  update(player: PlayerState, team: SeasonTeam, seasonStats: PlayerSeasonStats | null, seasonNumber: number, transferInfo?: ProfileTransferInfo, trainingDeltas?: TrainingDeltas): void {
    this.render(player, team, seasonStats, seasonNumber, transferInfo, trainingDeltas);
  }

  private render(player: PlayerState, team: SeasonTeam, seasonStats: PlayerSeasonStats | null, seasonNumber: number, transferInfo?: ProfileTransferInfo, trainingDeltas?: TrainingDeltas): void {
    const shirtColor = getTeamShirtColor(team);
    const attrs = player.attributes;
    const personality = player.personality;

    // Extract player's training deltas for highlighting
    const playerDeltas = trainingDeltas?.get(player.id);

    // Core attributes to display (plan spec: pace, shooting, passing, dribbling, defending, physical)
    // Map to actual attribute names from PlayerAttributes: [label, value, attrKey]
    const coreAttrs: Array<[string, number, string]> = [
      ['Pace', attrs.pace, 'pace'],
      ['Shooting', attrs.shooting, 'shooting'],
      ['Passing', attrs.passing, 'passing'],
      ['Dribbling', attrs.dribbling, 'dribbling'],
      ['Defending', attrs.tackling, 'tackling'],
      ['Physical', attrs.strength, 'strength'],
    ];

    // Extended attributes
    const extAttrs: Array<[string, number, string]> = [
      ['Finishing', attrs.finishing, 'finishing'],
      ['Vision', attrs.vision, 'vision'],
      ['Crossing', attrs.crossing, 'crossing'],
      ['Aerial', attrs.aerial, 'aerial'],
      ['Positioning', attrs.positioning, 'positioning'],
      ['Stamina', attrs.stamina, 'stamina'],
      ['Agility', attrs.agility, 'agility'],
      ['Heading', attrs.heading, 'heading'],
      ['Concentration', attrs.concentration, 'concentration'],
      ['Reflexes', attrs.reflexes, 'reflexes'],
      ['Handling', attrs.handling, 'handling'],
      ['1v1s', attrs.oneOnOnes, 'oneOnOnes'],
    ];

    // Personality bars
    const personalityAttrs: Array<[string, number]> = [
      ['Directness', personality.directness],
      ['Risk Appetite', personality.risk_appetite],
      ['Composure', personality.composure],
      ['Creativity', personality.creativity],
      ['Work Rate', personality.work_rate],
      ['Aggression', personality.aggression],
      ['Anticipation', personality.anticipation],
      ['Flair', personality.flair],
    ];

    // Season stats
    const s = seasonStats;
    const hasPlayed = s && s.appearances > 0;
    const ppct = s && s.passes > 0 ? `${((s.passesCompleted / s.passes) * 100).toFixed(0)}%` : '-';
    const gpg = s && s.appearances > 0 ? (s.goals / s.appearances).toFixed(2) : '-';

    let html = '';
    html += `<div style="max-width: 800px; margin: 0 auto; padding: 16px;">`;

    // ── Header bar with back button ──
    html += `<div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; background:${PANEL_BG}; padding:12px 16px; border-radius:8px;">`;
    html += `<button data-back style="padding:6px 14px; border-radius:4px; border:1px solid #334155; background:#0f172a; color:${TEXT_BRIGHT}; font:bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer;">← Back</button>`;
    html += `<div style="flex:1;">`;
    html += `<div style="color:${TEXT_BRIGHT}; font-size:18px; font-weight:bold;">${player.name ?? 'Unknown'}</div>`;
    html += `<div style="color:${TEXT}; font-size:12px; margin-top:2px;">${team.name}</div>`;
    html += `</div>`;
    html += `</div>`;

    // ── Main content: avatar + info side by side ──
    html += `<div style="display:flex; gap:20px; margin-bottom:20px; flex-wrap:wrap;">`;

    // Avatar canvas placeholder (will be drawn after mount)
    html += `<div style="flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:8px;">`;
    html += `<canvas id="player-avatar-canvas" width="120" height="120" style="border-radius:50%; border:3px solid ${shirtColor};"></canvas>`;
    html += `<div style="color:${TEXT}; font-size:11px; text-align:center; background:${PANEL_BG}; padding:4px 8px; border-radius:4px;">${team.name}</div>`;
    html += `</div>`;

    // Player info grid
    html += `<div style="flex:1; background:${PANEL_BG}; border-radius:8px; padding:14px; min-width:200px;">`;
    html += `<div style="color:${ACCENT_BLUE}; font-size:12px; font-weight:bold; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Player Info</div>`;
    html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 16px;">`;

    const infoRow = (label: string, value: string | number) =>
      `<div><div style="color:${TEXT}; font-size:10px; margin-bottom:2px;">${label}</div><div style="color:${TEXT_BRIGHT}; font-size:13px; font-weight:bold;">${value}</div></div>`;

    const rating = calculatePlayerRating(player);
    const ratingColor = rating >= 70 ? GREEN : rating >= 50 ? ACCENT_ORANGE : RED;

    html += infoRow('Position', player.role);
    html += infoRow('Shirt #', player.shirtNumber ?? '-');
    html += infoRow('Age', player.age ?? '-');
    html += infoRow('Height', player.height ? `${player.height}cm` : '-');
    html += infoRow('Nationality', getNationalityName(player.nationality));
    html += `<div><div style="color:${TEXT}; font-size:10px; margin-bottom:2px;">Rating</div><div style="color:${ratingColor}; font-size:13px; font-weight:bold;">${rating}</div></div>`;
    if (transferInfo) {
      html += `<div><div style="color:${TEXT}; font-size:10px; margin-bottom:2px;">Value</div><div style="color:${GREEN}; font-size:13px; font-weight:bold;">£${formatMoney(transferInfo.value)}</div></div>`;
    }
    html += `</div>`; // end grid

    // Transfer action button
    if (transferInfo) {
      html += `<div style="margin-top:12px;">`;
      if (transferInfo.isPlayerTeam) {
        if (transferInfo.isListed) {
          html += `<button data-profile-unlist="${player.id}" style="padding:8px 20px; border-radius:6px; border:2px solid ${RED}; background:transparent; color:${RED}; font:bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; width:100%;">Remove from Transfer List</button>`;
        } else {
          html += `<button data-profile-list="${player.id}" style="padding:8px 20px; border-radius:6px; border:2px solid ${ACCENT_ORANGE}; background:transparent; color:${ACCENT_ORANGE}; font:bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; width:100%;">Add to Transfer List</button>`;
        }
      } else if (transferInfo.isFreeAgent) {
        html += `<button data-profile-sign="${player.id}" style="padding:8px 20px; border-radius:6px; border:2px solid ${GREEN}; background:transparent; color:${GREEN}; font:bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; width:100%;">Sign Free Agent</button>`;
      } else {
        html += `<button data-profile-bid="${player.id}" data-bid-team="${team.id}" style="padding:8px 20px; border-radius:6px; border:2px solid ${ACCENT_BLUE}; background:transparent; color:${ACCENT_BLUE}; font:bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; width:100%;">Place Bid</button>`;
      }
      html += `</div>`;
    }

    html += `</div>`; // end info panel

    html += `</div>`; // end main content row

    // ── Two-column layout: attributes + personality ──
    html += `<div class="profile-attrs" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">`;

    // Core Attributes panel
    html += `<div style="background:${PANEL_BG}; border-radius:8px; padding:14px;">`;
    html += `<div style="color:${ACCENT_BLUE}; font-size:12px; font-weight:bold; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Attributes</div>`;
    for (const [label, value, attrKey] of coreAttrs) {
      const improved = playerDeltas ? ((playerDeltas as Record<string, number>)[attrKey] ?? 0) > 0 : false;
      html += renderBar(label, value, improved);
    }
    // GK-specific attributes only if GK
    if (player.role === 'GK') {
      html += `<div style="color:${TEXT}; font-size:10px; margin-top:8px; margin-bottom:4px; opacity:0.7;">Goalkeeper</div>`;
      for (const [label, value, attrKey] of extAttrs.filter(([l]) => ['Reflexes','Handling','1v1s'].includes(l))) {
        const improved = playerDeltas ? ((playerDeltas as Record<string, number>)[attrKey] ?? 0) > 0 : false;
        html += renderBar(label, value, improved);
      }
    }
    html += `</div>`;

    // Personality panel
    html += `<div style="background:${PANEL_BG}; border-radius:8px; padding:14px;">`;
    html += `<div style="color:${ACCENT_ORANGE}; font-size:12px; font-weight:bold; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Personality</div>`;
    for (const [label, value] of personalityAttrs) {
      html += renderBar(label, value);
    }
    html += `</div>`;

    html += `</div>`; // end two-column

    // ── Season stats panel ──
    html += `<div style="background:${PANEL_BG}; border-radius:8px; padding:14px; margin-bottom:20px;">`;
    html += `<div style="color:${GREEN}; font-size:12px; font-weight:bold; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.05em;">Season ${seasonNumber} Stats</div>`;

    if (!hasPlayed) {
      html += `<p style="color:${TEXT}; font-size:13px; margin:0;">No appearances yet this season.</p>`;
    } else {
      html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:12px;">`;

      const statBox = (label: string, value: string | number, color: string = TEXT_BRIGHT) =>
        `<div style="text-align:center; background:#0f172a; border-radius:6px; padding:10px 8px;">
          <div style="color:${color}; font-size:20px; font-weight:bold; margin-bottom:4px;">${value}</div>
          <div style="color:${TEXT}; font-size:10px;">${label}</div>
        </div>`;

      html += statBox('Appearances', s!.appearances);
      html += statBox('Goals', s!.goals, s!.goals > 0 ? GREEN : TEXT_BRIGHT);
      html += statBox('Assists', s!.assists, s!.assists > 0 ? ACCENT_BLUE : TEXT_BRIGHT);
      html += statBox('Shots', s!.shots);
      html += statBox('Shots on Target', s!.shotsOnTarget);
      html += statBox('Pass%', ppct);
      html += statBox('Tackles Won', s!.tacklesWon);
      html += statBox('Yellow Cards', s!.yellowCards || '-', s!.yellowCards > 0 ? YELLOW : TEXT_BRIGHT);
      html += statBox('Red Cards', s!.redCards || '-', s!.redCards > 0 ? RED : TEXT_BRIGHT);
      if (player.role === 'GK') {
        html += statBox('Clean Sheets', s!.cleanSheets, s!.cleanSheets > 0 ? GREEN : TEXT_BRIGHT);
      }
      html += statBox('Minutes', s!.minutesPlayed);
      html += statBox('Goals/Game', gpg);

      html += `</div>`;
    }
    html += `</div>`; // end stats panel

    html += `</div>`; // end max-width wrapper
    this.container.innerHTML = html;

    // Draw portrait on canvas
    const avatarCanvas = this.container.querySelector('#player-avatar-canvas') as HTMLCanvasElement | null;
    if (avatarCanvas) {
      getOrGeneratePortrait(avatarCanvas, player);
    }

    // Attach back button handler
    const backBtn = this.container.querySelector('[data-back]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        for (const cb of this.backCallbacks) cb();
      });
    }

    // Transfer action handlers
    const bidBtn = this.container.querySelector('[data-profile-bid]') as HTMLElement | null;
    if (bidBtn && transferInfo) {
      bidBtn.addEventListener('click', () => {
        const toTeam = bidBtn.dataset.bidTeam!;
        this.bidCallbacks.forEach(cb => cb(player.id, toTeam, transferInfo.value, transferInfo.budget));
      });
    }
    const listBtn = this.container.querySelector('[data-profile-list]') as HTMLElement | null;
    if (listBtn) {
      listBtn.addEventListener('click', () => this.listCallbacks.forEach(cb => cb(player.id)));
    }
    const unlistBtn = this.container.querySelector('[data-profile-unlist]') as HTMLElement | null;
    if (unlistBtn) {
      unlistBtn.addEventListener('click', () => this.unlistCallbacks.forEach(cb => cb(player.id)));
    }
    const signBtn = this.container.querySelector('[data-profile-sign]') as HTMLElement | null;
    if (signBtn) {
      signBtn.addEventListener('click', () => this.signFreeAgentCallbacks.forEach(cb => cb(player.id)));
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
