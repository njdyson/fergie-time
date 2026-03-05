import type { TacticsPhase } from '../../simulation/types.ts';

/**
 * Phase tab bar — 2 tabs for switching tactical editing phase.
 * In Poss / Out of Poss control formation anchors, team controls, and player instructions.
 * Optional status text shows transition state when pausing mid-transition.
 */
export class PhaseBar {
  private readonly el: HTMLElement;
  private readonly tabs: HTMLButtonElement[] = [];
  private readonly statusEl: HTMLElement;
  private currentPhase: TacticsPhase = 'inPossession';
  private onChange: ((phase: TacticsPhase) => void) | null = null;

  private static readonly PHASES: { id: TacticsPhase; label: string; tooltip: string }[] = [
    { id: 'inPossession', label: 'In Possession', tooltip: 'Tactics when your team has the ball.' },
    { id: 'outOfPossession', label: 'Out of Possession', tooltip: 'Tactics when the opponent has the ball.' },
  ];

  constructor(container: HTMLElement) {
    this.el = container;
    for (const phase of PhaseBar.PHASES) {
      const btn = document.createElement('button');
      btn.className = 'phase-tab';
      btn.textContent = phase.label;
      btn.title = phase.tooltip;
      btn.dataset.phase = phase.id;
      if (phase.id === this.currentPhase) btn.classList.add('active');
      btn.addEventListener('click', () => this.setPhase(phase.id));
      this.el.appendChild(btn);
      this.tabs.push(btn);
    }

    // Status text element (shown below tabs for transition indicators)
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'phase-status';
    this.el.appendChild(this.statusEl);
  }

  setPhase(phase: TacticsPhase): void {
    this.currentPhase = phase;
    for (const tab of this.tabs) {
      tab.classList.toggle('active', tab.dataset.phase === phase);
    }
    this.onChange?.(phase);
  }

  /** Update the active tab without firing onChange (used for initial sync on pause). */
  setSilent(phase: TacticsPhase): void {
    this.currentPhase = phase;
    for (const tab of this.tabs) {
      tab.classList.toggle('active', tab.dataset.phase === phase);
    }
  }

  /** Show a status text below the tabs (e.g. "Defensive Transition Active") */
  setStatusText(text: string): void {
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle('visible', text.length > 0);
  }

  getPhase(): TacticsPhase { return this.currentPhase; }

  onPhaseChange(cb: (phase: TacticsPhase) => void): void {
    this.onChange = cb;
  }

  show(): void { this.el.classList.add('open'); }
  hide(): void { this.el.classList.remove('open'); }
}
