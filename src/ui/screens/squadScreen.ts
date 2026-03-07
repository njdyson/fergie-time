/**
 * Squad Screen — pre-match squad management view.
 * Shows all 25 players with attributes (NO personality), selection toggles,
 * editable shirt numbers, and inline validation. This is a standalone screen.
 */

import type { PlayerState } from '../../simulation/types.ts';
import { validateSquadSelection } from '../../season/season.ts';
import type { SquadSelection, SquadSlot } from '../../season/season.ts';
import type { PlayerSeasonStats } from '../../season/playerStats.ts';

// Re-export for consumer convenience
export type { SquadSelection } from '../../season/season.ts';

// Color palette (dark theme)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const ACCENT_ORANGE = '#fb923c';
const GREEN = '#4ade80';
const RED = '#f87171';

// Selection states — a role string (starter), 'bench', or 'not-selected'
type SelectionState = string; // role name like 'GK', 'CB', etc. OR 'bench' OR 'not-selected'

function isStarterRole(state: SelectionState): boolean {
  return state !== 'bench' && state !== 'not-selected';
}

function getBadgeColor(state: SelectionState): string {
  if (isStarterRole(state)) return GREEN;
  if (state === 'bench') return ACCENT_BLUE;
  return '#475569';
}

function getBadgeLabel(state: SelectionState): string {
  if (isStarterRole(state)) return state; // show role abbreviation
  if (state === 'bench') return 'SUB';
  return 'OUT';
}

// Role sort order for default selection
const ROLE_ORDER: Record<string, number> = {
  GK: 0, CB: 1, LB: 2, RB: 3, CDM: 4, CM: 5, CAM: 6, LW: 7, RW: 8, ST: 9,
};

function getRoleOrder(role: string): number {
  return ROLE_ORDER[role] ?? 5;
}

// ISO 2-letter → 3-letter abbreviation + full name for tooltip
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
  private playerSeasonStats: Map<string, PlayerSeasonStats> = new Map();
  private selections: Map<string, SelectionState> = new Map();
  private slotIndices: Map<string, number> = new Map(); // playerId → formation slot index (0-10)
  private shirtNumbers: Map<string, number> = new Map();
  private changeCallbacks: Array<(selection: SquadSelection) => void> = [];
  private shirtNumberChangeCallbacks: Array<(players: PlayerState[]) => void> = [];
  private formationRoles: string[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'ST', 'ST']; // default 4-4-2
  private formationRolesOOP: string[] = []; // out-of-possession roles (empty = same as in-poss)
  private sortColumn: string = 'default';
  private sortAscending: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.padding = '16px';
    this.container.style.boxSizing = 'border-box';
    this.container.style.overflowY = 'auto';
    this.container.style.height = '100%';
  }

  /** Update the formation roles used by the role picker (in-possession). */
  setFormationRoles(roles: string[], oopRoles?: string[]): void {
    this.formationRoles = roles;
    this.formationRolesOOP = oopRoles ?? [];
  }

  /**
   * Set players and reset selection to defaults (or restore from saved selection).
   * Default: first 11 sorted by role are starters, next 7 are bench, rest not-selected.
   * GK sorted to top.
   */
  setPlayers(players: PlayerState[], fatigueMap: Map<string, number>, savedSelection?: Map<string, SquadSlot>): void {
    this.players = [...players].sort((a, b) => getRoleOrder(a.role) - getRoleOrder(b.role));
    this.fatigueMap = fatigueMap;
    this.selections.clear();
    this.slotIndices.clear();
    this.shirtNumbers.clear();

    // Restore from saved selection if available
    if (savedSelection && savedSelection.size > 0) {
      for (const p of this.players) {
        const slot = savedSelection.get(p.id);
        if (slot) {
          this.selections.set(p.id, slot.state);
          if (slot.slotIndex != null) this.slotIndices.set(p.id, slot.slotIndex);
        } else {
          this.selections.set(p.id, 'not-selected');
        }
        if (p.shirtNumber != null) this.shirtNumbers.set(p.id, p.shirtNumber);
      }
      this.render();
      return;
    }

    // Default selection: assign formation roles to first 11, next 7 bench, rest not-selected
    // Build a pool of available role slots with their original indices
    const roleSlots = this.formationRoles.map((r, idx) => ({ role: r, idx }));
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!;
      if (i < 11 && roleSlots.length > 0) {
        // Find best matching role for this player's natural position
        const bestIdx = roleSlots.findIndex(r => r.role === p.role);
        const assignIdx = bestIdx >= 0 ? bestIdx : 0;
        const slot = roleSlots.splice(assignIdx, 1)[0]!;
        this.selections.set(p.id, slot.role);
        this.slotIndices.set(p.id, slot.idx);
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

  /** Update display with new player data, optionally restoring saved selection and season stats. */
  update(players: PlayerState[], fatigueMap: Map<string, number>, savedSelection?: Map<string, SquadSlot>, playerSeasonStats?: Map<string, PlayerSeasonStats>): void {
    if (playerSeasonStats !== undefined) {
      this.playerSeasonStats = playerSeasonStats;
    }
    this.setPlayers(players, fatigueMap, savedSelection);
  }

  /** Get the current selection map for persistence. */
  getSelectionMap(): Map<string, SquadSlot> {
    const map = new Map<string, SquadSlot>();
    for (const [playerId, state] of this.selections) {
      const slot: SquadSlot = { state };
      const idx = this.slotIndices.get(playerId);
      if (idx != null) slot.slotIndex = idx;
      map.set(playerId, slot);
    }
    return map;
  }

  /** Get current squad selection based on toggle states. */
  getSelection(): SquadSelection {
    const starters: PlayerState[] = [];
    const bench: PlayerState[] = [];
    for (const p of this.players) {
      const state = this.selections.get(p.id) ?? 'not-selected';
      if (isStarterRole(state)) starters.push(p);
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

  /** Get the badge label, showing combined roles (e.g. LB/LW) if OOP role differs. */
  private getCombinedBadgeLabel(playerId: string, state: SelectionState): string {
    if (!isStarterRole(state)) return getBadgeLabel(state);
    if (this.formationRolesOOP.length === 0) return state;
    const slotIdx = this.slotIndices.get(playerId);
    if (slotIdx == null) return state;
    const oopRole = this.formationRolesOOP[slotIdx];
    if (!oopRole || oopRole === state) return state;
    return `${state}/${oopRole}`;
  }

  /** Register a callback fired after every toggle change. */
  onSelectionChange(cb: (selection: SquadSelection) => void): void {
    this.changeCallbacks.push(cb);
  }

  /** Register a callback fired after a shirt number is edited. */
  onShirtNumberChange(cb: (players: PlayerState[]) => void): void {
    this.shirtNumberChangeCallbacks.push(cb);
  }

  private openRolePicker(playerId: string): void {
    // Close any existing picker
    document.querySelector('.role-picker-popup')?.remove();

    const currentState = this.selections.get(playerId) ?? 'not-selected';

    // Count which formation roles are already assigned
    const assignedRoles = new Map<string, string>(); // role → playerId
    for (const [pid, state] of this.selections) {
      if (isStarterRole(state)) {
        assignedRoles.set(`${state}-${pid}`, pid);
      }
    }

    // Count how many of each role are needed and filled
    const roleSlotCounts = new Map<string, { needed: number; filled: number }>();
    for (const role of this.formationRoles) {
      const entry = roleSlotCounts.get(role) ?? { needed: 0, filled: 0 };
      entry.needed++;
      roleSlotCounts.set(role, entry);
    }
    for (const [, state] of this.selections) {
      if (isStarterRole(state)) {
        const entry = roleSlotCounts.get(state);
        if (entry) entry.filled++;
      }
    }

    // If current player is a starter, their role slot is "available" for reassignment
    if (isStarterRole(currentState)) {
      const entry = roleSlotCounts.get(currentState);
      if (entry) entry.filled--;
    }

    const benchCount = [...this.selections.values()].filter(s => s === 'bench').length;
    const benchAvailable = currentState === 'bench' ? 7 : 7 - benchCount;

    // Build popup
    const popup = document.createElement('div');
    popup.className = 'role-picker-popup';
    popup.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000;';

    const panel = document.createElement('div');
    panel.style.cssText = `background: #1e293b; border-radius: 12px; padding: 20px; max-width: 320px; width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.5);`;

    const title = document.createElement('div');
    const player = this.players.find(p => p.id === playerId);
    title.textContent = player?.name ?? 'Assign Role';
    title.style.cssText = `color: ${TEXT_BRIGHT}; font: bold 14px/1 'Segoe UI',system-ui,sans-serif; margin-bottom: 16px; text-align: center;`;
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;';

    // Formation role buttons
    const uniqueRoles = [...new Set(this.formationRoles)];
    for (const role of uniqueRoles) {
      const entry = roleSlotCounts.get(role)!;
      const isCurrent = currentState === role;
      const slotsOpen = entry.needed - entry.filled;
      const available = isCurrent || slotsOpen > 0;

      const btn = document.createElement('button');
      btn.textContent = slotsOpen > 1 && !isCurrent ? `${role} (${slotsOpen})` : role;
      btn.style.cssText = `padding: 8px 14px; border-radius: 6px; border: 2px solid ${isCurrent ? GREEN : available ? GREEN : '#334155'}; background: ${isCurrent ? GREEN : available ? '#0f172a' : '#1a1a2e'}; color: ${isCurrent ? '#000' : available ? TEXT_BRIGHT : '#475569'}; font: bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor: ${available ? 'pointer' : 'not-allowed'};`;

      if (available) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selections.set(playerId, role);
          // Find an available slot index for this role
          const usedSlots = new Set(this.slotIndices.values());
          if (isStarterRole(currentState)) usedSlots.delete(this.slotIndices.get(playerId)!);
          const slotIdx = this.formationRoles.findIndex((r, i) => r === role && !usedSlots.has(i));
          if (slotIdx >= 0) this.slotIndices.set(playerId, slotIdx);
          popup.remove();
          this.render();
          for (const cb of this.changeCallbacks) cb(this.getSelection());
        });
      }
      grid.appendChild(btn);
    }

    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = 'width: 100%; height: 1px; background: #334155; margin: 6px 0;';
    grid.appendChild(sep);

    // SUB button
    const subBtn = document.createElement('button');
    subBtn.textContent = 'SUB';
    const subAvail = currentState === 'bench' || benchAvailable > 0;
    subBtn.style.cssText = `padding: 8px 14px; border-radius: 6px; border: 2px solid ${currentState === 'bench' ? ACCENT_BLUE : subAvail ? ACCENT_BLUE : '#334155'}; background: ${currentState === 'bench' ? ACCENT_BLUE : subAvail ? '#0f172a' : '#1a1a2e'}; color: ${currentState === 'bench' ? '#000' : subAvail ? TEXT_BRIGHT : '#475569'}; font: bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor: ${subAvail ? 'pointer' : 'not-allowed'};`;
    if (subAvail) {
      subBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selections.set(playerId, 'bench');
        this.slotIndices.delete(playerId);
        popup.remove();
        this.render();
        for (const cb of this.changeCallbacks) cb(this.getSelection());
      });
    }
    grid.appendChild(subBtn);

    // OUT button
    const outBtn = document.createElement('button');
    outBtn.textContent = 'OUT';
    const isCurrOut = currentState === 'not-selected';
    outBtn.style.cssText = `padding: 8px 14px; border-radius: 6px; border: 2px solid ${isCurrOut ? '#475569' : '#475569'}; background: ${isCurrOut ? '#475569' : '#0f172a'}; color: ${isCurrOut ? '#000' : TEXT_BRIGHT}; font: bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;`;
    outBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selections.set(playerId, 'not-selected');
      this.slotIndices.delete(playerId);
      popup.remove();
      this.render();
      for (const cb of this.changeCallbacks) cb(this.getSelection());
    });
    grid.appendChild(outBtn);

    panel.appendChild(grid);
    popup.appendChild(panel);

    popup.addEventListener('click', (e) => {
      if (e.target === popup) popup.remove();
    });

    document.body.appendChild(popup);
  }

  private startShirtNumberEdit(playerId: string, _cellEl: HTMLElement): void {
    // Close any existing picker
    this.container.querySelector('.shirt-picker-popup')?.remove();

    const currentNum = this.shirtNumbers.get(playerId) ?? 0;
    const usedNumbers = new Set<number>();
    for (const [id, num] of this.shirtNumbers) {
      if (id !== playerId) usedNumbers.add(num);
    }

    // Create popup overlay
    const popup = document.createElement('div');
    popup.className = 'shirt-picker-popup';
    popup.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000;`;

    const panel = document.createElement('div');
    panel.style.cssText = `background: #1e293b; border-radius: 12px; padding: 20px; max-width: 340px; width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.5);`;

    const title = document.createElement('div');
    title.textContent = 'Pick Shirt Number';
    title.style.cssText = `color: ${TEXT_BRIGHT}; font: bold 14px/1 'Segoe UI',system-ui,sans-serif; margin-bottom: 16px; text-align: center;`;
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px;';

    for (let n = 1; n <= 40; n++) {
      const btn = document.createElement('button');
      btn.textContent = String(n);
      const isUsed = usedNumbers.has(n);
      const isCurrent = n === currentNum;
      btn.style.cssText = `width: 34px; height: 34px; border-radius: 50%; border: 2px solid ${isCurrent ? GREEN : isUsed ? '#334155' : ACCENT_BLUE}; background: ${isCurrent ? GREEN : isUsed ? '#1a1a2e' : '#0f172a'}; color: ${isCurrent ? '#000' : isUsed ? '#475569' : TEXT_BRIGHT}; font: bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor: ${isUsed ? 'not-allowed' : 'pointer'}; transition: background .1s;`;

      if (!isUsed) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.shirtNumbers.set(playerId, n);
          const idx = this.players.findIndex(p => p.id === playerId);
          if (idx >= 0) {
            this.players[idx] = { ...this.players[idx]!, shirtNumber: n };
          }
          for (const cb of this.shirtNumberChangeCallbacks) {
            cb(this.getUpdatedPlayers());
          }
          popup.remove();
          this.render();
        });
      }
      grid.appendChild(btn);
    }

    panel.appendChild(grid);
    popup.appendChild(panel);

    // Close on backdrop click
    popup.addEventListener('click', (e) => {
      if (e.target === popup) popup.remove();
    });

    document.body.appendChild(popup);
  }

  /** Rate a player's suitability for a role (higher = better fit). */
  private rateForRole(p: PlayerState, role: string): number {
    const a = p.attributes;
    const fatigue = this.fatigueMap.get(p.id) ?? p.fatigue ?? 0;
    const fitness = 1 - fatigue;

    // Base: average of all attributes weighted by fitness
    let score = 0;
    switch (role) {
      case 'GK':  score = a.positioning * 2 + a.aerial * 1.5 + a.strength; break;
      case 'CB':  score = a.tackling * 2 + a.aerial * 1.5 + a.positioning + a.strength; break;
      case 'LB': case 'RB':
        score = a.tackling + a.pace * 1.5 + a.stamina + a.passing; break;
      case 'CDM': score = a.tackling * 1.5 + a.positioning * 1.5 + a.passing + a.stamina; break;
      case 'CM':  score = a.passing * 1.5 + a.stamina + a.vision + a.tackling; break;
      case 'CAM': score = a.vision * 1.5 + a.passing * 1.5 + a.dribbling + a.shooting; break;
      case 'LW': case 'RW':
        score = a.pace * 1.5 + a.dribbling * 1.5 + a.passing + a.shooting; break;
      case 'ST':  score = a.shooting * 2 + a.pace + a.dribbling + a.aerial; break;
      default:    score = a.passing + a.shooting + a.tackling + a.pace; break;
    }

    // Bonus for playing in natural position
    if (p.role === role) score += 2;

    return score * fitness;
  }

  /** Auto-assign best players to formation roles, next best to bench. */
  private autoPick(): void {
    this.selections.clear();
    this.slotIndices.clear();

    // Build slots to fill from formation
    const slots = this.formationRoles.map((role, idx) => ({ role, idx }));
    const assigned = new Set<string>();

    // Greedily assign best-fit player to each slot
    for (const slot of slots) {
      let bestPlayer: PlayerState | null = null;
      let bestScore = -1;
      for (const p of this.players) {
        if (assigned.has(p.id)) continue;
        const score = this.rateForRole(p, slot.role);
        if (score > bestScore) {
          bestScore = score;
          bestPlayer = p;
        }
      }
      if (bestPlayer) {
        assigned.add(bestPlayer.id);
        this.selections.set(bestPlayer.id, slot.role);
        this.slotIndices.set(bestPlayer.id, slot.idx);
      }
    }

    // Pick 7 best remaining for bench (by overall attribute average * fitness)
    const remaining = this.players.filter(p => !assigned.has(p.id));
    remaining.sort((a, b) => {
      const avgA = Object.values(a.attributes).reduce((s, v) => s + v, 0) / 10;
      const avgB = Object.values(b.attributes).reduce((s, v) => s + v, 0) / 10;
      const fitA = 1 - (this.fatigueMap.get(a.id) ?? a.fatigue ?? 0);
      const fitB = 1 - (this.fatigueMap.get(b.id) ?? b.fatigue ?? 0);
      return (avgB * fitB) - (avgA * fitA);
    });

    for (let i = 0; i < remaining.length; i++) {
      this.selections.set(remaining[i]!.id, i < 7 ? 'bench' : 'not-selected');
    }
  }

  private getSortedPlayers(): PlayerState[] {
    const col = this.sortColumn;
    if (col === 'default') return this.players;

    const sorted = [...this.players];
    const dir = this.sortAscending ? 1 : -1;

    sorted.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;

      if (col === 'name') {
        va = a.name ?? ''; vb = b.name ?? '';
        return dir * (va as string).localeCompare(vb as string);
      } else if (col === 'pos') {
        va = getRoleOrder(a.role); vb = getRoleOrder(b.role);
      } else if (col === 'age') {
        va = a.age ?? 0; vb = b.age ?? 0;
      } else if (col === 'fit') {
        va = 1 - (this.fatigueMap.get(a.id) ?? a.fatigue ?? 0);
        vb = 1 - (this.fatigueMap.get(b.id) ?? b.fatigue ?? 0);
      } else if (col === '#') {
        va = this.shirtNumbers.get(a.id) ?? a.shirtNumber ?? 99;
        vb = this.shirtNumbers.get(b.id) ?? b.shirtNumber ?? 99;
      } else if (col in a.attributes) {
        va = a.attributes[col as keyof PlayerState['attributes']];
        vb = b.attributes[col as keyof PlayerState['attributes']];
      }
      return dir * ((va as number) - (vb as number));
    });

    return sorted;
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

    // Selection summary + Clear All button
    const starterCount = [...this.selections.values()].filter(s => isStarterRole(s)).length;
    const benchCount = [...this.selections.values()].filter(s => s === 'bench').length;
    html += `<div style="color: ${TEXT}; font-size: 13px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px;">`;
    html += `<span style="color: ${GREEN};">Starters: ${starterCount}/11</span>`;
    html += `<span>|</span>`;
    html += `<span style="color: ${ACCENT_BLUE};">Bench: ${benchCount}/7</span>`;
    html += `<span style="flex: 1;"></span>`;
    html += `<button data-auto-pick style="padding: 4px 12px; border-radius: 4px; border: 1px solid ${GREEN}; background: #0f172a; color: ${GREEN}; font-size: 11px; cursor: pointer;">Assistant Picks</button>`;
    html += `<button data-clear-all style="padding: 4px 12px; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: ${TEXT_BRIGHT}; font-size: 11px; cursor: pointer;">Clear All</button>`;
    html += `</div>`;

    // Grid column template (badge, #, name, pos, nat, age, ht, 10 attrs, fit, G, A, App)
    const gridCols = `56px 36px 140px 48px 36px 40px 48px ${ATTR_NAMES.map(() => '32px').join(' ')} 48px 28px 28px 32px`;

    // Sortable header helper
    const sortArrow = (col: string) => this.sortColumn === col ? (this.sortAscending ? ' ▲' : ' ▼') : '';
    const hdrStyle = `cursor: pointer; user-select: none;`;

    // Attribute header row
    html += `<div style="display: grid; grid-template-columns: ${gridCols}; gap: 2px; padding: 4px 8px; font-size: 10px; color: ${TEXT}; border-bottom: 1px solid #334155; align-items: center;">`;
    html += '<span></span>'; // badge
    html += `<span data-sort="#" style="${hdrStyle}">#${sortArrow('#')}</span>`;
    html += `<span data-sort="name" style="${hdrStyle}">Name${sortArrow('name')}</span>`;
    html += `<span data-sort="pos" style="${hdrStyle}">Pos${sortArrow('pos')}</span>`;
    html += '<span>Nat</span>';
    html += `<span data-sort="age" style="${hdrStyle}">Age${sortArrow('age')}</span>`;
    html += '<span>Ht</span>';
    for (const attr of ATTR_NAMES) {
      html += `<span data-sort="${attr}" style="text-align: center; ${hdrStyle}" title="${attr}">${ATTR_SHORT[attr]}${sortArrow(attr)}</span>`;
    }
    html += `<span data-sort="fit" style="text-align: center; ${hdrStyle}">FIT${sortArrow('fit')}</span>`;
    html += `<span style="text-align: center; color: #4ade80; font-weight: bold;" title="Goals this season">G</span>`;
    html += `<span style="text-align: center; color: #60a5fa; font-weight: bold;" title="Assists this season">A</span>`;
    html += `<span style="text-align: center;" title="Appearances this season">App</span>`;
    html += '</div>';

    // Player rows
    const sortedPlayers = this.getSortedPlayers();
    for (let i = 0; i < sortedPlayers.length; i++) {
      const p = sortedPlayers[i]!;
      const selState = this.selections.get(p.id) ?? 'not-selected';
      const badgeColor = getBadgeColor(selState);
      const badgeLabel = this.getCombinedBadgeLabel(p.id, selState);
      const fatigue = this.fatigueMap.get(p.id) ?? p.fatigue ?? 0;
      const fitness = 1 - fatigue; // 100% = fresh, 0% = exhausted
      const rowBg = i % 2 === 0 ? PANEL_BG : '#151f2e';
      const shirtNum = this.shirtNumbers.get(p.id) ?? p.shirtNumber ?? '';

      html += `<div data-player-id="${p.id}" style="display: grid; grid-template-columns: ${gridCols}; gap: 2px; padding: 6px 8px; font-size: 12px; background: ${rowBg}; border-radius: 2px; align-items: center; cursor: pointer;" class="squad-row">`;

      // Selection badge (clickable)
      html += `<span data-toggle="${p.id}" style="display: inline-block; background: ${badgeColor}; color: #000; font-weight: bold; font-size: 10px; padding: 2px 6px; border-radius: 3px; text-align: center; cursor: pointer; user-select: none;">${badgeLabel}</span>`;

      // Shirt number circle (click to pick)
      html += `<span data-shirt="${p.id}" style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid ${ACCENT_BLUE}; background: #0f172a; color: ${TEXT_BRIGHT}; font: bold 11px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer; user-select: none; margin: 0 auto;" title="Click to change shirt number">${shirtNum}</span>`;

      // Name
      html += `<span style="color: ${TEXT_BRIGHT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name ?? 'Unknown'}</span>`;

      // Position
      html += `<span style="color: ${ACCENT_ORANGE}; font-weight: bold;">${p.role}</span>`;

      // Nationality
      const nat = getNat(p.nationality);
      html += `<span style="color: ${TEXT}; font-size: 10px;" title="${nat.name}">${nat.abbr}</span>`;

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

      // Season stats: Goals, Assists, Appearances
      const pStat = this.playerSeasonStats.get(p.id);
      const goals = pStat?.goals ?? null;
      const assists = pStat?.assists ?? null;
      const apps = pStat?.appearances ?? null;
      html += `<span style="text-align: center; color: ${goals ? '#4ade80' : TEXT}; font-weight: ${goals ? 'bold' : 'normal'}; font-size: 11px;">${goals !== null ? goals : '-'}</span>`;
      html += `<span style="text-align: center; color: ${assists ? '#60a5fa' : TEXT}; font-size: 11px;">${assists !== null ? assists : '-'}</span>`;
      html += `<span style="text-align: center; color: ${TEXT}; font-size: 11px;">${apps !== null ? apps : '-'}</span>`;

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
        this.openRolePicker(playerId);
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
        this.openRolePicker(playerId);
      });
    }

    // Sort header click handlers
    const sortHeaders = this.container.querySelectorAll('[data-sort]');
    for (const hdr of sortHeaders) {
      const col = (hdr as HTMLElement).dataset.sort!;
      hdr.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.sortColumn === col) {
          this.sortAscending = !this.sortAscending;
        } else {
          this.sortColumn = col;
          this.sortAscending = col === 'name' || col === '#' || col === 'pos'; // alpha/number default asc, stats default desc
        }
        this.render();
      });
    }

    // Auto Pick button handler
    const autoBtn = this.container.querySelector('[data-auto-pick]');
    if (autoBtn) {
      autoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.autoPick();
        this.render();
        for (const cb of this.changeCallbacks) cb(this.getSelection());
      });
    }

    // Clear All button handler
    const clearBtn = this.container.querySelector('[data-clear-all]');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const p of this.players) {
          this.selections.set(p.id, 'not-selected');
          this.slotIndices.delete(p.id);
        }
        this.render();
        for (const cb of this.changeCallbacks) cb(this.getSelection());
      });
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
