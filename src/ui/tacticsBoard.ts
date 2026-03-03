import { Vec2 } from '../simulation/math/vec2.ts';
import type { FormationId, Role, Duty, PlayerState } from '../simulation/types.ts';
import { FORMATION_TEMPLATES, autoAssignRole } from '../simulation/tactical/formation.ts';
import type { TacticalConfig } from '../simulation/engine.ts';

// ============================================================
// Pitch dimensions (matches simulation constants)
// ============================================================

const PITCH_W = 105;
const PITCH_H = 68;

// Rendering constants
const PITCH_PADDING = 24; // canvas pixels of padding around pitch
const PLAYER_RADIUS = 14; // canvas pixels — larger than match view for easy clicking
const SHIRT_FONT = 'bold 11px sans-serif';
const ROLE_FONT = '9px monospace';

// Zone boundaries (from home team perspective, in metres)
const DEF_ZONE_X = 33; // defensive/midfield boundary
const ATT_ZONE_X = 55; // midfield/attacking boundary

// Colors
const PLAYER_COLOR = '#3366cc';
const PLAYER_GK_COLOR = '#66cc99';
const PLAYER_SELECTED_COLOR = '#60a5fa';
const GUIDE_COLOR = 'rgba(255, 255, 255, 0.12)';
const GUIDE_LABEL_COLOR = 'rgba(255, 255, 255, 0.28)';

// ============================================================
// Duty type — can reference from types but import directly
// ============================================================

const DUTY_VALUES: readonly Duty[] = ['DEFEND', 'SUPPORT', 'ATTACK'];

// ============================================================
// DutyPopup state
// ============================================================

interface DutyPopup {
  playerIndex: number;
  canvasX: number;
  canvasY: number;
}

// ============================================================
// TacticsBoard
// ============================================================

/**
 * TacticsBoard renders a top-down pitch diagram with 11 draggable player dots.
 *
 * Features:
 * - 5 formation preset buttons (via setFormation)
 * - Zone guide lines (DEF / MID / ATT) with faint labels
 * - Per-player duty picker popup (click to select Defend/Support/Attack)
 * - Drag-and-drop repositioning with autoAssignRole on drop
 * - getTacticalConfig() returns the current formation/roles/duties for the engine
 *
 * Works without DOM if constructed with a mock canvas context (unit-testable).
 */
export class TacticsBoard {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  // Coordinate transform (pitch metres -> canvas pixels)
  private scaleX: number = 1;
  private scaleY: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;

  // Formation state
  private formation: FormationId = '4-4-2';
  private positions: Vec2[] = [];
  private roles: Role[] = [];
  private duties: Duty[] = [];

  // Drag state
  private draggingIndex: number = -1;
  private dragStartMoved = false;

  // Selection / popup state
  private selectedIndex: number = -1;
  private dutyPopup: DutyPopup | null = null;

  // Bench / substitution state
  private subsRemaining: number = 3;
  // Maps pitch player index -> incoming bench player (pending substitution)
  private pendingSubsByPitchIndex: Map<number, PlayerState> = new Map();
  // Whether a pitch player is selected for substitution (awaiting bench pick)
  private subSelectIndex: number = -1;
  // A bench player selected to come on (awaiting pitch player pick) — set by main.ts
  private pendingBenchPlayer: PlayerState | null = null;
  // Optional callback invoked after a substitution is queued (pitch player index)
  _onSubstitutionQueued: ((pitchIndex: number) => void) | undefined = undefined;

  // ──────────────────────────────────────────────────────────
  // Construction
  // ──────────────────────────────────────────────────────────

  constructor(canvas: HTMLCanvasElement, initialFormation: FormationId = '4-4-2') {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('TacticsBoard: cannot get 2D context from canvas');
    this.ctx = ctx;

    this.formation = initialFormation;
    this._loadFormation(initialFormation);
    this._recalcTransform();
    this._bindEvents();
    this.render();
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────

  /** Set formation preset — resets all positions and roles, preserves duties */
  setFormation(formationId: FormationId): void {
    this.formation = formationId;
    this._loadFormation(formationId);
    this.dutyPopup = null;
    this.selectedIndex = -1;
    this.render();
  }

  /** Get current formation preset */
  getFormation(): FormationId {
    return this.formation;
  }

  /** Set duty for a specific player */
  setPlayerDuty(playerIndex: number, duty: Duty): void {
    if (playerIndex < 0 || playerIndex >= 11) return;
    this.duties[playerIndex] = duty;
    this.dutyPopup = null;
    this.render();
  }

  /**
   * Returns the current tactical config suitable for passing to SimulationEngine.
   * Formation is returned as the FormationId if positions match the template,
   * otherwise as a Vec2[] (custom dragged positions).
   */
  getTacticalConfig(): TacticalConfig {
    // Check if current positions match the template (within tolerance)
    const template = FORMATION_TEMPLATES[this.formation];
    const isCustom = this.positions.some((pos, i) => {
      const base = template.basePositions[i]!;
      const dx = pos.x - base.x;
      const dy = pos.y - base.y;
      return Math.sqrt(dx * dx + dy * dy) > 0.5;
    });

    return {
      formation: isCustom ? [...this.positions] : this.formation,
      roles: [...this.roles],
      duties: [...this.duties],
    };
  }

  /**
   * Set how many substitutions are still available.
   * Called by main.ts when the halftime tactics board is shown.
   */
  setSubsRemaining(count: number): void {
    this.subsRemaining = count;
    this.render();
  }

  /**
   * Set a bench player as "pending to come on" — the next pitch player click will queue them.
   * Pass null to cancel the pending bench selection.
   * Called by main.ts when a bench player button is clicked.
   */
  setPendingBenchPlayer(player: PlayerState | null): void {
    this.pendingBenchPlayer = player;
    this.subSelectIndex = -1;
    this.dutyPopup = null;
    this.render();
  }

  /**
   * Get the currently pending bench player (null = none selected).
   */
  getPendingBenchPlayer(): PlayerState | null {
    return this.pendingBenchPlayer;
  }

  /**
   * Cancel a pending substitution (undo) — removes the queued sub for a pitch index.
   */
  cancelSubstitution(pitchIndex: number): void {
    this.pendingSubsByPitchIndex.delete(pitchIndex);
    this.render();
  }

  /**
   * Returns the pending substitutions as { outId, inPlayer } pairs.
   * Called by main.ts at "Start 2nd Half" to apply subs to the engine.
   * outId uses the current player's id at that pitch index position.
   */
  getSubstitutions(): Array<{ outId: string; inPlayer: PlayerState }> {
    const result: Array<{ outId: string; inPlayer: PlayerState }> = [];
    for (const [pitchIndex, inPlayer] of this.pendingSubsByPitchIndex) {
      // outId: home team players are indexed 0..10 as home-0..home-10
      result.push({ outId: `home-${pitchIndex}`, inPlayer });
    }
    return result;
  }

  /**
   * Returns the set of pitch player indices that have pending subs.
   * Used by main.ts to know which bench players are "used".
   */
  getSubbedOutIndices(): Set<number> {
    return new Set(this.pendingSubsByPitchIndex.keys());
  }

  /**
   * Returns which pitch player index is currently selected for substitution, or -1.
   */
  getSubSelectIndex(): number {
    return this.subSelectIndex;
  }

  /**
   * Reset substitution state (called when a new match starts or returning to tactics from match).
   */
  resetSubstitutions(): void {
    this.pendingSubsByPitchIndex = new Map();
    this.subSelectIndex = -1;
    this.subsRemaining = 3;
    this.pendingBenchPlayer = null;
  }

  /** Show the tactics board canvas */
  show(): void {
    this.canvas.style.display = 'block';
  }

  /** Hide the tactics board canvas */
  hide(): void {
    this.canvas.style.display = 'none';
  }

  /** Render the current state to canvas */
  render(): void {
    this._recalcTransform();
    this._draw();
  }

  // ──────────────────────────────────────────────────────────
  // Formation loading
  // ──────────────────────────────────────────────────────────

  private _loadFormation(formationId: FormationId): void {
    const template = FORMATION_TEMPLATES[formationId];
    // Deep copy positions
    this.positions = template.basePositions.map(p => new Vec2(p.x, p.y));
    this.roles = template.roles.map(r => r as Role);
    // Only initialise duties on first load; preserve on formation change
    if (this.duties.length !== 11) {
      this.duties = Array(11).fill('SUPPORT') as Duty[];
    }
  }

  // ──────────────────────────────────────────────────────────
  // Coordinate transform
  // ──────────────────────────────────────────────────────────

  private _recalcTransform(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const pitchW = w - PITCH_PADDING * 2;
    const pitchH = h - PITCH_PADDING * 2;
    this.scaleX = pitchW / PITCH_W;
    this.scaleY = pitchH / PITCH_H;
    this.offsetX = PITCH_PADDING;
    this.offsetY = PITCH_PADDING;
  }

  /** Convert pitch metres to canvas pixels */
  private _p2c(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.floor(this.offsetX + x * this.scaleX),
      y: Math.floor(this.offsetY + y * this.scaleY),
    };
  }

  /** Convert canvas pixels to pitch metres */
  private _c2p(cx: number, cy: number): Vec2 {
    return new Vec2(
      (cx - this.offsetX) / this.scaleX,
      (cy - this.offsetY) / this.scaleY,
    );
  }

  // ──────────────────────────────────────────────────────────
  // Drawing
  // ──────────────────────────────────────────────────────────

  private _draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Clear
    ctx.clearRect(0, 0, w, h);

    // 2. Pitch background
    ctx.fillStyle = '#1a2f1a';
    ctx.fillRect(0, 0, w, h);

    // 3. Green pitch area
    const tl = this._p2c(0, 0);
    const br = this._p2c(PITCH_W, PITCH_H);
    ctx.fillStyle = '#2d8a4e';
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // 4. Pitch outline
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // 5. Halfway line
    const halfX = this._p2c(PITCH_W / 2, 0);
    const halfXB = this._p2c(PITCH_W / 2, PITCH_H);
    ctx.beginPath();
    ctx.moveTo(halfX.x, halfX.y);
    ctx.lineTo(halfXB.x, halfXB.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 6. Zone guide lines (DEF and ATT boundaries from home perspective)
    this._drawZoneGuideLine(DEF_ZONE_X, 'DEF');
    this._drawZoneGuideLine(ATT_ZONE_X, 'ATT');

    // 7. Penalty areas (faint)
    this._drawPenaltyAreas();

    // 8. Players
    for (let i = 0; i < 11; i++) {
      this._drawPlayer(i);
    }

    // 9. Pending bench pick overlay — prompt user to click a player
    if (this.pendingBenchPlayer !== null) {
      const ctx2 = this.ctx;
      ctx2.save();
      ctx2.fillStyle = 'rgba(251, 146, 60, 0.12)';
      ctx2.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      ctx2.font = 'bold 12px monospace';
      ctx2.fillStyle = 'rgba(251, 146, 60, 0.9)';
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'top';
      const inName = this.pendingBenchPlayer.name ?? this.pendingBenchPlayer.id;
      ctx2.fillText(`Click player to sub off for ${inName}`, w / 2, tl.y + 4);
      ctx2.restore();
    }

    // 10. Duty popup (on top)
    if (this.dutyPopup !== null) {
      this._drawDutyPopup(this.dutyPopup);
    }
  }

  private _drawZoneGuideLine(pitchX: number, label: string): void {
    const ctx = this.ctx;
    const top = this._p2c(pitchX, 0);
    const bot = this._p2c(pitchX, PITCH_H);

    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bot.x, bot.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label at top
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = GUIDE_LABEL_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, top.x, top.y - 2);
    ctx.restore();
  }

  private _drawPenaltyAreas(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;

    // Left penalty area (home side)
    const lTL = this._p2c(0, (PITCH_H - 40.32) / 2);
    const lBR = this._p2c(16.5, (PITCH_H + 40.32) / 2);
    ctx.strokeRect(lTL.x, lTL.y, lBR.x - lTL.x, lBR.y - lTL.y);

    // Right penalty area (away side)
    const rTL = this._p2c(PITCH_W - 16.5, (PITCH_H - 40.32) / 2);
    const rBR = this._p2c(PITCH_W, (PITCH_H + 40.32) / 2);
    ctx.strokeRect(rTL.x, rTL.y, rBR.x - rTL.x, rBR.y - rTL.y);
  }

  private _drawPlayer(i: number): void {
    const ctx = this.ctx;
    const pos = this.positions[i]!;
    const c = this._p2c(pos.x, pos.y);
    const role = this.roles[i]!;
    const duty = this.duties[i] ?? 'SUPPORT';
    const isGK = role === 'GK';
    const isSelected = this.selectedIndex === i;
    const isSubbedOut = this.pendingSubsByPitchIndex.has(i);
    const isSubSelectTarget = this.subSelectIndex === i;
    const inPlayer = this.pendingSubsByPitchIndex.get(i);

    ctx.save();
    if (isSubbedOut) {
      ctx.globalAlpha = 0.38;
    }

    // Highlight ring for selected player (duty selection)
    if (isSelected && !isSubbedOut) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, PLAYER_RADIUS + 5, 0, Math.PI * 2);
      ctx.strokeStyle = PLAYER_SELECTED_COLOR;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Orange ring for player selected for substitution
    if (isSubSelectTarget) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, PLAYER_RADIUS + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Player dot
    ctx.beginPath();
    ctx.arc(c.x, c.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isGK ? PLAYER_GK_COLOR : (isSubbedOut ? '#475569' : PLAYER_COLOR);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shirt number
    ctx.font = SHIRT_FONT;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), c.x, c.y + 1);

    // Role label below dot (show incoming player name if subbed)
    ctx.font = ROLE_FONT;
    ctx.fillStyle = isSubbedOut ? 'rgba(251, 146, 60, 0.9)' : 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (isSubbedOut && inPlayer) {
      ctx.fillText((inPlayer.name ?? inPlayer.id).split(' ').pop() ?? role, c.x, c.y + PLAYER_RADIUS + 3);
    } else {
      ctx.fillText(role, c.x, c.y + PLAYER_RADIUS + 3);
    }

    ctx.restore();

    // Duty indicator (only for non-subbed-out players)
    if (!isSubbedOut) {
      this._drawDutyIndicator(c.x, c.y, duty);
    }
  }

  private _drawDutyIndicator(cx: number, cy: number, duty: Duty): void {
    const ctx = this.ctx;
    if (duty === 'ATTACK') {
      // Small upward arrow (triangle above player)
      const ax = cx;
      const ay = cy - PLAYER_RADIUS - 8;
      ctx.save();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(ax, ay - 5);
      ctx.lineTo(ax - 4, ay + 1);
      ctx.lineTo(ax + 4, ay + 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (duty === 'DEFEND') {
      // Small shield (downward triangle below player) — draw to left of role label
      const sx = cx - PLAYER_RADIUS - 4;
      const sy = cy;
      ctx.save();
      ctx.fillStyle = '#93c5fd';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // SUPPORT: no indicator
  }

  private _drawDutyPopup(popup: DutyPopup): void {
    const ctx = this.ctx;
    const btnW = 64;
    const btnH = 24;
    const gap = 4;
    const totalW = btnW * 3 + gap * 2;
    const totalH = btnH;
    const padding = 8;
    const boxW = totalW + padding * 2;
    const boxH = totalH + padding * 2;

    // Position popup near the player dot, clamped to canvas
    let px = popup.canvasX - boxW / 2;
    let py = popup.canvasY - PLAYER_RADIUS - boxH - 8;
    px = Math.max(4, Math.min(this.canvas.width - boxW - 4, px));
    py = Math.max(4, Math.min(this.canvas.height - boxH - 4, py));

    // Background
    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 30, 0.95)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    this._roundRect(ctx, px, py, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    // Buttons
    const duties: { duty: Duty; label: string; color: string }[] = [
      { duty: 'DEFEND', label: 'Defend', color: '#93c5fd' },
      { duty: 'SUPPORT', label: 'Support', color: '#6ee7b7' },
      { duty: 'ATTACK', label: 'Attack', color: '#fde68a' },
    ];

    const currentDuty = this.duties[popup.playerIndex] ?? 'SUPPORT';

    for (let i = 0; i < 3; i++) {
      const item = duties[i]!;
      const bx = px + padding + i * (btnW + gap);
      const by = py + padding;
      const isActive = item.duty === currentDuty;

      ctx.fillStyle = isActive ? 'rgba(30, 64, 175, 0.9)' : 'rgba(30, 41, 59, 0.9)';
      ctx.strokeStyle = isActive ? '#3b82f6' : '#475569';
      ctx.lineWidth = 1;
      this._roundRect(ctx, bx, by, btnW, btnH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = item.color;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, bx + btnW / 2, by + btnH / 2);
    }

    ctx.restore();
  }

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ──────────────────────────────────────────────────────────
  // Hit testing
  // ──────────────────────────────────────────────────────────

  private _hitTestPlayer(canvasX: number, canvasY: number): number {
    for (let i = 0; i < 11; i++) {
      const pos = this.positions[i]!;
      const c = this._p2c(pos.x, pos.y);
      const dx = canvasX - c.x;
      const dy = canvasY - c.y;
      if (Math.sqrt(dx * dx + dy * dy) <= PLAYER_RADIUS + 4) return i;
    }
    return -1;
  }

  /** Hit test duty popup buttons. Returns the Duty clicked, or null. */
  private _hitTestDutyPopup(canvasX: number, canvasY: number): Duty | null {
    if (!this.dutyPopup) return null;

    const popup = this.dutyPopup;
    const btnW = 64;
    const btnH = 24;
    const gap = 4;
    const totalW = btnW * 3 + gap * 2;
    const padding = 8;
    const boxW = totalW + padding * 2;
    const boxH = btnH + padding * 2;

    let px = popup.canvasX - boxW / 2;
    let py = popup.canvasY - PLAYER_RADIUS - boxH - 8;
    px = Math.max(4, Math.min(this.canvas.width - boxW - 4, px));
    py = Math.max(4, Math.min(this.canvas.height - boxH - 4, py));

    const duties: Duty[] = ['DEFEND', 'SUPPORT', 'ATTACK'];
    for (let i = 0; i < 3; i++) {
      const bx = px + padding + i * (btnW + gap);
      const by = py + padding;
      if (canvasX >= bx && canvasX <= bx + btnW && canvasY >= by && canvasY <= by + btnH) {
        return duties[i]!;
      }
    }

    return null;
  }

  // ──────────────────────────────────────────────────────────
  // Event handling
  // ──────────────────────────────────────────────────────────

  private _getCanvasPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0]!.clientX;
      clientY = e.touches[0]!.clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }
    // Scale for device pixel ratio / canvas size vs display size
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private _bindEvents(): void {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      const { x, y } = this._getCanvasPos(e);
      this._onPointerDown(x, y);
    });

    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.draggingIndex >= 0) {
        const { x, y } = this._getCanvasPos(e);
        this._onPointerMove(x, y);
      }
    });

    canvas.addEventListener('mouseup', (e: MouseEvent) => {
      const { x, y } = this._getCanvasPos(e);
      this._onPointerUp(x, y);
    });

    canvas.addEventListener('mouseleave', () => {
      if (this.draggingIndex >= 0) {
        this._finalizeDrag();
      }
    });

    // Touch events
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const { x, y } = this._getCanvasPos(e);
      this._onPointerDown(x, y);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      if (this.draggingIndex >= 0) {
        const { x, y } = this._getCanvasPos(e);
        this._onPointerMove(x, y);
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const x = touch ? (touch.clientX - rect.left) * scaleX : 0;
      const y = touch ? (touch.clientY - rect.top) * scaleY : 0;
      this._onPointerUp(x, y);
    }, { passive: false });
  }

  private _onPointerDown(canvasX: number, canvasY: number): void {
    // If a bench player is pending, clicking a pitch player queues the substitution
    if (this.pendingBenchPlayer !== null) {
      const idx = this._hitTestPlayer(canvasX, canvasY);
      if (idx >= 0 && !this.pendingSubsByPitchIndex.has(idx) && this.subsRemaining > 0) {
        this.pendingSubsByPitchIndex.set(idx, this.pendingBenchPlayer);
        this.subSelectIndex = -1;
        this.pendingBenchPlayer = null;
        this.render();
        // Notify main.ts that a substitution was queued (via callback if registered)
        this._onSubstitutionQueued?.(idx);
        return;
      }
      // Clicked on empty or already-subbed player — cancel bench selection
      this.pendingBenchPlayer = null;
      this.render();
      return;
    }

    // If duty popup is open, check for button clicks
    if (this.dutyPopup !== null) {
      const duty = this._hitTestDutyPopup(canvasX, canvasY);
      if (duty !== null) {
        this.setPlayerDuty(this.dutyPopup.playerIndex, duty);
        return;
      }
      // Clicked outside popup — close it
      this.dutyPopup = null;
      this.selectedIndex = -1;
      this.render();
      return;
    }

    const idx = this._hitTestPlayer(canvasX, canvasY);
    if (idx >= 0) {
      this.draggingIndex = idx;
      this.dragStartMoved = false;
    } else {
      // Clicked on empty pitch — deselect
      this.selectedIndex = -1;
      this.render();
    }
  }

  private _onPointerMove(canvasX: number, canvasY: number): void {
    if (this.draggingIndex < 0) return;
    this.dragStartMoved = true;

    // Convert to pitch coordinates, clamped to pitch
    const pitchPos = this._c2p(canvasX, canvasY);
    const clampedX = Math.max(1, Math.min(PITCH_W - 1, pitchPos.x));
    const clampedY = Math.max(1, Math.min(PITCH_H - 1, pitchPos.y));
    this.positions[this.draggingIndex] = new Vec2(clampedX, clampedY);

    this.render();
  }

  private _onPointerUp(_canvasX: number, _canvasY: number): void {
    if (this.draggingIndex < 0) return;

    if (!this.dragStartMoved) {
      // This was a click (no drag movement) — open duty popup
      this.selectedIndex = this.draggingIndex;
      const pos = this.positions[this.draggingIndex]!;
      const c = this._p2c(pos.x, pos.y);
      this.dutyPopup = {
        playerIndex: this.draggingIndex,
        canvasX: c.x,
        canvasY: c.y,
      };
      this.draggingIndex = -1;
      this.render();
      return;
    }

    // Drag ended — update role based on new position
    this._finalizeDrag();
  }

  private _finalizeDrag(): void {
    if (this.draggingIndex < 0) return;
    const idx = this.draggingIndex;
    this.draggingIndex = -1;
    // Auto-assign role based on final position (home team perspective)
    this.roles[idx] = autoAssignRole(this.positions[idx]!, 'home');
    this.render();
  }
}

// Re-export DUTY_VALUES for test use
export { DUTY_VALUES };
