/**
 * TacticSelector — dropdown + save/delete buttons for saved tactics.
 * Sits above the phase bar in the left panel.
 */
export class TacticSelector {
  private readonly el: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;

  private _onSave: ((name: string) => void) | null = null;
  private _onLoad: ((name: string) => void) | null = null;
  private _onDelete: ((name: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.el = container;

    // Label (own row)
    const label = document.createElement('span');
    label.className = 'tactic-label';
    label.textContent = 'Tactic';
    this.el.appendChild(label);

    // Controls row (dropdown + buttons)
    const row = document.createElement('div');
    row.className = 'tactic-controls';
    this.el.appendChild(row);

    // Dropdown
    this.select = document.createElement('select');
    this.select.className = 'tactic-select';
    this.select.title = 'Load a saved tactic';
    row.appendChild(this.select);

    // Save button
    this.saveBtn = document.createElement('button');
    this.saveBtn.className = 'tactic-btn';
    this.saveBtn.textContent = 'Save';
    this.saveBtn.title = 'Save current tactics as a preset';
    row.appendChild(this.saveBtn);

    // Delete button
    this.deleteBtn = document.createElement('button');
    this.deleteBtn.className = 'tactic-btn tactic-btn-del';
    this.deleteBtn.textContent = 'Del';
    this.deleteBtn.title = 'Delete the selected tactic';
    row.appendChild(this.deleteBtn);

    // Events
    this.select.addEventListener('change', () => {
      const name = this.select.value;
      if (name) this._onLoad?.(name);
    });

    this.saveBtn.addEventListener('click', () => {
      const name = window.prompt('Tactic name:');
      if (name && name.trim()) this._onSave?.(name.trim());
    });

    this.deleteBtn.addEventListener('click', () => {
      const name = this.select.value;
      if (!name) return;
      if (confirm(`Delete tactic "${name}"?`)) {
        this._onDelete?.(name);
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

    this.deleteBtn.disabled = !this.select.value;
  }

  onSave(cb: (name: string) => void): void { this._onSave = cb; }
  onLoad(cb: (name: string) => void): void { this._onLoad = cb; }
  onDelete(cb: (name: string) => void): void { this._onDelete = cb; }

  show(): void { this.el.classList.add('open'); }
  hide(): void { this.el.classList.remove('open'); }
}
