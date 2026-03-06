/**
 * Squad Screen — pre-match squad management view.
 * Shows all 25 players with attributes (NO personality), selection toggles,
 * editable shirt numbers, and inline validation. This is a standalone screen.
 */

import type { PlayerState } from '../../simulation/types.ts';
import { validateSquadSelection } from '../../season/season.ts';
import type { SquadSelection } from '../../season/season.ts';

// Re-export for consumer convenience
export type { SquadSelection } from '../../season/season.ts';

// Color palette (dark theme)
const BG = '#111111';
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const ACCENT_ORANGE = '#fb923c';
const GREEN = '#4ade80';
const RED = '#f87171';

// Selection states
type SelectionState = 'starter' | 'bench' | 'not-selected';

const BADGE_COLORS: Record<SelectionState, string> = {
  'starter': GREEN,
  'bench': ACCENT_BLUE,
  'not-selected': '#475569',
};

const BADGE_LABELS: Record<SelectionState, string> = {
  'starter': 'XI',
  'bench': 'SUB',
  'not-selected': 'OUT',
};

// Role sort order for default selection
const ROLE_ORDER: Record<string, number> = {
  GK: 0, CB: 1, LB: 2, RB: 3, CDM: 4, CM: 5, CAM: 6, LW: 7, RW: 8, ST: 9,
};

function getRoleOrder(role: string): number {
  return ROLE_ORDER[role] ?? 5;
}

// Attribute names for display
const ATTR_NAMES: Array<keyof PlayerState['attributes']> = [
  'pace', 'strength', 'stamina', 'dribbling', 'passing',
  'shooting', 'tackling', 'aerial', 'positioning', 'vision',
];

const ATTR_SHORT: Record<string, string> = {
  pace: 'PAC', strength: 'STR', stamina: 'STA', dribbling: 'DRI', passing: 'PAS',
  shooting: 'SHO', tackling: 'TAC', aerial: 'AER', positioning: 'POS', vision: 'VIS',
};

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

export class SquadScreen {
  private container: HTMLElement;
  private players: PlayerState[] = [];
  private fatigueMap: Map<string, number> = new Map();
  private selections: Map<string, SelectionState> = new Map();
  private shirtNumbers: Map<string, number> = new Map();
  private changeCallbacks: Array<(selection: SquadSelection) => void> = [];
  private shirtNumberChangeCallbacks: Array<(players: PlayerState[]) => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.backgroundColor = BG;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.padding = '16px';
    this.container.style.boxSizing = 'border-box';
    this.container.style.overflowY = 'auto';
    this.container.style.height = '100%';
  }

  /**
   * Set players and reset selection to defaults.
   * Default: first 11 sorted by role are starters, next 7 are bench, rest not-selected.
   * GK sorted to top.
   */
  setPlayers(players: PlayerState[], fatigueMap: Map<string, number>): void {
    this.players = [...players].sort((a, b) => getRoleOrder(a.role) - getRoleOrder(b.role));
    this.fatigueMap = fatigueMap;
    this.selections.clear();
    this.shirtNumbers.clear();

    // Default selection: first 11 starters, next 7 bench, rest not-selected
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!;
      if (i < 11) {
        this.selections.set(p.id, 'starter');
      } else if (i < 18) {
        this.selections.set(p.id, 'bench');
      } else {
        this.selections.set(p.id, 'not-selected');
      }
      // Initialize shirt numbers from player data
      if (p.shirtNumber != null) {
        this.shirtNumbers.set(p.id, p.shirtNumber);
      }
    }

    this.render();
  }

  /** Alias for setPlayers — updates display with new player data. */
  update(players: PlayerState[], fatigueMap: Map<string, number>): void {
    this.setPlayers(players, fatigueMap);
  }

  /** Get current squad selection based on toggle states. */
  getSelection(): SquadSelection {
    const starters: PlayerState[] = [];
    const bench: PlayerState[] = [];
    for (const p of this.players) {
      const state = this.selections.get(p.id) ?? 'not-selected';
      if (state === 'starter') starters.push(p);
      else if (state === 'bench') bench.push(p);
    }
    return { starters, bench };
  }

  /** Return the current players array with any shirt number edits applied. */
  getUpdatedPlayers(): PlayerState[] {
    return this.players.map(p => {
      const num = this.shirtNumbers.get(p.id);
      if (num != null && num !== p.shirtNumber) {
        return { ...p, shirtNumber: num };
      }
      return p;
    });
  }

  /** Register a callback fired after every toggle change. */
  onSelectionChange(cb: (selection: SquadSelection) => void): void {
    this.changeCallbacks.push(cb);
  }

  /** Register a callback fired after a shirt number is edited. */
  onShirtNumberChange(cb: (players: PlayerState[]) => void): void {
    this.shirtNumberChangeCallbacks.push(cb);
  }

  private cycleSelection(playerId: string): void {
    const current = this.selections.get(playerId) ?? 'not-selected';
    const next: SelectionState =
      current === 'starter' ? 'bench' :
      current === 'bench' ? 'not-selected' :
      'starter';
    this.selections.set(playerId, next);
    this.render();

    const selection = this.getSelection();
    for (const cb of this.changeCallbacks) {
      cb(selection);
    }
  }

  private startShirtNumberEdit(playerId: string, cellEl: HTMLElement): void {
    const currentNum = this.shirtNumbers.get(playerId) ?? 0;
    cellEl.innerHTML = '';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '99';
    input.value = String(currentNum);
    input.style.cssText = `width: 36px; font: 12px 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: ${TEXT_BRIGHT}; border: 1px solid ${ACCENT_BLUE}; border-radius: 2px; text-align: right; padding: 1px 2px; outline: none;`;

    const finishEdit = (save: boolean): void => {
      if (save) {
        const newNum = parseInt(input.value, 10);
        if (isNaN(newNum) || newNum < 1 || newNum > 99) {
          // Invalid range — flash red and revert
          input.style.borderColor = RED;
          setTimeout(() => this.render(), 400);
          return;
        }
        // Check uniqueness — no other player in team should have this number
        for (const [id, num] of this.shirtNumbers) {
          if (id !== playerId && num === newNum) {
            // Duplicate — flash red and revert
            input.style.borderColor = RED;
            setTimeout(() => this.render(), 400);
            return;
          }
        }
        // Valid and unique — apply
        this.shirtNumbers.set(playerId, newNum);
        // Update the player object in the array
        const idx = this.players.findIndex(p => p.id === playerId);
        if (idx >= 0) {
          this.players[idx] = { ...this.players[idx]!, shirtNumber: newNum };
        }
        // Notify listeners
        for (const cb of this.shirtNumberChangeCallbacks) {
          cb(this.getUpdatedPlayers());
        }
      }
      this.render();
    };

    input.addEventListener('blur', () => finishEdit(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishEdit(false);
      }
    });

    cellEl.appendChild(input);
    input.focus();
    input.select();
  }

  private render(): void {
    const selection = this.getSelection();
    const validation = validateSquadSelection(selection);

    let html = '<div style="max-width: 900px; margin: 0 auto;">';
    html += `<h2 style="color: ${TEXT_BRIGHT}; font-size: 22px; margin: 0 0 12px 0;">Squad</h2>`;

    // Validation warning
    if (!validation.valid) {
      html += `<div style="background: #7f1d1d; color: ${RED}; border: 1px solid ${RED}; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px;">`;
      html += `${validation.reason}`;
      html += `</div>`;
    }

    // Selection summary
    const starterCount = [...this.selections.values()].filter(s => s === 'starter').length;
    const benchCount = [...this.selections.values()].filter(s => s === 'bench').length;
    html += `<div style="color: ${TEXT}; font-size: 13px; margin-bottom: 12px;">`;
    html += `<span style="color: ${GREEN};">Starters: ${starterCount}/11</span>`;
    html += `<span style="margin: 0 12px;">|</span>`;
    html += `<span style="color: ${ACCENT_BLUE};">Bench: ${benchCount}/7</span>`;
    html += `</div>`;

    // Attribute header row
    html += `<div style="display: grid; grid-template-columns: 44px 36px 140px 48px 40px 48px ${ATTR_NAMES.map(() => '32px').join(' ')} 48px; gap: 2px; padding: 4px 8px; font-size: 10px; color: ${TEXT}; border-bottom: 1px solid #334155; align-items: center;">`;
    html += '<span></span>'; // badge
    html += '<span>#</span>';
    html += '<span>Name</span>';
    html += '<span>Pos</span>';
    html += '<span>Age</span>';
    html += '<span>Ht</span>';
    for (const attr of ATTR_NAMES) {
      html += `<span style="text-align: center;" title="${attr}">${ATTR_SHORT[attr]}</span>`;
    }
    html += '<span style="text-align: center;">FIT</span>';
    html += '</div>';

    // Player rows
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!;
      const selState = this.selections.get(p.id) ?? 'not-selected';
      const badgeColor = BADGE_COLORS[selState];
      const badgeLabel = BADGE_LABELS[selState];
      const fatigue = this.fatigueMap.get(p.id) ?? p.fatigue ?? 0;
      const fitness = 1 - fatigue; // 100% = fresh, 0% = exhausted
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const shirtNum = this.shirtNumbers.get(p.id) ?? p.shirtNumber ?? '';

      html += `<div data-player-id="${p.id}" style="display: grid; grid-template-columns: 44px 36px 140px 48px 40px 48px ${ATTR_NAMES.map(() => '32px').join(' ')} 48px; gap: 2px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center; cursor: pointer;" class="squad-row">`;

      // Selection badge (clickable)
      html += `<span data-toggle="${p.id}" style="display: inline-block; background: ${badgeColor}; color: #000; font-weight: bold; font-size: 10px; padding: 2px 6px; border-radius: 3px; text-align: center; cursor: pointer; user-select: none;">${badgeLabel}</span>`;

      // Shirt number (click-to-edit)
      html += `<span data-shirt="${p.id}" style="color: ${TEXT}; text-align: right; cursor: pointer; user-select: none; font-size: 11px; font-family: monospace;" title="Click to edit shirt number">${shirtNum}</span>`;

      // Name
      html += `<span style="color: ${TEXT_BRIGHT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name ?? 'Unknown'}</span>`;

      // Position
      html += `<span style="color: ${ACCENT_ORANGE}; font-weight: bold;">${p.role}</span>`;

      // Age
      html += `<span style="color: ${TEXT};">${p.age ?? '-'}</span>`;

      // Height
      html += `<span style="color: ${TEXT};">${p.height ? `${p.height}cm` : '-'}</span>`;

      // 10 attribute mini-bars
      for (const attr of ATTR_NAMES) {
        const val = p.attributes[attr];
        const pct = Math.round(val * 100);
        const barColor = getAttrBarColor(val);
        html += `<span style="text-align: center;" title="${attr}: ${pct}%">`;
        html += `<div style="width: 24px; height: 6px; background: #334155; border-radius: 2px; margin: 0 auto;">`;
        html += `<div style="width: ${pct}%; height: 100%; background: ${barColor}; border-radius: 2px;"></div>`;
        html += `</div>`;
        html += `</span>`;
      }

      // Fitness bar (inverted fatigue)
      const fitPct = Math.round(fitness * 100);
      const fitColor = getFitnessColor(fitness);
      html += `<span style="text-align: center;" title="Fitness: ${fitPct}%">`;
      html += `<div style="width: 30px; height: 6px; background: #334155; border-radius: 2px; margin: 0 auto;">`;
      html += `<div style="width: ${fitPct}%; height: 100%; background: ${fitColor}; border-radius: 2px;"></div>`;
      html += `</div>`;
      html += `</span>`;

      html += '</div>';
    }

    html += '</div>';
    this.container.innerHTML = html;

    // Attach click handlers for toggle badges
    const toggles = this.container.querySelectorAll('[data-toggle]');
    for (const toggle of toggles) {
      const playerId = (toggle as HTMLElement).dataset.toggle!;
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cycleSelection(playerId);
      });
    }

    // Attach click handlers for shirt number editing
    const shirtCells = this.container.querySelectorAll('[data-shirt]');
    for (const cell of shirtCells) {
      const playerId = (cell as HTMLElement).dataset.shirt!;
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startShirtNumberEdit(playerId, cell as HTMLElement);
      });
    }

    // Also allow clicking the entire row to toggle
    const rows = this.container.querySelectorAll('.squad-row');
    for (const row of rows) {
      const playerId = (row as HTMLElement).dataset.playerId!;
      row.addEventListener('click', () => {
        this.cycleSelection(playerId);
      });
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
