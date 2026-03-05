import { Vec2 } from '../simulation/math/vec2.ts';
import type { FormationId, Role, Duty, PlayerState } from '../simulation/types.ts';
import { FORMATION_TEMPLATES, autoAssignRole } from '../simulation/tactical/formation.ts';
import type { TacticalConfig } from '../simulation/engine.ts';
import { SNAP_BANDS, BAND_LABELS, GK_FIXED_X, nearestBandIndex, snapToNearestBand, computeFormationString, snapPositions } from './snapGrid.ts';

// ============================================================
// Pitch dimensions (matches simulation constants)
// ============================================================

const PITCH_W = 105;
const PITCH_H = 68;

// Rendering constants
const PITCH_PADDING = 20; // canvas pixels of padding around pitch (must match CanvasRenderer)
const PLAYER_RADIUS = 14; // canvas pixels — larger than match view for easy clicking
const SHIRT_FONT = 'bold 11px sans-serif';
const ROLE_FONT = '9px monospace';

// Colors
const PLAYER_COLOR = '#3366cc';
const PLAYER_GK_COLOR = '#66cc99';
const PLAYER_SELECTED_COLOR = '#60a5fa';

// ============================================================
// Duty type — can reference from types but import directly
// ============================================================

const DUTY_VALUES: readonly Duty[] = ['DEFEND', 'SUPPORT', 'ATTACK'];

// ============================================================
// Dual phase state
// ============================================================

export type TacticsPhase = 'inPossession' | 'outOfPossession';

interface PhaseState {
  positions: Vec2[];
  roles: Role[];
  duties: Duty[];
}

// ============================================================
// TacticsBoard
// ============================================================

/**
 * TacticsBoard renders a portrait-oriented pitch diagram with 11 draggable player dots.
 * Own goal at bottom, opponent goal at top.
 *
 * Features:
 * - Snap-grid drag-and-drop: players snap vertically to horizontal depth bands,
 *   free horizontal positioning within each band.
 * - Quick-shape presets (via applyPresetPositions) as starting points
 * - In-possession / out-of-possession dual formations (via setPhase)
 * - Snap band guide lines with zone labels
 * - Live formation string display (e.g. "4-1-2-1-1")
 * - Per-player duty picker popup (click to select Defend/Support/Attack)
 *
 * Works without DOM if constructed with a mock canvas context (unit-testable).
 */
export class TacticsBoard {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  // Coordinate transform (pitch metres -> canvas pixels)
  // Landscape: pitchX → canvasX, pitchY → canvasY (same as match renderer)
  private scaleX: number = 1; // canvas X pixels per pitch X metre
  private scaleY: number = 1; // canvas Y pixels per pitch Y metre
  private offsetX: number = 0;
  private offsetY: number = 0;

  // Active formation state (working copy of current phase)
  private positions: Vec2[] = [];
  private roles: Role[] = [];
  private duties: Duty[] = [];

  // Dual phase storage
  private phases: Record<TacticsPhase, PhaseState>;
  private currentPhase: TacticsPhase = 'inPossession';

  // Per-player freedom values for radius overlay (synced from TacticsOverlay)
  private freedomValues: number[] = Array(11).fill(0.5) as number[];

  // Drag state
  private draggingIndex: number = -1;
  private dragStartMoved = false;
  private highlightedBand: number = -1;

  // Selection state
  private selectedIndex: number = -1;

  // Callbacks
  private _onPlayerSelectedCb: ((index: number) => void) | null = null;
  private _onConfigChangedCb: (() => void) | null = null;

  // Bench / substitution state
  private subsRemaining: number = 3;
  private pendingSubsByPitchIndex: Map<number, PlayerState> = new Map();
  private subSelectIndex: number = -1;
  private pendingBenchPlayer: PlayerState | null = null;
  _onSubstitutionQueued: ((pitchIndex: number) => void) | undefined = undefined;

  // ──────────────────────────────────────────────────────────
  // Construction
  // ──────────────────────────────────────────────────────────

  constructor(canvas: HTMLCanvasElement, initialFormation: FormationId = '4-4-2') {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('TacticsBoard: cannot get 2D context from canvas');
    this.ctx = ctx;

    this._loadFormationTemplate(initialFormation);

    // Initialize both phases with the same formation
    const makePhase = (): PhaseState => ({
      positions: this.positions.map(p => new Vec2(p.x, p.y)),
      roles: [...this.roles],
      duties: [...this.duties],
    });
    this.phases = {
      inPossession: makePhase(),
      outOfPossession: makePhase(),
    };

    this._recalcTransform();
    this._bindEvents();
    this.render();
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────

  /** Apply a preset formation shape — snaps positions to bands, preserves duties */
  applyPresetPositions(formationId: FormationId): void {
    this._loadFormationTemplate(formationId);
    this.selectedIndex = -1;
    this._saveCurrentPhase();
    this.render();
    this._onConfigChangedCb?.();
  }

  /** Register callback for player selection (short click) */
  onPlayerSelected(cb: (index: number) => void): void {
    this._onPlayerSelectedCb = cb;
  }

  /** Register callback for config changes (drag complete, duty change, etc.) */
  onConfigChanged(cb: () => void): void {
    this._onConfigChangedCb = cb;
  }

  /** Resize the canvas buffer and re-render */
  resizeCanvas(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this._recalcTransform();
    this.render();
  }

  /** Update duties from external source (e.g. TacticsOverlay) for visual rendering */
  setDuties(duties: Duty[]): void {
    this.duties = [...duties];
    this.render();
  }

  /** Get the auto-computed formation string (e.g. "4-1-2-1-1") */
  getFormationString(): string {
    return computeFormationString(this.positions);
  }

  /** Get formation string for a specific phase */
  getFormationStringForPhase(phase: TacticsPhase): string {
    return computeFormationString(this.phases[phase].positions);
  }

  /** Set duty for a specific player */
  setPlayerDuty(playerIndex: number, duty: Duty): void {
    if (playerIndex < 0 || playerIndex >= 11) return;
    this.duties[playerIndex] = duty;
    this.render();
  }

  /**
   * Returns the in-possession tactical config.
   * Saves current working state first to ensure latest edits are captured.
   */
  getTacticalConfig(): TacticalConfig {
    this._saveCurrentPhase();
    return this._buildConfig(this.phases.inPossession);
  }

  /**
   * Returns the out-of-possession tactical config.
   * Saves current working state first to ensure latest edits are captured.
   */
  getOutOfPossessionConfig(): TacticalConfig {
    this._saveCurrentPhase();
    return this._buildConfig(this.phases.outOfPossession);
  }

  /** Get the currently active editing phase */
  getCurrentPhase(): TacticsPhase {
    return this.currentPhase;
  }

  /** Update per-player freedom values for radius overlay */
  setFreedomValues(values: number[]): void {
    this.freedomValues = values.slice(0, 11);
    this.render();
  }


  /**
   * Switch between in-possession and out-of-possession editing.
   * Saves current state and loads the target phase.
   */
  setPhase(phase: TacticsPhase): void {
    if (phase === this.currentPhase) return;
    this._saveCurrentPhase();
    this.currentPhase = phase;
    this._loadPhase(phase);
    this.selectedIndex = -1;
    this.render();
  }

  /**
   * Set how many substitutions are still available.
   */
  setSubsRemaining(count: number): void {
    this.subsRemaining = count;
    this.render();
  }

  setPendingBenchPlayer(player: PlayerState | null): void {
    this.pendingBenchPlayer = player;
    this.subSelectIndex = -1;
    this.render();
  }

  getPendingBenchPlayer(): PlayerState | null {
    return this.pendingBenchPlayer;
  }

  /** Queue a substitution: replace pitch player at index with bench player */
  queueSubstitution(pitchIndex: number, benchPlayer: PlayerState): void {
    if (this.pendingSubsByPitchIndex.has(pitchIndex)) return;
    this.pendingSubsByPitchIndex.set(pitchIndex, benchPlayer);
  }

  cancelSubstitution(pitchIndex: number): void {
    this.pendingSubsByPitchIndex.delete(pitchIndex);
    this.render();
  }

  getSubstitutions(): Array<{ outId: string; inPlayer: PlayerState }> {
    const result: Array<{ outId: string; inPlayer: PlayerState }> = [];
    for (const [pitchIndex, inPlayer] of this.pendingSubsByPitchIndex) {
      result.push({ outId: `home-${pitchIndex}`, inPlayer });
    }
    return result;
  }

  getSubbedOutIndices(): Set<number> {
    return new Set(this.pendingSubsByPitchIndex.keys());
  }

  getSubSelectIndex(): number {
    return this.subSelectIndex;
  }

  resetSubstitutions(): void {
    this.pendingSubsByPitchIndex = new Map();
    this.subSelectIndex = -1;
    this.subsRemaining = 3;
    this.pendingBenchPlayer = null;
  }

  show(): void {
    this.canvas.style.display = 'block';
  }

  hide(): void {
    this.canvas.style.display = 'none';
  }

  render(): void {
    this._recalcTransform();
    this._draw();
  }

  // ──────────────────────────────────────────────────────────
  // Phase state accessors (for save/load tactics)
  // ──────────────────────────────────────────────────────────

  /** Get positions for a specific phase (saves working state first) */
  getPhasePositions(phase: TacticsPhase): Vec2[] {
    this._saveCurrentPhase();
    return this.phases[phase].positions.map(p => new Vec2(p.x, p.y));
  }

  /** Get roles for a specific phase */
  getPhaseRoles(phase: TacticsPhase): Role[] {
    this._saveCurrentPhase();
    return [...this.phases[phase].roles];
  }

  /** Get duties for a specific phase */
  getPhaseDuties(phase: TacticsPhase): Duty[] {
    this._saveCurrentPhase();
    return [...this.phases[phase].duties];
  }

  /** Load full state for a specific phase (used by tactic loader) */
  loadPhaseState(phase: TacticsPhase, positions: Vec2[], roles: Role[], duties: Duty[]): void {
    this.phases[phase] = {
      positions: positions.map(p => new Vec2(p.x, p.y)),
      roles: [...roles],
      duties: [...duties],
    };
    // If this is the active editing phase, also update working copy
    if (phase === this.currentPhase) {
      this._loadPhase(phase);
      this.selectedIndex = -1;
      this.render();
    }
  }

  // ──────────────────────────────────────────────────────────
  // Phase state management
  // ──────────────────────────────────────────────────────────

  private _saveCurrentPhase(): void {
    this.phases[this.currentPhase] = {
      positions: this.positions.map(p => new Vec2(p.x, p.y)),
      roles: [...this.roles],
      duties: [...this.duties],
    };
  }

  private _loadPhase(phase: TacticsPhase): void {
    const state = this.phases[phase];
    this.positions = state.positions.map(p => new Vec2(p.x, p.y));
    this.roles = [...state.roles];
    this.duties = [...state.duties];
  }

  private _buildConfig(state: PhaseState): TacticalConfig {
    return {
      formation: state.positions.map(p => new Vec2(p.x, p.y)),
      roles: [...state.roles],
      duties: [...state.duties],
    };
  }

  // ──────────────────────────────────────────────────────────
  // Formation loading
  // ──────────────────────────────────────────────────────────

  private _loadFormationTemplate(formationId: FormationId): void {
    const template = FORMATION_TEMPLATES[formationId];
    this.positions = snapPositions(
      template.basePositions.map(p => new Vec2(p.x, p.y)),
    );
    this.roles = template.roles.map(r => r as Role);
    if (this.duties.length !== 11) {
      this.duties = Array(11).fill('SUPPORT') as Duty[];
    }
  }

  // ──────────────────────────────────────────────────────────
  // Coordinate transform (landscape orientation)
  //
  // Landscape mapping (same as match renderer):
  //   pitchX (0..105, goal-to-goal) → canvasX (left..right)
  //   pitchY (0..68, side-to-side) → canvasY (top..bottom)
  //
  // Own goal (pitchX=0) is at the LEFT of the canvas.
  // Opponent goal (pitchX=105) is at the RIGHT.
  // ──────────────────────────────────────────────────────────

  private _recalcTransform(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const drawW = w - PITCH_PADDING * 2;
    const drawH = h - PITCH_PADDING * 2;
    this.scaleX = drawW / PITCH_W; // canvas X per pitch X
    this.scaleY = drawH / PITCH_H; // canvas Y per pitch Y
    this.offsetX = PITCH_PADDING;
    this.offsetY = PITCH_PADDING;
  }

  /** Convert pitch metres to canvas pixels (landscape) */
  private _p2c(pitchX: number, pitchY: number): { x: number; y: number } {
    return {
      x: Math.floor(this.offsetX + pitchX * this.scaleX),
      y: Math.floor(this.offsetY + pitchY * this.scaleY),
    };
  }

  /** Convert canvas pixels to pitch metres (landscape) */
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

    // 3. Green pitch area — use corners to get correct portrait bounds
    const bl = this._p2c(0, 0);     // bottom-left (own goal, left side)
    const tr = this._p2c(PITCH_W, PITCH_H); // top-right (opp goal, right side)
    const pitchLeft = Math.min(bl.x, tr.x);
    const pitchTop = Math.min(bl.y, tr.y);
    const pitchRight = Math.max(bl.x, tr.x);
    const pitchBottom = Math.max(bl.y, tr.y);

    ctx.fillStyle = '#2d8a4e';
    ctx.fillRect(pitchLeft, pitchTop, pitchRight - pitchLeft, pitchBottom - pitchTop);

    // 4. Pitch outline
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pitchLeft, pitchTop, pitchRight - pitchLeft, pitchBottom - pitchTop);

    // 5. Halfway line (horizontal in portrait)
    const halfL = this._p2c(PITCH_W / 2, 0);
    const halfR = this._p2c(PITCH_W / 2, PITCH_H);
    ctx.beginPath();
    ctx.moveTo(halfL.x, halfL.y);
    ctx.lineTo(halfR.x, halfR.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 6. Snap band guide lines
    for (let b = 0; b < SNAP_BANDS.length; b++) {
      this._drawSnapBand(b, b === this.highlightedBand);
    }

    // 7. Penalty areas
    this._drawPenaltyAreas();

    // 8. Phase label (subtle indicator of which phase is being edited)
    ctx.save();
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = this.currentPhase === 'inPossession'
      ? 'rgba(96, 165, 250, 0.5)'
      : 'rgba(251, 146, 60, 0.5)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(
      this.currentPhase === 'inPossession' ? 'IN POSSESSION' : 'OUT OF POSSESSION',
      w / 2,
      this.offsetY + 6,
    );
    ctx.restore();

    // 8.1. Formation string display
    ctx.save();
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(computeFormationString(this.positions), w / 2, this.offsetY + 20);
    ctx.restore();

    // 8.5. Ghost phase positions — show the OTHER phase's positions as faint ghosts
    if (this.pendingBenchPlayer === null) {
      const otherPhase: TacticsPhase = this.currentPhase === 'inPossession' ? 'outOfPossession' : 'inPossession';
      const otherState = this.phases[otherPhase];
      if (otherState) {
        const ghostFill = this.currentPhase === 'inPossession'
          ? 'rgba(251, 146, 60, 0.15)'   // orange ghosts when editing blue phase
          : 'rgba(96, 165, 250, 0.15)';  // blue ghosts when editing orange phase
        const lineColor = this.currentPhase === 'inPossession'
          ? 'rgba(251, 146, 60, 0.10)'
          : 'rgba(96, 165, 250, 0.10)';

        for (let i = 0; i < 11; i++) {
          const ghostPos = otherState.positions[i];
          if (!ghostPos) continue;
          const currentPos = this.positions[i]!;
          const gc = this._p2c(ghostPos.x, ghostPos.y);
          const cc = this._p2c(currentPos.x, currentPos.y);

          // Only draw if positions differ noticeably (>3m)
          const dx = ghostPos.x - currentPos.x;
          const dy = ghostPos.y - currentPos.y;
          if (Math.sqrt(dx * dx + dy * dy) < 3) continue;

          ctx.save();
          // Dashed connecting line
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gc.x, gc.y);
          ctx.lineTo(cc.x, cc.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Ghost circle (smaller, non-interactive)
          ctx.beginPath();
          ctx.arc(gc.x, gc.y, 10, 0, Math.PI * 2);
          ctx.fillStyle = ghostFill;
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // 9. Players
    for (let i = 0; i < 11; i++) {
      this._drawPlayer(i);
    }

    // 10. Pending bench pick overlay
    if (this.pendingBenchPlayer !== null) {
      ctx.save();
      ctx.fillStyle = 'rgba(251, 146, 60, 0.12)';
      ctx.fillRect(pitchLeft, pitchTop, pitchRight - pitchLeft, pitchBottom - pitchTop);
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = 'rgba(251, 146, 60, 0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const inName = this.pendingBenchPlayer.name ?? this.pendingBenchPlayer.id;
      ctx.fillText(`Click player to sub off for ${inName}`, w / 2, pitchBottom - 4);
      ctx.restore();
    }
  }

  private _drawSnapBand(bandIndex: number, highlighted: boolean): void {
    const ctx = this.ctx;
    const pitchX = SNAP_BANDS[bandIndex]!;
    const label = BAND_LABELS[bandIndex]!;
    const top = this._p2c(pitchX, 0);
    const bottom = this._p2c(pitchX, PITCH_H);

    ctx.save();
    ctx.setLineDash(highlighted ? [8, 4] : [4, 8]);
    ctx.strokeStyle = highlighted
      ? 'rgba(96, 165, 250, 0.45)'
      : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = highlighted ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label at top of vertical line
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = highlighted
      ? 'rgba(96, 165, 250, 0.7)'
      : 'rgba(255, 255, 255, 0.2)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, top.x, top.y - 4);
    ctx.restore();
  }

  private _drawPenaltyAreas(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;

    // Home penalty area (bottom — own goal)
    const hTL = this._p2c(0, (PITCH_H - 40.32) / 2);
    const hBR = this._p2c(16.5, (PITCH_H + 40.32) / 2);
    const hx = Math.min(hTL.x, hBR.x);
    const hy = Math.min(hTL.y, hBR.y);
    ctx.strokeRect(hx, hy, Math.abs(hBR.x - hTL.x), Math.abs(hBR.y - hTL.y));

    // Away penalty area (top — opponent goal)
    const aTL = this._p2c(PITCH_W - 16.5, (PITCH_H - 40.32) / 2);
    const aBR = this._p2c(PITCH_W, (PITCH_H + 40.32) / 2);
    const ax = Math.min(aTL.x, aBR.x);
    const ay = Math.min(aTL.y, aBR.y);
    ctx.strokeRect(ax, ay, Math.abs(aBR.x - aTL.x), Math.abs(aBR.y - aTL.y));
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

    // Freedom radius overlay (drawn behind player circle)
    if (!isSubbedOut) {
      const freedom = this.freedomValues[i] ?? 0.5;
      const freedomRadiusM = 3 + freedom * 19; // 3m (hold) → 22m (roam)
      const freedomRadiusPx = Math.max(0, freedomRadiusM * Math.min(this.scaleX, this.scaleY));
      const phaseR = this.currentPhase === 'inPossession' ? 96 : 251;
      const phaseG = this.currentPhase === 'inPossession' ? 165 : 146;
      const phaseB = this.currentPhase === 'inPossession' ? 250 : 60;

      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, freedomRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${phaseR}, ${phaseG}, ${phaseB}, 0.06)`;
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = `rgba(${phaseR}, ${phaseG}, ${phaseB}, 0.2)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.save();
    if (isSubbedOut) {
      ctx.globalAlpha = 0.38;
    }

    if (isSelected && !isSubbedOut) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, PLAYER_RADIUS + 5, 0, Math.PI * 2);
      ctx.strokeStyle = PLAYER_SELECTED_COLOR;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    if (isSubSelectTarget) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, PLAYER_RADIUS + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(c.x, c.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isGK ? PLAYER_GK_COLOR : (isSubbedOut ? '#475569' : PLAYER_COLOR);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = SHIRT_FONT;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), c.x, c.y + 1);

    // Role label below the dot
    ctx.font = ROLE_FONT;
    ctx.fillStyle = isSubbedOut ? 'rgba(251, 146, 60, 0.9)' : 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (isSubbedOut && inPlayer) {
      ctx.fillText((inPlayer.name ?? inPlayer.id).split(' ').pop() ?? role, c.x, c.y + PLAYER_RADIUS + 2);
    } else {
      ctx.fillText(role, c.x, c.y + PLAYER_RADIUS + 2);
    }

    ctx.restore();

    if (!isSubbedOut) {
      this._drawDutyIndicator(c.x, c.y, duty);
    }
  }

  private _drawDutyIndicator(cx: number, cy: number, duty: Duty): void {
    const ctx = this.ctx;
    if (duty === 'ATTACK') {
      // Small rightward arrow (toward opponent goal = toward right of canvas)
      const ax = cx + PLAYER_RADIUS + 8;
      const ay = cy;
      ctx.save();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(ax + 5, ay);
      ctx.lineTo(ax - 1, ay - 4);
      ctx.lineTo(ax - 1, ay + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (duty === 'DEFEND') {
      // Small shield dot to the left of player (toward own goal)
      const sx = cx - PLAYER_RADIUS - 4;
      const sy = cy;
      ctx.save();
      ctx.fillStyle = '#93c5fd';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
        canvas.classList.add('active-drag');
        const { x, y } = this._getCanvasPos(e);
        this._onPointerMove(x, y);
      }
    });

    canvas.addEventListener('mouseup', (e: MouseEvent) => {
      canvas.classList.remove('active-drag');
      const { x, y } = this._getCanvasPos(e);
      this._onPointerUp(x, y);
    });

    canvas.addEventListener('mouseleave', () => {
      canvas.classList.remove('active-drag');
      if (this.draggingIndex >= 0) {
        this._finalizeDrag();
      }
    });

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
    if (this.pendingBenchPlayer !== null) {
      const idx = this._hitTestPlayer(canvasX, canvasY);
      if (idx >= 0 && !this.pendingSubsByPitchIndex.has(idx) && this.subsRemaining > 0) {
        this.pendingSubsByPitchIndex.set(idx, this.pendingBenchPlayer);
        this.subSelectIndex = -1;
        this.pendingBenchPlayer = null;
        this.render();
        this._onSubstitutionQueued?.(idx);
        return;
      }
      this.pendingBenchPlayer = null;
      this.render();
      return;
    }

    const idx = this._hitTestPlayer(canvasX, canvasY);
    if (idx >= 0) {
      this.draggingIndex = idx;
      this.dragStartMoved = false;
    } else {
      this.selectedIndex = -1;
      this._onPlayerSelectedCb?.(-1);
      this.render();
    }
  }

  private _onPointerMove(canvasX: number, canvasY: number): void {
    if (this.draggingIndex < 0) return;
    this.dragStartMoved = true;

    const pitchPos = this._c2p(canvasX, canvasY);
    const clampedY = Math.max(1, Math.min(PITCH_H - 1, pitchPos.y));

    if (this.draggingIndex === 0) {
      // GK: fixed at GK_FIXED_X, only allow horizontal (y) movement
      this.positions[0] = new Vec2(GK_FIXED_X, clampedY);
      this.highlightedBand = -1;
    } else {
      // Outfield: free during drag, highlight nearest band
      const clampedX = Math.max(SNAP_BANDS[0]! - 5, Math.min(SNAP_BANDS[SNAP_BANDS.length - 1]! + 5, pitchPos.x));
      this.positions[this.draggingIndex] = new Vec2(clampedX, clampedY);
      this.highlightedBand = nearestBandIndex(clampedX);
    }

    this.render();
  }

  private _onPointerUp(_canvasX: number, _canvasY: number): void {
    if (this.draggingIndex < 0) return;

    if (!this.dragStartMoved) {
      // Short click — select player and notify
      this.selectedIndex = this.draggingIndex;
      this.draggingIndex = -1;
      this._onPlayerSelectedCb?.(this.selectedIndex);
      this.render();
      return;
    }

    this._finalizeDrag();
  }

  private _finalizeDrag(): void {
    if (this.draggingIndex < 0) return;
    const idx = this.draggingIndex;
    this.draggingIndex = -1;
    this.highlightedBand = -1;

    if (idx > 0) {
      // Snap outfield player to nearest band
      const pos = this.positions[idx]!;
      this.positions[idx] = new Vec2(snapToNearestBand(pos.x), pos.y);
    }

    this.roles[idx] = autoAssignRole(this.positions[idx]!, 'home');
    this._saveCurrentPhase();
    this.render();
    this._onConfigChangedCb?.();
  }
}

// Re-export DUTY_VALUES for test use
export { DUTY_VALUES };
