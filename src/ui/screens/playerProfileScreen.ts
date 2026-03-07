/**
 * Player Profile Screen — detailed per-player view.
 * Shows avatar (canvas), info panel, attribute bars, personality bars, and season stats.
 * Accessible by clicking any player name in the app.
 */

import type { PlayerState } from '../../simulation/types.ts';
import type { PlayerSeasonStats } from '../../season/playerStats.ts';
import type { SeasonTeam } from '../../season/season.ts';

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

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]![0] ?? '?').toUpperCase();
  return ((parts[0]![0] ?? '') + (parts[parts.length - 1]![0] ?? '')).toUpperCase();
}

/** Draw the player avatar on a canvas element. */
function drawAvatar(canvas: HTMLCanvasElement, player: PlayerState, shirtColor: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Background circle
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  // Shirt shape: rounded rectangle for body + two side "sleeves"
  const shirtTop = 20;
  const shirtBottom = h - 16;
  const shirtLeft = 16;
  const shirtRight = w - 16;
  const sleeveH = 18;

  ctx.fillStyle = shirtColor;

  // Main body
  ctx.beginPath();
  ctx.roundRect(shirtLeft, shirtTop + 10, shirtRight - shirtLeft, shirtBottom - shirtTop - 10, 4);
  ctx.fill();

  // Left sleeve
  ctx.beginPath();
  ctx.roundRect(6, shirtTop + 8, shirtLeft - 2, sleeveH, 3);
  ctx.fill();

  // Right sleeve
  ctx.beginPath();
  ctx.roundRect(shirtRight + 2, shirtTop + 8, shirtLeft - 2, sleeveH, 3);
  ctx.fill();

  // Collar (darker)
  ctx.fillStyle = shiftColor(shirtColor, -30);
  ctx.beginPath();
  ctx.roundRect(w / 2 - 10, shirtTop, 20, 14, [6, 6, 2, 2]);
  ctx.fill();

  // Shirt number
  const shirtNum = player.shirtNumber;
  if (shirtNum != null) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${shirtNum > 9 ? 16 : 18}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(shirtNum), w / 2, h / 2 + 4);
  }

  // Player initials below number
  const initials = getInitials(player.name);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `bold 11px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, w / 2, shirtBottom - 6);
}

/** Darken/lighten a hex color by amount (-255..255). */
function shiftColor(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

/** Render a horizontal attribute bar row. */
function renderBar(label: string, value: number): string {
  const pct = Math.round(value * 100);
  const barColor = getAttrBarColor(value);
  return `
    <div style="display:flex; align-items:center; gap:8px; padding:3px 0;">
      <span style="color:${TEXT}; font-size:11px; min-width:90px; flex-shrink:0;">${label}</span>
      <div style="flex:1; height:8px; background:#334155; border-radius:4px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:4px; transition:width .2s;"></div>
      </div>
      <span style="color:${TEXT_BRIGHT}; font-size:11px; min-width:26px; text-align:right;">${pct}</span>
    </div>
  `;
}

export class PlayerProfileScreen {
  private container: HTMLElement;
  private backCallbacks: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.overflowY = 'auto';
    this.container.style.height = '100%';
    this.container.style.boxSizing = 'border-box';
    this.container.style.backgroundColor = '#0f172a';
  }

  /** Register a callback for the back button. */
  onBack(cb: () => void): void {
    this.backCallbacks.push(cb);
  }

  /** Update the profile screen with a specific player's data. */
  update(player: PlayerState, team: SeasonTeam, seasonStats: PlayerSeasonStats | null, seasonNumber: number): void {
    this.render(player, team, seasonStats, seasonNumber);
  }

  private render(player: PlayerState, team: SeasonTeam, seasonStats: PlayerSeasonStats | null, seasonNumber: number): void {
    const shirtColor = getTeamShirtColor(team);
    const attrs = player.attributes;
    const personality = player.personality;

    // Core attributes to display (plan spec: pace, shooting, passing, dribbling, defending, physical)
    // Map to actual attribute names from PlayerAttributes
    const coreAttrs: Array<[string, number]> = [
      ['Pace', attrs.pace],
      ['Shooting', attrs.shooting],
      ['Passing', attrs.passing],
      ['Dribbling', attrs.dribbling],
      ['Defending', attrs.tackling],
      ['Physical', attrs.strength],
    ];

    // Extended attributes
    const extAttrs: Array<[string, number]> = [
      ['Finishing', attrs.finishing],
      ['Vision', attrs.vision],
      ['Crossing', attrs.crossing],
      ['Aerial', attrs.aerial],
      ['Positioning', attrs.positioning],
      ['Stamina', attrs.stamina],
      ['Agility', attrs.agility],
      ['Heading', attrs.heading],
      ['Concentration', attrs.concentration],
      ['Reflexes', attrs.reflexes],
      ['Handling', attrs.handling],
      ['1v1s', attrs.oneOnOnes],
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

    html += infoRow('Position', player.role);
    html += infoRow('Shirt #', player.shirtNumber ?? '-');
    html += infoRow('Age', player.age ?? '-');
    html += infoRow('Height', player.height ? `${player.height}cm` : '-');
    html += infoRow('Nationality', getNationalityName(player.nationality));
    html += `</div>`;
    html += `</div>`;

    html += `</div>`; // end main content row

    // ── Two-column layout: attributes + personality ──
    html += `<div class="profile-attrs" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">`;

    // Core Attributes panel
    html += `<div style="background:${PANEL_BG}; border-radius:8px; padding:14px;">`;
    html += `<div style="color:${ACCENT_BLUE}; font-size:12px; font-weight:bold; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Attributes</div>`;
    for (const [label, value] of coreAttrs) {
      html += renderBar(label, value);
    }
    // GK-specific attributes only if GK
    if (player.role === 'GK') {
      html += `<div style="color:${TEXT}; font-size:10px; margin-top:8px; margin-bottom:4px; opacity:0.7;">Goalkeeper</div>`;
      for (const [label, value] of extAttrs.filter(([l]) => ['Reflexes','Handling','1v1s'].includes(l))) {
        html += renderBar(label, value);
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

    // Draw avatar on canvas
    const avatarCanvas = this.container.querySelector('#player-avatar-canvas') as HTMLCanvasElement | null;
    if (avatarCanvas) {
      drawAvatar(avatarCanvas, player, shirtColor);
    }

    // Attach back button handler
    const backBtn = this.container.querySelector('[data-back]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        for (const cb of this.backCallbacks) cb();
      });
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
