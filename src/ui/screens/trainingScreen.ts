/**
 * Training Screen — build and manage custom training day presets.
 *
 * Displays a 3×3 grid (3 time slots × 3 training groups) where each cell
 * picks a single attribute to train. Saved presets are listed below with
 * edit/delete controls.
 */

import type { SeasonState } from '../../season/season.ts';
import type { TrainingDayPreset, TrainingSlot } from '../../season/training.ts';
import {
  ALL_TRAINABLE_ATTRS, ATTR_LABELS, SLOT_LABELS,
  INTENSITY_LABELS,
  DEFAULT_PRESETS,
} from '../../season/training.ts';
import type { PlayerAttributes } from '../../simulation/types.ts';

// Color palette (dark theme — matches other screens)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const GREEN = '#4ade80';

export class TrainingScreen {
  private container: HTMLElement;
  private saveCallbacks: Array<(preset: TrainingDayPreset) => void> = [];
  private deleteCallbacks: Array<(presetId: string) => void> = [];
  private editCallbacks: Array<(preset: TrainingDayPreset) => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.padding = '24px';
    this.container.style.boxSizing = 'border-box';
  }

  onSave(cb: (preset: TrainingDayPreset) => void): void { this.saveCallbacks.push(cb); }
  onDelete(cb: (presetId: string) => void): void { this.deleteCallbacks.push(cb); }
  onEdit(cb: (preset: TrainingDayPreset) => void): void { this.editCallbacks.push(cb); }

  update(state: SeasonState): void {
    const playerTeam = state.teams.find(t => t.isPlayerTeam);
    if (!playerTeam) return;

    const presets = state.trainingPresets ?? [...DEFAULT_PRESETS];

    const cardStyle = `background: linear-gradient(135deg, ${PANEL_BG} 0%, #151d2e 100%); border-radius: 12px; padding: 20px 24px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 16px rgba(0,0,0,0.3);`;
    const labelStyle = `color: ${TEXT}; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; font-weight: 600;`;
    const selectStyle = `width:100%; background:#0f172a; border:1px solid #334155; border-radius:6px; color:${TEXT_BRIGHT}; font:12px/1.4 'Segoe UI',system-ui,sans-serif; padding:6px 8px; cursor:pointer;`;

    // Build attribute dropdown options
    const attrOptionsHtml = (selected: string) => {
      let html = `<option value="rest"${selected === 'rest' ? ' selected' : ''}>Rest</option>`;
      for (const attr of ALL_TRAINABLE_ATTRS) {
        html += `<option value="${attr}"${attr === selected ? ' selected' : ''}>${ATTR_LABELS[attr]}</option>`;
      }
      return html;
    };

    // Build 3×3 grid rows
    const gridRowsHtml = SLOT_LABELS.map((slotLabel, slotIdx) => {
      const cellHtml = (['gk', 'def', 'atk'] as const).map(grp => {
        const id = `slot-${slotIdx}-${grp}`;
        const defaultAttr = DEFAULT_PRESETS[0]!.slots[slotIdx]![grp];
        return `<td style="padding:6px; width:30%;"><select id="${id}" style="${selectStyle}">${attrOptionsHtml(defaultAttr)}</select></td>`;
      }).join('');

      return `<tr>
        <td style="padding:6px 12px 6px 0; color:${TEXT}; font-size:12px; font-weight:600; white-space:nowrap; width:10%;">${slotLabel}</td>
        ${cellHtml}
      </tr>`;
    }).join('');

    // Saved presets list — grouped by GK/DEF/ATK, showing Morning/Afternoon/Evening
    const presetsListHtml = presets.map(preset => {
      const isDefault = DEFAULT_PRESETS.some(d => d.id === preset.id);
      const groupColors: Record<string, string> = { gk: '#eab308', def: ACCENT_BLUE, atk: '#f87171' };
      const groupNames: Record<string, string> = { gk: 'Goalkeepers', def: 'Defenders', atk: 'Attackers' };
      const slotSummary = (['gk', 'def', 'atk'] as const).map(grp => {
        const attrs = preset.slots.map(slot => {
          const val = slot[grp];
          return val === 'rest' ? 'Rest' : ATTR_LABELS[val as keyof PlayerAttributes];
        });
        return `<div style="font-size:11px; color:${TEXT}; padding:1px 0;">
          <span style="color:${groupColors[grp]}; font-size:10px; font-weight:600;">${groupNames[grp]}:</span>
          ${attrs.join(' / ')}
        </div>`;
      }).join('');

      return `
        <div style="display:flex; align-items:center; gap:12px; padding:12px; background:#0f172a; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
          <div style="flex:1;">
            <div style="color:${TEXT_BRIGHT}; font-size:14px; font-weight:600; margin-bottom:4px;">${preset.name} <span style="color:${ACCENT_BLUE}; font-size:11px; font-weight:400;">${INTENSITY_LABELS[preset.intensity ?? 3] ?? 'Moderate'} (${preset.intensity ?? 3}/5)</span></div>
            ${slotSummary}
          </div>
          <button data-edit-preset="${preset.id}" style="padding:4px 12px; background:#1e3a5f; color:${ACCENT_BLUE}; border:1px solid ${ACCENT_BLUE}; border-radius:6px; font:600 11px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer;">Edit</button>
          ${!isDefault ? `<button data-delete-preset="${preset.id}" style="padding:4px 12px; background:#3b1111; color:#f87171; border:1px solid #f87171; border-radius:6px; font:600 11px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer;">Delete</button>` : ''}
        </div>`;
    }).join('');

    this.container.innerHTML = `
      <div style="max-width: 800px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: ${TEXT_BRIGHT}; font-size: 24px; margin: 0 0 6px 0; font-weight: 800;">Training</h1>
          <div style="color: ${TEXT}; font-size: 13px;">Build training day presets — each cell trains one attribute per session</div>
        </div>

        <!-- Builder -->
        <div style="${cardStyle} margin-bottom:16px;">
          <div style="${labelStyle}">Create Training Day</div>
          <div style="display:flex; gap:12px; margin-bottom:12px; align-items:center;">
            <input id="builder-name" type="text" placeholder="Training day name..." value="" maxlength="30"
              style="flex:1; background:#0f172a; border:1px solid #334155; border-radius:6px; color:${TEXT_BRIGHT}; font:14px/1.4 'Segoe UI',system-ui,sans-serif; padding:8px 12px;">
            <button id="builder-save" style="padding:8px 20px; background:#166534; color:${GREEN}; border:1px solid #22c55e; border-radius:8px; font:600 13px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; white-space:nowrap;">Save</button>
          </div>
          <div style="display:flex; gap:12px; margin-bottom:16px; align-items:center;">
            <label style="color:${TEXT}; font-size:12px; font-weight:600; min-width:65px;">Intensity</label>
            <input id="builder-intensity" type="range" min="1" max="5" step="1" value="3"
              style="flex:1; cursor:pointer; accent-color:${ACCENT_BLUE};">
            <span id="builder-intensity-label" style="color:${TEXT_BRIGHT}; font-size:12px; font-weight:600; min-width:65px; text-align:right;">Moderate</span>
          </div>

          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="padding:6px 12px 6px 0; text-align:left; color:${TEXT}; font-size:10px; text-transform:uppercase; letter-spacing:1.5px;"></th>
                <th style="padding:6px; text-align:center; color:#eab308; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Goalkeepers</th>
                <th style="padding:6px; text-align:center; color:${ACCENT_BLUE}; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Defenders</th>
                <th style="padding:6px; text-align:center; color:#f87171; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Attackers</th>
              </tr>
            </thead>
            <tbody>
              ${gridRowsHtml}
            </tbody>
          </table>
        </div>

        <!-- Saved Presets -->
        <div style="${cardStyle}">
          <div style="${labelStyle}">Saved Training Days (${presets.length})</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${presetsListHtml || `<div style="color:#475569; font-size:13px; font-style:italic;">No presets saved yet</div>`}
          </div>
        </div>
      </div>
    `;

    // Wire save button
    const wireSaveHandler = () => {
      this.container.querySelector('#builder-save')?.addEventListener('click', () => {
        const nameInput = this.container.querySelector('#builder-name') as HTMLInputElement;
        const name = nameInput?.value.trim();
        if (!name) { nameInput?.focus(); return; }

        const slots = SLOT_LABELS.map((_, slotIdx) => {
          const gk = (this.container.querySelector(`#slot-${slotIdx}-gk`) as HTMLSelectElement)?.value ?? 'rest';
          const def = (this.container.querySelector(`#slot-${slotIdx}-def`) as HTMLSelectElement)?.value ?? 'rest';
          const atk = (this.container.querySelector(`#slot-${slotIdx}-atk`) as HTMLSelectElement)?.value ?? 'rest';
          return { gk, def, atk } as TrainingSlot;
        }) as [TrainingSlot, TrainingSlot, TrainingSlot];

        const intensity = parseInt((this.container.querySelector('#builder-intensity') as HTMLInputElement)?.value ?? '3', 10);
        const preset: TrainingDayPreset = {
          id: `preset-${Date.now()}`,
          name,
          slots,
          intensity,
        };

        for (const cb of this.saveCallbacks) cb(preset);
      });
    };

    wireSaveHandler();

    // Wire intensity slider label
    const intensitySlider = this.container.querySelector('#builder-intensity') as HTMLInputElement;
    const intensityLabel = this.container.querySelector('#builder-intensity-label') as HTMLSpanElement;
    if (intensitySlider && intensityLabel) {
      intensitySlider.addEventListener('input', () => {
        intensityLabel.textContent = INTENSITY_LABELS[parseInt(intensitySlider.value, 10)] ?? 'Moderate';
      });
    }

    // Wire edit buttons
    for (const btn of this.container.querySelectorAll('[data-edit-preset]')) {
      btn.addEventListener('click', () => {
        const presetId = (btn as HTMLElement).dataset.editPreset!;
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return;

        // Load preset into builder
        const nameInput = this.container.querySelector('#builder-name') as HTMLInputElement;
        if (nameInput) nameInput.value = preset.name;

        for (let slotIdx = 0; slotIdx < preset.slots.length; slotIdx++) {
          const slot = preset.slots[slotIdx]!;
          for (const grp of ['gk', 'def', 'atk'] as const) {
            const select = this.container.querySelector(`#slot-${slotIdx}-${grp}`) as HTMLSelectElement;
            if (select) select.value = slot[grp];
          }
        }

        // Load intensity into slider
        const editIntensity = this.container.querySelector('#builder-intensity') as HTMLInputElement;
        const editIntensityLabel = this.container.querySelector('#builder-intensity-label') as HTMLSpanElement;
        if (editIntensity) {
          editIntensity.value = String(preset.intensity ?? 3);
          if (editIntensityLabel) editIntensityLabel.textContent = INTENSITY_LABELS[preset.intensity ?? 3] ?? 'Moderate';
        }

        // Change save button to update mode
        const saveBtn = this.container.querySelector('#builder-save') as HTMLButtonElement;
        if (saveBtn) {
          saveBtn.textContent = 'Update';
          const newBtn = saveBtn.cloneNode(true) as HTMLButtonElement;
          saveBtn.parentNode?.replaceChild(newBtn, saveBtn);
          newBtn.addEventListener('click', () => {
            const updatedName = (this.container.querySelector('#builder-name') as HTMLInputElement)?.value.trim();
            if (!updatedName) return;

            const slots = SLOT_LABELS.map((_, slotIdx) => {
              const gk = (this.container.querySelector(`#slot-${slotIdx}-gk`) as HTMLSelectElement)?.value ?? 'rest';
              const def = (this.container.querySelector(`#slot-${slotIdx}-def`) as HTMLSelectElement)?.value ?? 'rest';
              const atk = (this.container.querySelector(`#slot-${slotIdx}-atk`) as HTMLSelectElement)?.value ?? 'rest';
              return { gk, def, atk } as TrainingSlot;
            }) as [TrainingSlot, TrainingSlot, TrainingSlot];

            const updatedIntensity = parseInt((this.container.querySelector('#builder-intensity') as HTMLInputElement)?.value ?? '3', 10);
            const updatedPreset: TrainingDayPreset = { id: presetId, name: updatedName, slots, intensity: updatedIntensity };
            for (const cb of this.editCallbacks) cb(updatedPreset);
          });
        }
      });
    }

    // Wire delete buttons
    for (const btn of this.container.querySelectorAll('[data-delete-preset]')) {
      btn.addEventListener('click', () => {
        const presetId = (btn as HTMLElement).dataset.deletePreset!;
        for (const cb of this.deleteCallbacks) cb(presetId);
      });
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }
}
