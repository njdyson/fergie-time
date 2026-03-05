import type { Duty, PlayerAttributes, PersonalityVector } from '../../simulation/types.ts';
import { showAttributeTooltip, scheduleHideTooltip } from '../tooltip.ts';

export interface SquadEntry {
  name: string;
  role: string;
  number: number;
  duty: Duty;
  attributes?: PlayerAttributes;
  personality?: PersonalityVector;
  fatigue?: number;
}

const DUTY_COLORS: Record<Duty, string> = {
  DEFEND: '#3b82f6',
  SUPPORT: '#64748b',
  ATTACK: '#fb923c',
};

/**
 * Squad list panel — shows the starting XI as clickable rows.
 * Lives inside #squad-view in the right panel.
 */
export class SquadPanel {
  private readonly el: HTMLElement;
  private readonly listEl: HTMLElement;
  private selectedIndex: number = -1;
  private onSelectCb: ((index: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.el = container;
    this.listEl = document.createElement('div');
    this.listEl.className = 'squad-list';
    // Insert list at the top (bench panel sits below in the same container)
    this.el.insertBefore(this.listEl, this.el.firstChild);
  }

  update(players: SquadEntry[]): void {
    this.listEl.innerHTML = '';

    const heading = document.createElement('h4');
    heading.textContent = 'Squad';
    this.listEl.appendChild(heading);

    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      const row = document.createElement('div');
      row.className = 'squad-row' + (i === this.selectedIndex ? ' selected' : '');
      row.dataset.index = String(i);

      const num = document.createElement('span');
      num.className = 'squad-row-number';
      num.textContent = String(p.number);

      const name = document.createElement('span');
      name.className = 'squad-row-name';
      name.textContent = p.name;

      const role = document.createElement('span');
      role.className = 'squad-row-role';
      role.textContent = p.role;

      const duty = document.createElement('span');
      duty.className = 'squad-row-duty';
      duty.textContent = p.duty.charAt(0);
      duty.style.background = DUTY_COLORS[p.duty];
      duty.title = p.duty;

      row.appendChild(num);
      row.appendChild(name);
      row.appendChild(role);
      row.appendChild(duty);

      row.addEventListener('click', () => {
        this.onSelectCb?.(i);
      });

      // Attribute tooltip on hover
      if (p.attributes) {
        const tooltipData: import('../tooltip.ts').TooltipData = { attributes: p.attributes };
        if (p.personality) tooltipData.personality = p.personality;
        if (p.fatigue !== undefined) tooltipData.fatigue = p.fatigue;
        const pName = p.name;
        row.addEventListener('mouseenter', () => {
          showAttributeTooltip(pName, tooltipData, row);
        });
        row.addEventListener('mouseleave', () => {
          scheduleHideTooltip();
        });
      }

      this.listEl.appendChild(row);
    }
  }

  setSelected(index: number): void {
    this.selectedIndex = index;
    const rows = this.listEl.querySelectorAll('.squad-row');
    rows.forEach((row, i) => {
      row.classList.toggle('selected', i === index);
    });
  }

  /** Highlight the row for the player currently in possession (-1 to clear) */
  setHighlight(index: number): void {
    const rows = this.listEl.querySelectorAll('.squad-row');
    rows.forEach((row, i) => {
      row.classList.toggle('has-ball', i === index);
    });
  }

  onPlayerSelected(cb: (index: number) => void): void {
    this.onSelectCb = cb;
  }

  show(): void { this.el.style.display = ''; }
  hide(): void { this.el.style.display = 'none'; }
}
