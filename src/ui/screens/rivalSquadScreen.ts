import type { PlayerState } from '../../simulation/types.ts';
import type { SeasonTeam } from '../../season/season.ts';
import type { PlayerSeasonStats } from '../../season/playerStats.ts';

const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const ACCENT_ORANGE = '#fb923c';
const GREEN = '#4ade80';
const RED = '#f87171';

const ATTR_NAMES: Array<keyof PlayerState['attributes']> = [
  'pace', 'strength', 'stamina', 'dribbling', 'passing',
  'shooting', 'tackling', 'aerial', 'positioning', 'vision',
];

const ATTR_SHORT: Record<string, string> = {
  pace: 'PAC', strength: 'STR', stamina: 'STA', dribbling: 'DRI', passing: 'PAS',
  shooting: 'SHO', tackling: 'TAC', aerial: 'AER', positioning: 'POS', vision: 'VIS',
};

const NAT_MAP: Record<string, { abbr: string; name: string }> = {
  GB: { abbr: 'ENG', name: 'England' },
  ES: { abbr: 'ESP', name: 'Spain' },
  FR: { abbr: 'FRA', name: 'France' },
  DE: { abbr: 'GER', name: 'Germany' },
  BR: { abbr: 'BRA', name: 'Brazil' },
};

function getNat(code?: string): { abbr: string; name: string } {
  if (!code) return { abbr: '---', name: 'Unknown' };
  return NAT_MAP[code] ?? { abbr: code.slice(0, 3).toUpperCase(), name: code };
}

function getAttrBarColor(value: number): string {
  if (value >= 0.75) return GREEN;
  if (value >= 0.5) return ACCENT_BLUE;
  if (value >= 0.3) return ACCENT_ORANGE;
  return RED;
}

function getFitnessColor(fitness: number): string {
  if (fitness >= 0.75) return GREEN;
  if (fitness >= 0.5) return ACCENT_ORANGE;
  return RED;
}

export class RivalSquadScreen {
  private container: HTMLElement;
  private backCallbacks: Array<() => void> = [];
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

  onBack(cb: () => void): void {
    this.backCallbacks.push(cb);
  }

  onPlayerClick(cb: (playerId: string) => void): void {
    this.playerClickCallbacks.push(cb);
  }

  update(
    team: SeasonTeam,
    fatigueMap: ReadonlyMap<string, number>,
    playerSeasonStats: ReadonlyMap<string, PlayerSeasonStats>,
  ): void {
    const gridCols = `56px 36px 140px 48px 36px 40px 48px ${ATTR_NAMES.map(() => '32px').join(' ')} 48px 28px 28px 32px`;
    let html = '<div style="max-width: 900px; margin: 0 auto;">';
    html += `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
        <button data-rival-back style="padding:6px 12px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:${TEXT_BRIGHT}; font:600 12px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer;">Back</button>
        <h2 style="color:${TEXT_BRIGHT}; font-size:22px; margin:0;">${team.name} Squad</h2>
      </div>
    `;

    html += `<div class="squad-grid" style="display: grid; grid-template-columns: ${gridCols}; gap: 2px; padding: 4px 8px; font-size: 10px; color: ${TEXT}; border-bottom: 1px solid #334155; align-items: center;">`;
    html += '<span></span>';
    html += '<span>#</span>';
    html += '<span>Name</span>';
    html += '<span>Pos</span>';
    html += '<span>Nat</span>';
    html += '<span>Age</span>';
    html += '<span>Ht</span>';
    for (const attr of ATTR_NAMES) {
      html += `<span style="text-align:center;" title="${attr}">${ATTR_SHORT[attr]}</span>`;
    }
    html += '<span style="text-align:center;">FIT</span>';
    html += `<span style="text-align: center; color: #4ade80; font-weight: bold;" title="Goals this season">G</span>`;
    html += `<span style="text-align: center; color: #60a5fa; font-weight: bold;" title="Assists this season">A</span>`;
    html += `<span style="text-align: center;" title="Appearances this season">App</span>`;
    html += '</div>';

    const players = [...team.squad];
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const fitness = 1 - (fatigueMap.get(p.id) ?? p.fatigue ?? 0);
      const fitPct = Math.round(fitness * 100);
      const fitColor = getFitnessColor(fitness);
      const nat = getNat(p.nationality);
      const stats = playerSeasonStats.get(p.id);
      const goals = stats?.goals ?? null;
      const assists = stats?.assists ?? null;
      const apps = stats?.appearances ?? null;

      html += `<div style="display: grid; grid-template-columns: ${gridCols}; gap: 2px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center;">`;
      html += `<span style="display:inline-block; background:${GREEN}; color:#000; font-weight:bold; font-size:10px; padding:2px 6px; border-radius:3px; text-align:center;">${p.role}</span>`;
      html += `<span style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; border:1.5px solid ${ACCENT_BLUE}; background:#0f172a; color:${TEXT_BRIGHT}; font:bold 11px/1 'Segoe UI',system-ui,sans-serif; margin:0 auto;">${p.shirtNumber ?? '-'}</span>`;
      html += `<span data-rival-player="${p.id}" style="color:${ACCENT_BLUE}; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="View player profile">${p.name ?? 'Unknown'}</span>`;
      html += `<span style="color:${ACCENT_ORANGE}; font-weight:bold;">${p.role}</span>`;
      html += `<span style="color:${TEXT}; font-size:10px;" title="${nat.name}">${nat.abbr}</span>`;
      html += `<span style="color:${TEXT};">${p.age ?? '-'}</span>`;
      html += `<span style="color:${TEXT};">${p.height ? `${p.height}cm` : '-'}</span>`;

      for (const attr of ATTR_NAMES) {
        const val = p.attributes[attr];
        const pct = Math.round(val * 100);
        const barColor = getAttrBarColor(val);
        html += `<span style="text-align:center;" title="${attr}: ${pct}%"><div style="width:24px; height:6px; background:#334155; border-radius:2px; margin:0 auto;"><div style="width:${pct}%; height:100%; background:${barColor}; border-radius:2px;"></div></div></span>`;
      }

      html += `<span style="text-align:center;" title="Fitness: ${fitPct}%"><div style="width:30px; height:6px; background:#334155; border-radius:2px; margin:0 auto;"><div style="width:${fitPct}%; height:100%; background:${fitColor}; border-radius:2px;"></div></div></span>`;
      html += `<span style="text-align: center; color: ${goals ? '#4ade80' : TEXT}; font-weight: ${goals ? 'bold' : 'normal'}; font-size: 11px;">${goals !== null ? goals : '-'}</span>`;
      html += `<span style="text-align: center; color: ${assists ? '#60a5fa' : TEXT}; font-size: 11px;">${assists !== null ? assists : '-'}</span>`;
      html += `<span style="text-align: center; color: ${TEXT}; font-size: 11px;">${apps !== null ? apps : '-'}</span>`;
      html += `</div>`;
    }

    html += '</div>';
    this.container.innerHTML = html;

    this.container.querySelector('[data-rival-back]')?.addEventListener('click', () => {
      for (const cb of this.backCallbacks) cb();
    });

    const playerLinks = this.container.querySelectorAll('[data-rival-player]');
    for (const link of playerLinks) {
      const playerId = (link as HTMLElement).dataset.rivalPlayer!;
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const cb of this.playerClickCallbacks) cb(playerId);
      });
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
