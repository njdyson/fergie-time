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
    phases: ['inPossession', 'outOfPossession', 'attackingTransition'] },
  { key: 'directness', label: 'Directness', low: 'Recycle', high: 'Progress',
    tooltip: 'Ball progression preference. Recycle = retain and circulate. Progress = look for forward passes and runs.',
    phases: ['inPossession', 'outOfPossession', 'attackingTransition'] },
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
    phases: ['inPossession', 'outOfPossession', 'attackingTransition'] },
  { key: 'decisionWindow', label: 'Tempo', low: 'Patient', high: 'Quick',
    tooltip: 'Personal decision speed. Patient = wait for the right moment. Quick = act on first instinct.',
    phases: ['inPossession', 'attackingTransition'] },
];

/**
 * Right panel — per-player controls.
 * Shown when a player is selected on the pitch.
 * Base phase (In Poss / Out of Poss) is driven by the global phase bar.
 * Transition sliders are shown inline below the base phase sliders.
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

  // Per-phase multipliers for the selected player
  private phaseMultipliers: Record<TacticsPhase, PlayerTacticalMultipliers> = {
    inPossession: defaultMultipliers(),
    outOfPossession: defaultMultipliers(),
    defensiveTransition: defaultMultipliers(),
    attackingTransition: defaultMultipliers(),
  };

  private onMultChange: ((idx: number, mult: PlayerTacticalMultipliers, phase: TacticsPhase) => void) | null = null;
  private onDutyChange: ((idx: number, duty: Duty) => void) | null = null;
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
    if (this.playerIndex >= 0) {
      this._build();
    }
  }

  /** Update multipliers for a specific phase (called when overlay loads phase data) */
  updatePhaseMultipliers(phase: TacticsPhase, mult: PlayerTacticalMultipliers): void {
    this.phaseMultipliers[phase] = { ...mult };
    if (this.playerIndex >= 0) {
      this._build();
    }
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

    const isGK = this.playerRole === 'GK';

    // GK only gets distribution style (directness); skip everything else
    if (isGK) {
      const gkDef = MULTIPLIER_DEFS.find(d => d.key === 'directness');
      if (gkDef) {
        this._addMultiplierChip(
          { ...gkDef, label: 'Distribution', low: 'Short', high: 'Long',
            tooltip: 'Distribution preference. Short = play out from the back. Long = launch it forward.' },
          this.mainPhase,
        );
      }
      return;
    }

    // Determine which transition phase to show inline
    const transPhase: TacticsPhase =
      this.mainPhase === 'inPossession' ? 'attackingTransition' : 'defensiveTransition';
    const transLabel =
      this.mainPhase === 'inPossession' ? 'On Winning Ball' : 'On Losing Ball';

    // Base phase sliders
    const baseDefs = MULTIPLIER_DEFS.filter(def => def.phases.includes(this.mainPhase));
    for (const def of baseDefs) {
      this._addMultiplierChip(def, this.mainPhase);
    }

    // Role presets
    this._addHeading('Presets');
    const presetGrid = document.createElement('div');
    presetGrid.className = 'preset-grid';
    for (const preset of ROLE_PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.textContent = preset.label;
      btn.title = preset.tooltip;
      btn.addEventListener('click', () => {
        this.phaseMultipliers[this.mainPhase] = {
          ...this.phaseMultipliers[this.mainPhase],
          ...preset.multipliers,
        } as PlayerTacticalMultipliers;
        this.onMultChange?.(this.playerIndex, this.phaseMultipliers[this.mainPhase], this.mainPhase);
        this._build();
      });
      presetGrid.appendChild(btn);
    }
    this.el.appendChild(presetGrid);

    // Transition section divider
    this._addSectionDivider(transLabel);

    // Transition phase sliders
    const transDefs = MULTIPLIER_DEFS.filter(def => def.phases.includes(transPhase));
    for (const def of transDefs) {
      this._addMultiplierChip(def, transPhase);
    }
  }

  private _addHeading(text: string): void {
    const h = document.createElement('h4');
    h.textContent = text;
    this.el.appendChild(h);
  }

  private _addSectionDivider(text: string): void {
    const div = document.createElement('div');
    div.style.cssText =
      "display:flex; align-items:center; gap:8px; margin:14px 0 8px; user-select:none;";
    const line1 = document.createElement('span');
    line1.style.cssText = 'flex:1; height:1px; background:#334155;';
    const label = document.createElement('span');
    label.style.cssText =
      "color:#64748b; font:bold 9px/1 'Segoe UI',system-ui,sans-serif; text-transform:uppercase; letter-spacing:0.1em; white-space:nowrap;";
    label.textContent = text;
    const line2 = document.createElement('span');
    line2.style.cssText = 'flex:1; height:1px; background:#334155;';
    div.appendChild(line1);
    div.appendChild(label);
    div.appendChild(line2);
    this.el.appendChild(div);
  }

  private _addMultiplierChip(def: MultiplierDef, phase: TacticsPhase): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'notch-selector';
    wrapper.title = def.tooltip;

    const value = this.phaseMultipliers[phase][def.key];
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
        this.phaseMultipliers[phase] = { ...this.phaseMultipliers[phase], [def.key]: newVal };
        for (const n of track.children) n.classList.remove('active');
        notch.classList.add('active');
        const valSpan = lbl.querySelector('.notch-value') as HTMLElement;
        if (valSpan) valSpan.textContent = labels[i] || '';
        this.onMultChange?.(this.playerIndex, this.phaseMultipliers[phase], phase);
      });
      track.appendChild(notch);
    }
    wrapper.appendChild(track);
    this.el.appendChild(wrapper);
  }

  getMultipliers(): PlayerTacticalMultipliers { return this.phaseMultipliers[this.mainPhase]; }
  getDuty(): Duty { return this.duty; }
  getSelectedIndex(): number { return this.playerIndex; }

  onMultiplierChange(cb: (idx: number, mult: PlayerTacticalMultipliers, phase: TacticsPhase) => void): void {
    this.onMultChange = cb;
  }

  onDutyChanged(cb: (idx: number, duty: Duty) => void): void {
    this.onDutyChange = cb;
  }

  onSubPhaseChanged(_cb: (phase: TacticsPhase) => void): void {
    // No-op: sub-phase tabs removed, kept for API compatibility
  }

  onBack(cb: () => void): void {
    this.onBackCb = cb;
  }

  getSubPhase(): TacticsPhase { return this.mainPhase; }

  show(): void { this.el.classList.add('open'); }
  hide(): void { this.el.classList.remove('open'); }
}
