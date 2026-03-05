import type { PlayerTacticalMultipliers, Duty, TacticsPhase } from '../../simulation/types.ts';
import { defaultMultipliers } from '../../simulation/types.ts';

/** Role preset: sets multipliers + optional anchor offset hint */
interface RolePreset {
  label: string;
  multipliers: Partial<PlayerTacticalMultipliers>;
  tooltip: string;
}

const ROLE_PRESETS: RolePreset[] = [
  {
    label: 'Stay Wide',
    multipliers: { directness: 0.75, dribble: 0.25, risk: 0.25, freedom: 0.15 },
    tooltip: 'Hug the touchline, cross early, avoid dribbling inside.',
  },
  {
    label: 'Invert',
    multipliers: { dribble: 0.85, risk: 0.75, directness: 0.6, freedom: 0.75 },
    tooltip: 'Cut inside with the ball, take creative risks.',
  },
  {
    label: 'Make Runs',
    multipliers: { directness: 0.9, risk: 0.8, decisionWindow: 0.7, freedom: 0.85 },
    tooltip: 'Push forward into space, play direct and quick.',
  },
  {
    label: 'Hold Position',
    multipliers: { risk: 0.15, directness: 0.2, decisionWindow: 0.3, freedom: 0.0 },
    tooltip: 'Stay disciplined, play safe, recycle possession.',
  },
];

interface MultiplierDef {
  key: keyof PlayerTacticalMultipliers;
  label: string;
  low: string;
  high: string;
  tooltip: string;
  /** Which phases this multiplier is relevant to */
  phases: TacticsPhase[];
}

const MULTIPLIER_DEFS: MultiplierDef[] = [
  { key: 'risk', label: 'Risk', low: 'Safe', high: 'Ambitious',
    tooltip: 'Risk tolerance. Safe = simple passes and shots. Ambitious = creative through-balls and long-range efforts.',
    phases: ['inPossession', 'outOfPossession', 'defensiveTransition', 'attackingTransition'] },
  { key: 'directness', label: 'Directness', low: 'Recycle', high: 'Progress',
    tooltip: 'Ball progression preference. Recycle = retain and circulate. Progress = look for forward passes and runs.',
    phases: ['inPossession', 'outOfPossession', 'defensiveTransition', 'attackingTransition'] },
  { key: 'press', label: 'Press', low: 'Reluctant', high: 'Eager',
    tooltip: 'Individual pressing eagerness. Reluctant = hold position and conserve energy. Eager = close down the ball carrier.',
    phases: ['outOfPossession', 'defensiveTransition'] },
  { key: 'holdUp', label: 'Hold-up', low: 'Release', high: 'Shield',
    tooltip: 'Behaviour under pressure. Release = distribute quickly. Shield = hold the ball up and protect it.',
    phases: ['inPossession', 'attackingTransition'] },
  { key: 'dribble', label: 'Dribble', low: 'Pass', high: 'Carry',
    tooltip: 'Carrying preference. Pass = distribute early. Carry = run with the ball and beat defenders.',
    phases: ['inPossession', 'attackingTransition'] },
  { key: 'freedom', label: 'Freedom', low: 'Hold', high: 'Roam',
    tooltip: 'Positional freedom. Hold = strict discipline, stays near position. Roam = free to move and find space.',
    phases: ['inPossession', 'outOfPossession', 'defensiveTransition', 'attackingTransition'] },
  { key: 'decisionWindow', label: 'Tempo', low: 'Patient', high: 'Quick',
    tooltip: 'Personal decision speed. Patient = wait for the right moment. Quick = act on first instinct.',
    phases: ['inPossession', 'attackingTransition'] },
];

const PHASE_LABELS: Record<TacticsPhase, string> = {
  inPossession: 'In Possession',
  outOfPossession: 'Out of Possession',
  defensiveTransition: 'Defensive Transition',
  attackingTransition: 'Attacking Transition',
};

/**
 * Right panel — per-player controls.
 * Shown when a player is selected on the pitch.
 * Base phase (In Poss / Out of Poss) is driven by the global phase bar.
 * Transition sub-tabs (Def Trans / Att Trans) let you edit transition multipliers.
 */
export class PlayerPanel {
  private readonly el: HTMLElement;
  private playerIndex: number = -1;
  private playerName: string = '';
  private playerRole: string = '';
  private playerNumber: number = 0;
  private duty: Duty = 'SUPPORT';
  /** The base phase from the global phase bar (inPossession or outOfPossession) */
  private mainPhase: TacticsPhase = 'inPossession';
  /** The currently displayed phase — equals mainPhase unless a transition tab is active */
  private subPhase: TacticsPhase = 'inPossession';

  // Per-phase multipliers for the selected player
  private phaseMultipliers: Record<TacticsPhase, PlayerTacticalMultipliers> = {
    inPossession: defaultMultipliers(),
    outOfPossession: defaultMultipliers(),
    defensiveTransition: defaultMultipliers(),
    attackingTransition: defaultMultipliers(),
  };

  private onMultChange: ((idx: number, mult: PlayerTacticalMultipliers, phase: TacticsPhase) => void) | null = null;
  private onDutyChange: ((idx: number, duty: Duty) => void) | null = null;
  private onSubPhaseChangeCb: ((phase: TacticsPhase) => void) | null = null;
  private onBackCb: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.el = container;
  }

  selectPlayer(
    index: number,
    name: string,
    role: string,
    number: number,
    duty: Duty,
    allPhaseMultipliers: Record<TacticsPhase, PlayerTacticalMultipliers>,
    mainPhase?: TacticsPhase,
  ): void {
    this.playerIndex = index;
    this.playerName = name;
    this.playerRole = role;
    this.playerNumber = number;
    this.duty = duty;
    this.phaseMultipliers = {
      inPossession: { ...allPhaseMultipliers.inPossession },
      outOfPossession: { ...allPhaseMultipliers.outOfPossession },
      defensiveTransition: { ...allPhaseMultipliers.defensiveTransition },
      attackingTransition: { ...allPhaseMultipliers.attackingTransition },
    };
    if (mainPhase !== undefined) {
      this.mainPhase = mainPhase;
      this.subPhase = mainPhase;
    }
    this._build();
    this.show();
  }

  deselect(): void {
    this.playerIndex = -1;
    this.hide();
  }

  setPhase(phase: TacticsPhase): void {
    this.mainPhase = phase;
    this.subPhase = phase;
    if (this.playerIndex >= 0) {
      this._build();
    }
  }

  /** Update multipliers for a specific phase (called when overlay loads phase data) */
  updatePhaseMultipliers(phase: TacticsPhase, mult: PlayerTacticalMultipliers): void {
    this.phaseMultipliers[phase] = { ...mult };
    if (this.playerIndex >= 0 && this.subPhase === phase) {
      this._build();
    }
  }

  private get multipliers(): PlayerTacticalMultipliers {
    return this.phaseMultipliers[this.subPhase];
  }

  private _build(): void {
    this.el.innerHTML = '';

    // Back button
    const backBtn = document.createElement('button');
    backBtn.className = 'squad-back-btn';
    backBtn.innerHTML = '&#8249; Squad';
    backBtn.addEventListener('click', () => this.onBackCb?.());
    this.el.appendChild(backBtn);

    // Player header
    const header = document.createElement('div');
    header.className = 'player-header';
    header.innerHTML = `
      <div class="player-number">${this.playerNumber}</div>
      <div class="player-name">${this.playerName}</div>
      <div class="player-role">${this.playerRole}</div>
    `;
    this.el.appendChild(header);

    // Duty selector (all phases)
    this._addHeading('Duty');
    const dutySeg = document.createElement('div');
    dutySeg.className = 'segment-selector';
    dutySeg.title = 'Overall role weighting. Defend = stay back and hold shape. Support = balanced. Attack = push forward.';
    for (const d of ['DEFEND', 'SUPPORT', 'ATTACK'] as Duty[]) {
      const btn = document.createElement('button');
      btn.className = 'seg-btn' + (d === this.duty ? ' active' : '');
      btn.textContent = d.charAt(0) + d.slice(1).toLowerCase();
      btn.addEventListener('click', () => {
        this.duty = d;
        for (const b of dutySeg.children) b.classList.remove('active');
        btn.classList.add('active');
        this.onDutyChange?.(this.playerIndex, d);
      });
      dutySeg.appendChild(btn);
    }
    this.el.appendChild(dutySeg);

    // Instructions phase tabs: base phase + transitions
    const phaseSeg = document.createElement('div');
    phaseSeg.className = 'segment-selector';
    phaseSeg.title = 'Edit instructions for this phase. Transitions override behaviour during possession changes.';
    const PHASE_TABS: { id: TacticsPhase; label: string }[] = [
      { id: this.mainPhase, label: PHASE_LABELS[this.mainPhase] ?? 'Base' },
      { id: 'defensiveTransition', label: 'Def Trans' },
      { id: 'attackingTransition', label: 'Att Trans' },
    ];
    for (const tab of PHASE_TABS) {
      const btn = document.createElement('button');
      btn.className = 'seg-btn' + (this.subPhase === tab.id ? ' active' : '');
      btn.textContent = tab.label;
      btn.addEventListener('click', () => {
        this.subPhase = tab.id;
        this.onSubPhaseChangeCb?.(this.subPhase);
        this._build();
      });
      phaseSeg.appendChild(btn);
    }
    this.el.appendChild(phaseSeg);

    // Multiplier chips — filtered by the active sub-phase
    const visibleDefs = MULTIPLIER_DEFS.filter(def => def.phases.includes(this.subPhase));
    for (const def of visibleDefs) {
      this._addMultiplierChip(def);
    }

    // Role presets (only in-poss and out-of-poss sub-phases)
    if (this.subPhase === 'inPossession' || this.subPhase === 'outOfPossession') {
      this._addHeading('Presets');
      const presetGrid = document.createElement('div');
      presetGrid.className = 'preset-grid';
      for (const preset of ROLE_PRESETS) {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.label;
        btn.title = preset.tooltip;
        btn.addEventListener('click', () => {
          this.phaseMultipliers[this.subPhase] = {
            ...this.phaseMultipliers[this.subPhase],
            ...preset.multipliers,
          } as PlayerTacticalMultipliers;
          this.onMultChange?.(this.playerIndex, this.phaseMultipliers[this.subPhase], this.subPhase);
          this._build();
        });
        presetGrid.appendChild(btn);
      }
      this.el.appendChild(presetGrid);
    }
  }

  private _addHeading(text: string): void {
    const h = document.createElement('h4');
    h.textContent = text;
    this.el.appendChild(h);
  }

  private _addMultiplierChip(def: MultiplierDef): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'notch-selector';
    wrapper.title = def.tooltip;

    const value = this.multipliers[def.key];
    const idx = Math.round(value * 4);
    const labels = [def.low, '', '', '', def.high];

    const lbl = document.createElement('div');
    lbl.className = 'notch-label';
    lbl.innerHTML = `<span>${def.label}</span><span class="notch-value">${labels[idx] || ''}</span>`;
    wrapper.appendChild(lbl);

    const track = document.createElement('div');
    track.className = 'notch-track';
    for (let i = 0; i < 5; i++) {
      const notch = document.createElement('div');
      notch.className = 'notch' + (i === idx ? ' active' : '');
      notch.addEventListener('click', () => {
        const newVal = i / 4;
        this.phaseMultipliers[this.subPhase] = { ...this.phaseMultipliers[this.subPhase], [def.key]: newVal };
        for (const n of track.children) n.classList.remove('active');
        notch.classList.add('active');
        const valSpan = lbl.querySelector('.notch-value') as HTMLElement;
        if (valSpan) valSpan.textContent = labels[i] || '';
        this.onMultChange?.(this.playerIndex, this.phaseMultipliers[this.subPhase], this.subPhase);
      });
      track.appendChild(notch);
    }
    wrapper.appendChild(track);
    this.el.appendChild(wrapper);
  }

  getMultipliers(): PlayerTacticalMultipliers { return this.multipliers; }
  getDuty(): Duty { return this.duty; }
  getSelectedIndex(): number { return this.playerIndex; }

  onMultiplierChange(cb: (idx: number, mult: PlayerTacticalMultipliers, phase: TacticsPhase) => void): void {
    this.onMultChange = cb;
  }

  onDutyChanged(cb: (idx: number, duty: Duty) => void): void {
    this.onDutyChange = cb;
  }

  onSubPhaseChanged(cb: (phase: TacticsPhase) => void): void {
    this.onSubPhaseChangeCb = cb;
  }

  onBack(cb: () => void): void {
    this.onBackCb = cb;
  }

  getSubPhase(): TacticsPhase { return this.subPhase; }

  show(): void { this.el.classList.add('open'); }
  hide(): void { this.el.classList.remove('open'); }
}
