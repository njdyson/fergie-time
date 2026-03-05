import type { TeamControls, PressConfig, PressHeight, TacticsPhase } from '../../simulation/types.ts';
import { defaultTeamControls, defaultPressConfig } from '../../simulation/types.ts';

const QUICK_SHAPES = ['4-4-2', '4-3-3', '4-5-1', '3-5-2', '4-2-3-1'] as const;

/**
 * Left panel — team-level controls.
 * Structure (lineHeight/compactness/width) is now handled by the snap-grid
 * drag editor on the tactics board. This panel provides:
 *   In Poss:    Quick-shape presets + Tempo + Rest Defence
 *   Out of Poss: Quick-shape presets + Pressing (height, intensity, counter-press)
 */
export class TeamPanel {
  private readonly container: HTMLElement;
  private readonly el: HTMLElement;
  private controls: TeamControls = defaultTeamControls();
  private press: PressConfig = defaultPressConfig();
  private phase: TacticsPhase = 'inPossession';
  private onChange: (() => void) | null = null;
  private onQuickShapeCb: ((formationId: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.el = document.createElement('div');
    // Phase bar is first child; team controls go after it
    container.appendChild(this.el);
    this._build();
  }

  private _build(): void {
    this.el.innerHTML = '';

    // Quick-shape preset buttons
    this._addHeading('Quick Shape');
    const row = document.createElement('div');
    row.className = 'quick-shape-row';
    for (const f of QUICK_SHAPES) {
      const btn = document.createElement('button');
      btn.className = 'quick-shape-btn';
      btn.textContent = f;
      btn.title = `Reset to ${f} shape`;
      btn.addEventListener('click', () => {
        this.onQuickShapeCb?.(f);
      });
      row.appendChild(btn);
    }
    this.el.appendChild(row);

    if (this.phase === 'inPossession') {
      this._addHeading('Tempo');
      this._addNotch('Tempo', 'tempo', this.controls.tempo, ['Patient', '', 'Balanced', '', 'Frantic'],
        'Overall decision-making speed. Patient = hold and recycle possession, Frantic = quick one-touch play.');

      this._addHeading('Defence');
      this._addSegment('Rest Defence', 'restDefence', this.controls.restDefence, [
        { label: '2', value: 2 },
        { label: '3', value: 3 },
        { label: '4', value: 4 },
      ], 'Number of players pinned behind the ball during attacks. More = safer but fewer bodies forward.');
    }

    if (this.phase === 'outOfPossession') {
      this._addHeading('Pressing');
      this._addSegment('Press Height', 'pressHeight', this.press.height, [
        { label: 'Low', value: 'low' },
        { label: 'Mid', value: 'mid' },
        { label: 'High', value: 'high' },
      ], 'Where the team starts pressing. Low = own third only, Mid = own half, High = press anywhere on the pitch.');
      this._addNotch('Press Intensity', 'pressIntensity', this.press.intensity,
        ['Low', '', 'Med', '', 'Max'],
        'How eagerly individual players engage the press. Low = conserve energy, Max = close down at every chance.');

      this._addHeading('Counter-press');
      this._addNotch('Duration', 'counterPress', this.press.counterPressSecs / 5,
        ['0s', '1s', '2s', '3s', '5s'],
        'How long the team aggressively hunts the ball after losing possession. 0s = drop straight into shape, 5s = sustained press.');
    }
  }

  private _addHeading(text: string): void {
    const h = document.createElement('h4');
    h.textContent = text;
    this.el.appendChild(h);
  }

  private _addNotch(label: string, key: string, value: number, labels: string[], tooltip?: string): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'notch-selector';
    if (tooltip) wrapper.title = tooltip;

    const lbl = document.createElement('div');
    lbl.className = 'notch-label';
    const idx = Math.round(value * 4);
    lbl.innerHTML = `<span>${label}</span><span class="notch-value">${labels[idx] || ''}</span>`;
    wrapper.appendChild(lbl);

    const track = document.createElement('div');
    track.className = 'notch-track';
    for (let i = 0; i < 5; i++) {
      const notch = document.createElement('div');
      notch.className = 'notch' + (i === idx ? ' active' : '');
      notch.addEventListener('click', () => {
        const newVal = i / 4; // 0, 0.25, 0.5, 0.75, 1.0
        this._setControlValue(key, newVal);
        // Update visual
        for (const n of track.children) n.classList.remove('active');
        notch.classList.add('active');
        const valSpan = lbl.querySelector('.notch-value') as HTMLElement;
        if (valSpan) valSpan.textContent = labels[i] || '';
      });
      track.appendChild(notch);
    }
    wrapper.appendChild(track);
    this.el.appendChild(wrapper);
  }

  private _addSegment<T extends string | number>(
    label: string,
    key: string,
    value: T,
    options: { label: string; value: T }[],
    tooltip?: string,
  ): void {
    const lbl = document.createElement('div');
    lbl.className = 'notch-label';
    if (tooltip) lbl.title = tooltip;
    lbl.innerHTML = `<span>${label}</span>`;
    this.el.appendChild(lbl);

    const seg = document.createElement('div');
    seg.className = 'segment-selector';
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'seg-btn' + (opt.value === value ? ' active' : '');
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        this._setControlValue(key, opt.value);
        for (const b of seg.children) b.classList.remove('active');
        btn.classList.add('active');
      });
      seg.appendChild(btn);
    }
    this.el.appendChild(seg);
  }

  private _setControlValue(key: string, value: number | string): void {
    switch (key) {
      case 'tempo':
        this.controls = { ...this.controls, tempo: value as number };
        break;
      case 'restDefence':
        this.controls = { ...this.controls, restDefence: value as number };
        break;
      case 'pressHeight':
        this.press = { ...this.press, height: value as PressHeight };
        break;
      case 'counterPress': {
        // notch value 0..1 maps to [0, 1, 2, 3, 5] seconds
        const secs = [0, 1, 2, 3, 5][Math.round((value as number) * 4)] ?? 2;
        this.press = { ...this.press, counterPressSecs: secs };
        break;
      }
      case 'pressIntensity':
        this.press = { ...this.press, intensity: value as number };
        break;
    }
    this.onChange?.();
  }

  /** Returns controls with structure fields locked to neutral (0.5) — shape is set by drag editor */
  getControls(): TeamControls {
    return { ...this.controls, lineHeight: 0.5, compactness: 0.5, width: 0.5 };
  }

  getPress(): PressConfig { return this.press; }

  setControls(tc: TeamControls, pc: PressConfig, phase?: TacticsPhase): void {
    this.controls = tc;
    this.press = pc;
    if (phase !== undefined) this.phase = phase;
    this._build(); // rebuild DOM to reflect new values and phase
  }

  setPhase(phase: TacticsPhase): void {
    this.phase = phase;
    this._build();
  }

  onControlChange(cb: () => void): void { this.onChange = cb; }
  onQuickShape(cb: (formationId: string) => void): void { this.onQuickShapeCb = cb; }
  show(): void { this.container.classList.add('open'); }
  hide(): void { this.container.classList.remove('open'); }
}
