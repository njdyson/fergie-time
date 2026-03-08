/**
 * Player Profile Screen - detailed per-player view.
 * Shows portrait, info panel, grouped attribute radar, personality bars, and season stats.
 */

import type { PlayerState } from '../../simulation/types.ts';
import type { PlayerSeasonStats } from '../../season/playerStats.ts';
import type { SeasonTeam, TrainingDeltas } from '../../season/season.ts';
import { calculatePlayerRating } from '../../season/playerAnalysis.ts';
import { formatMoney } from '../../season/transferMarket.ts';
import { getOrGeneratePortrait } from '../portrait/portraitCache.ts';

const PANEL_BG = '#1e293b';
const PANEL_ALT = '#0f172a';
const PANEL_BORDER = '#334155';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const ACCENT_ORANGE = '#fb923c';
const GREEN = '#4ade80';
const YELLOW = '#fbbf24';
const RED = '#f87171';
const TEAL = '#2dd4bf';

const TEAM_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

type AttributeKey = keyof PlayerState['attributes'];

interface AttributeMeta {
  key: AttributeKey;
  label: string;
  shortLabel: string;
}

interface AttributeGroup {
  label: string;
  color: string;
  attributes: AttributeMeta[];
}

interface ChartAttribute extends AttributeMeta {
  groupLabel: string;
  groupColor: string;
}

interface CoachReportSummary {
  strengths: Array<{ label: string; value: number }>;
  weaknesses: Array<{ label: string; value: number }>;
  styleLine: string;
  outlookLine: string;
}

const ATTRIBUTE_GROUPS: AttributeGroup[] = [
  {
    label: 'Physical',
    color: ACCENT_BLUE,
    attributes: [
      { key: 'pace', label: 'Pace', shortLabel: 'PAC' },
      { key: 'acceleration', label: 'Acceleration', shortLabel: 'ACC' },
      { key: 'agility', label: 'Agility', shortLabel: 'AGI' },
      { key: 'strength', label: 'Strength', shortLabel: 'STR' },
      { key: 'stamina', label: 'Stamina', shortLabel: 'STA' },
    ],
  },
  {
    label: 'Possession',
    color: GREEN,
    attributes: [
      { key: 'dribbling', label: 'Dribbling', shortLabel: 'DRI' },
      { key: 'passing', label: 'Passing', shortLabel: 'PAS' },
      { key: 'vision', label: 'Vision', shortLabel: 'VIS' },
      { key: 'crossing', label: 'Crossing', shortLabel: 'CRO' },
    ],
  },
  {
    label: 'Attacking',
    color: ACCENT_ORANGE,
    attributes: [
      { key: 'shooting', label: 'Shooting', shortLabel: 'SHO' },
      { key: 'finishing', label: 'Finishing', shortLabel: 'FIN' },
      { key: 'heading', label: 'Heading', shortLabel: 'HEA' },
      { key: 'aerial', label: 'Aerial', shortLabel: 'AIR' },
    ],
  },
  {
    label: 'Defending',
    color: RED,
    attributes: [
      { key: 'tackling', label: 'Tackling', shortLabel: 'TAC' },
      { key: 'positioning', label: 'Positioning', shortLabel: 'POS' },
      { key: 'concentration', label: 'Concentration', shortLabel: 'CON' },
    ],
  },
  {
    label: 'Goalkeeping',
    color: TEAL,
    attributes: [
      { key: 'reflexes', label: 'Reflexes', shortLabel: 'REF' },
      { key: 'handling', label: 'Handling', shortLabel: 'HAN' },
      { key: 'oneOnOnes', label: '1v1s', shortLabel: '1V1' },
      { key: 'distribution', label: 'Distribution', shortLabel: 'DIS' },
    ],
  },
];

const CHART_ATTRIBUTES: ChartAttribute[] = [];
for (const group of ATTRIBUTE_GROUPS) {
  for (const attribute of group.attributes) {
    CHART_ATTRIBUTES.push({
      ...attribute,
      groupLabel: group.label,
      groupColor: group.color,
    });
  }
}

const NAT_NAMES: Record<string, string> = {
  GB: 'England',
  ES: 'Spain',
  FR: 'France',
  DE: 'Germany',
  BR: 'Brazil',
  IT: 'Italy',
  PT: 'Portugal',
  NL: 'Netherlands',
  AR: 'Argentina',
  NG: 'Nigeria',
};

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

function getNationalityName(code?: string): string {
  if (!code) return 'Unknown';
  return NAT_NAMES[code] ?? code;
}

function renderBar(label: string, value: number, improved?: boolean): string {
  const pct = Math.round(value * 100);
  const barColor = getAttrBarColor(value);
  const arrow = improved ? '+' : '';
  return `
    <div style="display:flex; align-items:center; gap:8px; padding:3px 0;">
      <span style="color:${TEXT}; font-size:11px; width:88px; flex-shrink:0;">${label}</span>
      <div style="flex:1; height:8px; background:${PANEL_BORDER}; border-radius:999px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:999px; transition:width .2s;"></div>
      </div>
      <span style="color:${TEXT_BRIGHT}; font-size:11px; width:28px; text-align:right; flex-shrink:0;">${pct}</span>
      <span style="color:${GREEN}; font-size:10px; width:10px; flex-shrink:0; text-align:center;">${arrow}</span>
    </div>
  `;
}

function renderCompactAttributeRow(label: string, value: number, improved?: boolean): string {
  const pct = Math.round(value * 100);
  return `
    <div style="display:grid; grid-template-columns:minmax(0, 1fr) auto auto; gap:10px; align-items:center; padding:5px 0;">
      <span style="color:${TEXT}; font-size:12px; min-width:0;">${label}</span>
      <span style="color:${TEXT_BRIGHT}; font-size:12px; font-weight:700; text-align:right;">${pct}</span>
      <span style="color:${GREEN}; font-size:10px; width:10px; text-align:center;">${improved ? '+' : ''}</span>
    </div>
  `;
}

function getCoachReportSummary(player: PlayerState): CoachReportSummary {
  const attrs = player.attributes;
  const relevantGroups = player.role === 'GK'
    ? ATTRIBUTE_GROUPS
    : ATTRIBUTE_GROUPS.filter((group) => group.label !== 'Goalkeeping');
  const relevantAttributes = relevantGroups.flatMap((group) => group.attributes);
  const ranked = relevantAttributes
    .map((attribute) => ({ label: attribute.label, value: Math.round(attrs[attribute.key] * 100) }))
    .sort((a, b) => b.value - a.value);

  const strengths = ranked.slice(0, 3);
  const weaknesses = [...ranked].reverse().slice(0, 2);

  const personality = player.personality;
  const styleParts: string[] = [];
  if (personality.creativity >= 0.65 || personality.flair >= 0.65) styleParts.push('tries inventive solutions');
  if (personality.work_rate >= 0.65) styleParts.push('keeps a high work rate');
  if (personality.composure >= 0.65) styleParts.push('stays calm under pressure');
  if (personality.directness >= 0.65) styleParts.push('plays direct when the lane opens');
  if (styleParts.length === 0) styleParts.push('offers a fairly balanced profile');

  const strongest = strengths[0];
  const weakest = weaknesses[0];
  const outlookLine = strongest && weakest
    ? `Best current edge is ${strongest.label.toLowerCase()} (${strongest.value}). Main area to tighten is ${weakest.label.toLowerCase()} (${weakest.value}).`
    : 'Profile is still building out.';

  return {
    strengths,
    weaknesses,
    styleLine: styleParts[0]!.charAt(0).toUpperCase() + styleParts[0]!.slice(1) + '.',
    outlookLine,
  };
}

function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const angle = (angleDeg - 90) * (Math.PI / 180);
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function formatPoint(n: number): string {
  return n.toFixed(2);
}

function buildPolygonPath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatPoint(point.x)} ${formatPoint(point.y)}`).join(' ') + ' Z';
}

function buildSectorPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const startOuter = polarPoint(cx, cy, outerRadius, startAngle);
  const endOuter = polarPoint(cx, cy, outerRadius, endAngle);
  const startInner = polarPoint(cx, cy, innerRadius, endAngle);
  const endInner = polarPoint(cx, cy, innerRadius, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${formatPoint(startOuter.x)} ${formatPoint(startOuter.y)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${formatPoint(endOuter.x)} ${formatPoint(endOuter.y)}`,
    `L ${formatPoint(startInner.x)} ${formatPoint(startInner.y)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${formatPoint(endInner.x)} ${formatPoint(endInner.y)}`,
    'Z',
  ].join(' ');
}

function renderAttributeRadar(player: PlayerState): string {
  const size = 400;
  const cx = 200;
  const cy = 200;
  const radius = 128;
  const labelRadius = 176;
  const sectorInnerRadius = 138;
  const sectorOuterRadius = 162;
  const angleStep = 360 / CHART_ATTRIBUTES.length;

  const gridFractions = [0.25, 0.5, 0.75, 1];
  const gridPolygons = gridFractions.map((fraction) => {
    const ringPoints = CHART_ATTRIBUTES.map((_, index) => {
      const angle = index * angleStep;
      return polarPoint(cx, cy, radius * fraction, angle);
    });
    return `<path d="${buildPolygonPath(ringPoints)}" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="1" />`;
  }).join('');

  const axes = CHART_ATTRIBUTES.map((_, index) => {
    const angle = index * angleStep;
    const end = polarPoint(cx, cy, radius, angle);
    return `<line x1="${cx}" y1="${cy}" x2="${formatPoint(end.x)}" y2="${formatPoint(end.y)}" stroke="rgba(148,163,184,0.18)" stroke-width="1" />`;
  }).join('');

  const points = CHART_ATTRIBUTES.map((attribute, index) => {
    const angle = index * angleStep;
    return {
      attribute,
      angle,
      point: polarPoint(cx, cy, radius * player.attributes[attribute.key], angle),
    };
  });

  const valuePath = buildPolygonPath(points.map((entry) => entry.point));
  const pointDots = points.map(({ attribute, point }) =>
    `<circle cx="${formatPoint(point.x)}" cy="${formatPoint(point.y)}" r="3.4" fill="${attribute.groupColor}" stroke="${PANEL_ALT}" stroke-width="1.5" />`,
  ).join('');

  let startIndex = 0;
  const sectors = ATTRIBUTE_GROUPS.map((group) => {
    const groupStartAngle = startIndex * angleStep - angleStep / 2;
    const groupEndAngle = (startIndex + group.attributes.length - 1) * angleStep + angleStep / 2;
    startIndex += group.attributes.length;
    return `<path d="${buildSectorPath(cx, cy, sectorInnerRadius, sectorOuterRadius, groupStartAngle, groupEndAngle)}" fill="${group.color}" opacity="0.16" />`;
  }).join('');

  const labels = points.map(({ attribute, angle }) => {
    const pos = polarPoint(cx, cy, labelRadius, angle);
    const textAnchor = Math.abs(pos.x - cx) < 10 ? 'middle' : pos.x < cx ? 'end' : 'start';
    return `<text x="${formatPoint(pos.x)}" y="${formatPoint(pos.y)}" fill="${TEXT}" font-size="10" font-weight="700" text-anchor="${textAnchor}" dominant-baseline="middle">${attribute.shortLabel}</text>`;
  }).join('');

  const ringLabels = gridFractions.map((fraction) => {
    const pos = polarPoint(cx, cy, radius * fraction, 0);
    return `<text x="${formatPoint(pos.x)}" y="${formatPoint(pos.y - 6)}" fill="rgba(226,232,240,0.72)" font-size="10" text-anchor="middle">${Math.round(fraction * 100)}</text>`;
  }).join('');

  return `
    <div style="background:${PANEL_ALT}; border:1px solid ${PANEL_BORDER}; border-radius:12px; padding:12px;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <div style="color:${TEXT_BRIGHT}; font-size:13px; font-weight:700;">Attribute Radar</div>
      </div>
      <svg data-profile-radar-chart viewBox="0 0 ${size} ${size}" width="100%" style="display:block; width:100%; height:auto;" role="img" aria-label="Player attribute radar chart">
        ${sectors}
        ${gridPolygons}
        ${axes}
        <path d="${valuePath}" fill="rgba(96,165,250,0.22)" stroke="${ACCENT_BLUE}" stroke-width="2.5" />
        ${pointDots}
        <circle cx="${cx}" cy="${cy}" r="3" fill="${TEXT_BRIGHT}" />
        ${labels}
        ${ringLabels}
      </svg>
    </div>
  `;
}

function renderAttributeGroups(
  player: PlayerState,
  playerDeltas?: Partial<Record<AttributeKey, number>>,
): string {
  return `
    <div class="player-profile-group-grid" data-profile-attribute-groups>
      ${ATTRIBUTE_GROUPS.map((group) => `
        <div style="background:${PANEL_ALT}; border:1px solid ${PANEL_BORDER}; border-radius:12px; padding:12px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="width:10px; height:10px; border-radius:999px; background:${group.color};"></span>
            <div style="color:${TEXT_BRIGHT}; font-size:12px; font-weight:700; letter-spacing:0.02em;">${group.label}</div>
          </div>
          ${group.attributes.map((attribute) => {
            const improved = playerDeltas ? (playerDeltas[attribute.key] ?? 0) >= 0.005 : false;
            return renderCompactAttributeRow(attribute.label, player.attributes[attribute.key], improved);
          }).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function renderCoachReport(player: PlayerState): string {
  const report = getCoachReportSummary(player);
  return `
    <div style="background:${PANEL_ALT}; border:1px solid ${PANEL_BORDER}; border-radius:12px; padding:12px;" data-profile-coach-report>
      <div style="color:${TEXT_BRIGHT}; font-size:12px; font-weight:700; letter-spacing:0.02em; margin-bottom:8px;">Coach Report</div>
      <div style="color:${TEXT}; font-size:12px; line-height:1.5; margin-bottom:10px;">${report.styleLine} ${report.outlookLine}</div>
      <div style="display:grid; grid-template-columns:1fr; gap:8px;">
        <div>
          <div style="color:${GREEN}; font-size:11px; font-weight:700; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.04em;">Strengths</div>
          <div style="color:${TEXT_BRIGHT}; font-size:12px; line-height:1.5;">${report.strengths.map((item) => `${item.label} ${item.value}`).join(' • ')}</div>
        </div>
        <div>
          <div style="color:${ACCENT_ORANGE}; font-size:11px; font-weight:700; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.04em;">Needs Work</div>
          <div style="color:${TEXT_BRIGHT}; font-size:12px; line-height:1.5;">${report.weaknesses.map((item) => `${item.label} ${item.value}`).join(' • ')}</div>
        </div>
      </div>
    </div>
  `;
}

function formatPct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '-';
  return `${((numerator / denominator) * 100).toFixed(0)}%`;
}

function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function renderSeasonStatsTable(player: PlayerState, seasonStats: PlayerSeasonStats | null, seasonNumber: number): string {
  const stats: PlayerSeasonStats = seasonStats ?? {
    goals: 0,
    assists: 0,
    appearances: 0,
    shots: 0,
    shotsOnTarget: 0,
    passes: 0,
    passesCompleted: 0,
    tacklesWon: 0,
    tacklesAttempted: 0,
    yellowCards: 0,
    redCards: 0,
    cleanSheets: 0,
    minutesPlayed: 0,
  };

  const passPct = formatPct(stats.passesCompleted, stats.passes);
  const tacklePct = formatPct(stats.tacklesWon, stats.tacklesAttempted);
  const goalsPerGame = stats.appearances > 0 ? formatRate(stats.goals / stats.appearances) : '-';
  const hasPlayed = stats.appearances > 0;

  return `
    <div style="background:${PANEL_BG}; border-radius:12px; padding:14px; margin-bottom:20px;">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap:wrap;">
        <div>
          <div style="color:${GREEN}; font-size:12px; font-weight:700; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Season Stats</div>
          <div style="color:${TEXT}; font-size:12px;">Structured as rows so more seasons can slot in without changing the layout.</div>
        </div>
        ${hasPlayed
          ? `<div style="color:${TEXT}; font-size:11px;">Current row: Season ${seasonNumber}</div>`
          : `<div style="color:${TEXT}; font-size:11px;">No appearances yet this season.</div>`}
      </div>
      <div class="player-profile-table-wrap">
        <table data-profile-season-stats-table class="player-profile-season-table">
          <thead>
            <tr>
              <th>Season</th>
              <th>Apps</th>
              <th>Min</th>
              <th>Goals</th>
              <th>Ast</th>
              <th>Shots</th>
              <th>SoT</th>
              <th>Pass %</th>
              <th>Tkl Won</th>
              <th>Tkl %</th>
              <th>YC</th>
              <th>RC</th>
              <th>CS</th>
              <th>G/Game</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Season ${seasonNumber}</td>
              <td>${stats.appearances}</td>
              <td>${stats.minutesPlayed}</td>
              <td style="color:${stats.goals > 0 ? GREEN : TEXT_BRIGHT};">${stats.goals}</td>
              <td style="color:${stats.assists > 0 ? ACCENT_BLUE : TEXT_BRIGHT};">${stats.assists}</td>
              <td>${stats.shots}</td>
              <td>${stats.shotsOnTarget}</td>
              <td>${passPct}</td>
              <td>${stats.tacklesWon}</td>
              <td>${tacklePct}</td>
              <td style="color:${stats.yellowCards > 0 ? YELLOW : TEXT_BRIGHT};">${stats.yellowCards}</td>
              <td style="color:${stats.redCards > 0 ? RED : TEXT_BRIGHT};">${stats.redCards}</td>
              <td style="color:${player.role === 'GK' && stats.cleanSheets > 0 ? GREEN : TEXT_BRIGHT};">${stats.cleanSheets}</td>
              <td>${goalsPerGame}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderStyles(): string {
  return `
    <style>
      .player-profile-shell {
        max-width: 1120px;
        margin: 0 auto;
        padding: 16px;
      }

      .player-profile-main {
        display: grid;
        grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
        gap: 20px;
        margin-bottom: 20px;
      }

      .player-profile-sidebar {
        display: grid;
        gap: 16px;
      }

      .player-profile-content {
        display: grid;
        gap: 16px;
        align-content: start;
      }

      .player-profile-radar-stack {
        display: grid;
        gap: 12px;
        align-content: start;
      }

      .player-profile-attr-layout {
        display: grid;
        grid-template-columns: minmax(380px, 1.2fr) minmax(260px, 0.8fr);
        gap: 16px;
        align-items: start;
      }

      .player-profile-group-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .player-profile-attr-side {
        display: grid;
        gap: 12px;
        align-content: start;
      }

      .player-profile-table-wrap {
        overflow-x: auto;
        border: 1px solid ${PANEL_BORDER};
        border-radius: 12px;
      }

      .player-profile-season-table {
        width: 100%;
        min-width: 860px;
        border-collapse: collapse;
        background: ${PANEL_ALT};
      }

      .player-profile-season-table th,
      .player-profile-season-table td {
        padding: 10px 12px;
        border-bottom: 1px solid ${PANEL_BORDER};
        text-align: center;
        color: ${TEXT_BRIGHT};
        font-size: 12px;
        white-space: nowrap;
      }

      .player-profile-season-table th {
        color: ${TEXT};
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 10px;
        background: rgba(30, 41, 59, 0.95);
      }

      .player-profile-season-table th:first-child,
      .player-profile-season-table td:first-child {
        text-align: left;
      }

      .player-profile-season-table tbody tr:last-child td {
        border-bottom: 0;
      }

      @media (max-width: 960px) {
        .player-profile-main,
        .player-profile-attr-layout {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 700px) {
        .player-profile-shell {
          padding: 12px;
        }
      }
    </style>
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
  private releaseCallbacks: Array<(playerId: string) => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.overflowY = 'auto';
    this.container.style.height = '100%';
    this.container.style.boxSizing = 'border-box';
    this.container.style.backgroundColor = PANEL_ALT;
  }

  onBack(cb: () => void): void { this.backCallbacks.push(cb); }
  onBid(cb: (playerId: string, toTeamId: string, suggestedAmount: number, budget: number) => void): void { this.bidCallbacks.push(cb); }
  onList(cb: (playerId: string) => void): void { this.listCallbacks.push(cb); }
  onUnlist(cb: (playerId: string) => void): void { this.unlistCallbacks.push(cb); }
  onSignFreeAgent(cb: (playerId: string) => void): void { this.signFreeAgentCallbacks.push(cb); }
  onRelease(cb: (playerId: string) => void): void { this.releaseCallbacks.push(cb); }

  update(
    player: PlayerState,
    team: SeasonTeam,
    seasonStats: PlayerSeasonStats | null,
    seasonNumber: number,
    transferInfo?: ProfileTransferInfo,
    trainingDeltas?: TrainingDeltas,
  ): void {
    this.render(player, team, seasonStats, seasonNumber, transferInfo, trainingDeltas);
  }

  private render(
    player: PlayerState,
    team: SeasonTeam,
    seasonStats: PlayerSeasonStats | null,
    seasonNumber: number,
    transferInfo?: ProfileTransferInfo,
    trainingDeltas?: TrainingDeltas,
  ): void {
    const shirtColor = getTeamShirtColor(team);
    const personality = player.personality;
    const playerDeltas = trainingDeltas?.get(player.id);

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

    const rating = calculatePlayerRating(player);
    const ratingColor = rating >= 70 ? GREEN : rating >= 50 ? ACCENT_ORANGE : RED;
    const infoRow = (label: string, value: string | number) =>
      `<div><div style="color:${TEXT}; font-size:10px; margin-bottom:2px;">${label}</div><div style="color:${TEXT_BRIGHT}; font-size:13px; font-weight:700;">${value}</div></div>`;

    let html = '';
    html += renderStyles();
    html += `<div class="player-profile-shell">`;

    html += `<div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; background:${PANEL_BG}; padding:12px 16px; border-radius:12px;">`;
    html += `<button data-back style="padding:6px 14px; border-radius:6px; border:1px solid ${PANEL_BORDER}; background:${PANEL_ALT}; color:${TEXT_BRIGHT}; font:700 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer;">Back</button>`;
    html += `<div style="flex:1;">`;
    html += `<div style="color:${TEXT_BRIGHT}; font-size:20px; font-weight:700;">${player.name ?? 'Unknown'}</div>`;
    html += `<div style="color:${TEXT}; font-size:12px; margin-top:2px;">${team.name}</div>`;
    html += `</div>`;
    html += `</div>`;

    html += `<div class="player-profile-main">`;
    html += `<div class="player-profile-sidebar">`;
    html += `<div style="background:${PANEL_BG}; border-radius:12px; padding:14px;">`;
    html += `<div style="color:${ACCENT_BLUE}; font-size:12px; font-weight:700; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Profile</div>`;
    html += `<div style="display:flex; flex-direction:column; align-items:center; gap:10px; margin-bottom:14px;">`;
    html += `<canvas id="player-avatar-canvas" width="156" height="156" style="border-radius:50%; border:3px solid ${shirtColor};"></canvas>`;
    html += `<div style="color:${TEXT}; font-size:11px; text-align:center; background:${PANEL_ALT}; padding:4px 8px; border-radius:999px;">${team.name}</div>`;
    html += `</div>`;
    html += `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px 16px;">`;
    html += infoRow('Position', player.role);
    html += infoRow('Shirt #', player.shirtNumber ?? '-');
    html += infoRow('Age', player.age ?? '-');
    html += infoRow('Height', player.height ? `${player.height}cm` : '-');
    html += infoRow('Nationality', getNationalityName(player.nationality));
    html += `<div><div style="color:${TEXT}; font-size:10px; margin-bottom:2px;">Rating</div><div style="color:${ratingColor}; font-size:16px; font-weight:700;">${rating}</div></div>`;
    if (transferInfo) {
      html += `<div><div style="color:${TEXT}; font-size:10px; margin-bottom:2px;">Value</div><div style="color:${GREEN}; font-size:13px; font-weight:700;">GBP ${formatMoney(transferInfo.value)}</div></div>`;
    }
    html += `</div>`;

    if (transferInfo) {
      html += `<div style="margin-top:12px;">`;
      if (transferInfo.isPlayerTeam) {
        html += `<div style="display:flex; gap:8px; flex-wrap:wrap;">`;
        if (transferInfo.isListed) {
          html += `<button data-profile-unlist="${player.id}" style="padding:8px 20px; border-radius:8px; border:2px solid ${RED}; background:transparent; color:${RED}; font:700 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; flex:1;">Remove from Transfer List</button>`;
        } else {
          html += `<button data-profile-list="${player.id}" style="padding:8px 20px; border-radius:8px; border:2px solid ${ACCENT_ORANGE}; background:transparent; color:${ACCENT_ORANGE}; font:700 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; flex:1;">Add to Transfer List</button>`;
        }
        html += `<button data-profile-release="${player.id}" style="padding:8px 20px; border-radius:8px; border:2px solid ${RED}; background:transparent; color:${RED}; font:700 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; opacity:0.78;">Release</button>`;
        html += `</div>`;
      } else if (transferInfo.isFreeAgent) {
        html += `<button data-profile-sign="${player.id}" style="padding:8px 20px; border-radius:8px; border:2px solid ${GREEN}; background:transparent; color:${GREEN}; font:700 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; width:100%;">Sign Free Agent</button>`;
      } else {
        html += `<button data-profile-bid="${player.id}" data-bid-team="${team.id}" style="padding:8px 20px; border-radius:8px; border:2px solid ${ACCENT_BLUE}; background:transparent; color:${ACCENT_BLUE}; font:700 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; width:100%;">Place Bid</button>`;
      }
      html += `</div>`;
    }

    html += `<div style="height:1px; background:${PANEL_BORDER}; margin:14px 0;"></div>`;
    html += `<div style="color:${ACCENT_ORANGE}; font-size:12px; font-weight:700; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Personality</div>`;
    for (const [label, value] of personalityAttrs) {
      html += renderBar(label, value);
    }
    html += `</div>`;
    html += `</div>`;

    html += `<div class="player-profile-content">`;
    html += `<div style="background:${PANEL_BG}; border-radius:12px; padding:14px;">`;
    html += `<div style="color:${ACCENT_BLUE}; font-size:12px; font-weight:700; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Attributes</div>`;
    html += `<div class="player-profile-attr-layout">`;
    html += `<div class="player-profile-radar-stack">`;
    html += renderAttributeRadar(player);
    html += renderCoachReport(player);
    html += `</div>`;
    html += `<div class="player-profile-attr-side">`;
    html += renderAttributeGroups(player, playerDeltas);
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;

    html += renderSeasonStatsTable(player, seasonStats, seasonNumber);
    html += `</div>`;

    this.container.innerHTML = html;

    const avatarCanvas = this.container.querySelector('#player-avatar-canvas') as HTMLCanvasElement | null;
    if (avatarCanvas) {
      getOrGeneratePortrait(avatarCanvas, player);
    }

    const backBtn = this.container.querySelector('[data-back]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        for (const cb of this.backCallbacks) cb();
      });
    }

    const bidBtn = this.container.querySelector('[data-profile-bid]') as HTMLElement | null;
    if (bidBtn && transferInfo) {
      bidBtn.addEventListener('click', () => {
        const toTeam = bidBtn.dataset.bidTeam!;
        this.bidCallbacks.forEach((cb) => cb(player.id, toTeam, transferInfo.value, transferInfo.budget));
      });
    }

    const listBtn = this.container.querySelector('[data-profile-list]') as HTMLElement | null;
    if (listBtn) {
      listBtn.addEventListener('click', () => this.listCallbacks.forEach((cb) => cb(player.id)));
    }

    const unlistBtn = this.container.querySelector('[data-profile-unlist]') as HTMLElement | null;
    if (unlistBtn) {
      unlistBtn.addEventListener('click', () => this.unlistCallbacks.forEach((cb) => cb(player.id)));
    }

    const signBtn = this.container.querySelector('[data-profile-sign]') as HTMLElement | null;
    if (signBtn) {
      signBtn.addEventListener('click', () => this.signFreeAgentCallbacks.forEach((cb) => cb(player.id)));
    }

    const releaseBtn = this.container.querySelector('[data-profile-release]') as HTMLElement | null;
    if (releaseBtn) {
      releaseBtn.addEventListener('click', () => this.releaseCallbacks.forEach((cb) => cb(player.id)));
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
