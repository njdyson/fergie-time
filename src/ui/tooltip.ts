import type { PlayerAttributes, PersonalityVector } from '../simulation/types.ts';

const ATTR_LABELS: { key: keyof PlayerAttributes; label: string; desc: string }[] = [
  { key: 'pace', label: 'PAC', desc: 'Pace — sprint speed and acceleration' },
  { key: 'shooting', label: 'SHO', desc: 'Shooting — shot power and accuracy' },
  { key: 'passing', label: 'PAS', desc: 'Passing — pass accuracy and vision' },
  { key: 'dribbling', label: 'DRI', desc: 'Dribbling — close control and ball carrying' },
  { key: 'tackling', label: 'TAC', desc: 'Tackling — defensive ability and interceptions' },
  { key: 'strength', label: 'STR', desc: 'Strength — physical power and shielding' },
  { key: 'stamina', label: 'STA', desc: 'Stamina — endurance and fatigue resistance' },
  { key: 'aerial', label: 'AER', desc: 'Aerial — heading and jumping ability' },
  { key: 'positioning', label: 'POS', desc: 'Positioning — tactical awareness and movement' },
  { key: 'vision', label: 'VIS', desc: 'Vision — spatial awareness range and scanning frequency' },
];

const PERSONALITY_LABELS: { key: keyof PersonalityVector; label: string; desc: string }[] = [
  { key: 'directness', label: 'DIR', desc: 'Directness — tendency to play forward passes, shoot, and run forward' },
  { key: 'risk_appetite', label: 'RSK', desc: 'Risk appetite — willingness to attempt risky actions (dribbles, through balls)' },
  { key: 'composure', label: 'CMP', desc: 'Composure — decision consistency under pressure (reduces noise)' },
  { key: 'creativity', label: 'CRE', desc: 'Creativity — tendency to attempt creative forward passes' },
  { key: 'work_rate', label: 'WRK', desc: 'Work rate — pressing intensity and positional discipline (increases fatigue)' },
  { key: 'aggression', label: 'AGG', desc: 'Aggression — pressing urgency and physical challenge tendency' },
  { key: 'anticipation', label: 'ANT', desc: 'Anticipation — positional awareness and pressing intelligence' },
  { key: 'flair', label: 'FLR', desc: 'Flair — tendency to dribble and make forward runs' },
];

function attrColor(v: number): string {
  if (v >= 0.80) return '#22c55e';
  if (v >= 0.65) return '#eab308';
  if (v >= 0.50) return '#f97316';
  return '#ef4444';
}

function personalityColor(v: number): string {
  // Personality is more neutral — extreme values aren't necessarily good/bad
  if (v >= 0.75) return '#60a5fa'; // bright blue
  if (v >= 0.50) return '#818cf8'; // indigo
  if (v >= 0.25) return '#a78bfa'; // purple
  return '#94a3b8'; // muted
}

function buildBarRows<T>(
  entries: { key: keyof T; label: string; desc: string }[],
  data: T,
  colorFn: (v: number) => string,
): string {
  return entries.map(({ key, label, desc }) => {
    const v = data[key] as number;
    const rating = Math.round(v * 100);
    const pct = Math.round(v * 100);
    const color = colorFn(v);
    return `<div class="squad-tooltip-row" title="${desc}">
      <span class="squad-tooltip-label">${label}</span>
      <span class="squad-tooltip-bar"><span style="width:${pct}%;background:${color}"></span></span>
      <span class="squad-tooltip-val">${rating}</span>
    </div>`;
  }).join('');
}

let tooltipEl: HTMLElement | null = null;
let hideTimer = 0;

function getTooltip(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'squad-tooltip';
    document.body.appendChild(tooltipEl);
    tooltipEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tooltipEl.addEventListener('mouseleave', () => {
      tooltipEl!.style.display = 'none';
    });
  }
  return tooltipEl;
}

export interface TooltipData {
  attributes: PlayerAttributes;
  personality?: PersonalityVector;
  fatigue?: number;
}

export function showAttributeTooltip(
  name: string,
  data: TooltipData,
  anchorEl: HTMLElement,
): void {
  const tip = getTooltip();
  clearTimeout(hideTimer);

  let html = `<div class="squad-tooltip-name">${name}</div>`;
  html += `<div class="squad-tooltip-section">Attributes</div>`;
  html += buildBarRows(ATTR_LABELS, data.attributes, attrColor);

  if (data.personality) {
    html += `<div class="squad-tooltip-section">Personality</div>`;
    html += buildBarRows(PERSONALITY_LABELS, data.personality, personalityColor);
  }

  if (data.fatigue !== undefined && data.fatigue > 0) {
    const pct = Math.round(data.fatigue * 100);
    const color = data.fatigue >= 0.6 ? '#ef4444' : data.fatigue >= 0.3 ? '#f97316' : '#eab308';
    html += `<div class="squad-tooltip-section">Condition</div>`;
    html += `<div class="squad-tooltip-row" title="Fatigue — reduces physical attributes and erodes personality toward conservative play">
      <span class="squad-tooltip-label">FTG</span>
      <span class="squad-tooltip-bar"><span style="width:${pct}%;background:${color}"></span></span>
      <span class="squad-tooltip-val">${pct}</span>
    </div>`;
  }

  tip.innerHTML = html;
  tip.style.display = 'block';

  // Position to the left of the anchor row
  const rect = anchorEl.getBoundingClientRect();
  const tipW = 180;
  let left = rect.left - tipW - 8;
  if (left < 4) left = rect.right + 8;
  // Re-measure after content set
  const tipH = tip.offsetHeight;
  const top = Math.min(rect.top, window.innerHeight - tipH - 8);
  tip.style.left = left + 'px';
  tip.style.top = Math.max(4, top) + 'px';
}

export function scheduleHideTooltip(): void {
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }, 300);
}
