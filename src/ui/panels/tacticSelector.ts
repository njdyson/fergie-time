/**
 * TacticSelector — dropdown + save/save-as/delete buttons for saved tactics.
 * Sits above the phase bar in the left panel.
 */
export class TacticSelector {
  private readonly el: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly saveAsBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;

  private _onSave: ((name: string) => void) | null = null;
  private _onLoad: ((name: string) => void) | null = null;
  private _onDelete: ((name: string) => void) | null = null;

  /** Name of the currently loaded tactic (tracks last selected/saved). */
  private currentName: string = '';

  constructor(container: HTMLElement) {
    this.el = container;

    // Label (own row)
    const label = document.createElement('span');
    label.className = 'tactic-label';
    label.textContent = 'Tactic';
    this.el.appendChild(label);

    // Dropdown row
    const dropdownRow = document.createElement('div');
    dropdownRow.className = 'tactic-controls';
    this.el.appendChild(dropdownRow);

    // Dropdown
    this.select = document.createElement('select');
    this.select.className = 'tactic-select';
    this.select.title = 'Load a saved tactic';
    dropdownRow.appendChild(this.select);

    // Buttons row (below dropdown)
    const btnRow = document.createElement('div');
    btnRow.className = 'tactic-controls';
    this.el.appendChild(btnRow);

    // Save button (overwrites currently selected tactic)
    this.saveBtn = document.createElement('button');
    this.saveBtn.className = 'tactic-btn';
    this.saveBtn.textContent = 'Save';
    this.saveBtn.title = 'Overwrite the currently loaded tactic';
    this.saveBtn.disabled = true;
    btnRow.appendChild(this.saveBtn);

    // Save As button (prompts for new name)
    this.saveAsBtn = document.createElement('button');
    this.saveAsBtn.className = 'tactic-btn';
    this.saveAsBtn.textContent = 'Save As';
    this.saveAsBtn.title = 'Save current tactics as a new preset';
    btnRow.appendChild(this.saveAsBtn);

    // Delete button
    this.deleteBtn = document.createElement('button');
    this.deleteBtn.className = 'tactic-btn tactic-btn-del';
    this.deleteBtn.textContent = 'Del';
    this.deleteBtn.title = 'Delete the selected tactic';
    btnRow.appendChild(this.deleteBtn);

    // Events
    this.select.addEventListener('change', () => {
      const name = this.select.value;
      this.currentName = name;
      this.saveBtn.disabled = !name;
      this.deleteBtn.disabled = !name;
      if (name) this._onLoad?.(name);
    });

    this.saveBtn.addEventListener('click', () => {
      if (this.currentName) {
        this._onSave?.(this.currentName);
      }
    });

    this.saveAsBtn.addEventListener('click', () => {
      const name = window.prompt('Tactic name:');
      if (name && name.trim()) {
        const trimmed = name.trim();
        this._onSave?.(trimmed);
        this.currentName = trimmed;
        this.saveBtn.disabled = false;
      }
    });

    this.deleteBtn.addEventListener('click', () => {
      const name = this.select.value;
      if (!name) return;
      if (confirm(`Delete tactic "${name}"?`)) {
        this._onDelete?.(name);
        this.currentName = '';
        this.saveBtn.disabled = true;
      }
    });
  }

  /** Refresh the dropdown options from a list of tactic names */
  refresh(names: string[], selected?: string): void {
    this.select.innerHTML = '';
    // Placeholder
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- Select --';
    this.select.appendChild(placeholder);

    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === selected) opt.selected = true;
      this.select.appendChild(opt);
    }

    const sel = selected ?? '';
    this.currentName = sel;
    this.saveBtn.disabled = !sel;
    this.deleteBtn.disabled = !this.select.value;
  }

  onSave(cb: (name: string) => void): void { this._onSave = cb; }
  onLoad(cb: (name: string) => void): void { this._onLoad = cb; }
  onDelete(cb: (name: string) => void): void { this._onDelete = cb; }

  show(): void { this.el.classList.add('open'); }
  hide(): void { this.el.classList.remove('open'); }
}
