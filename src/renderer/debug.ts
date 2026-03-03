import type { SimSnapshot, PlayerState } from '../simulation/types.ts';
import type { DecisionLog, AgentDecisionEntry } from '../simulation/ai/decisionLog.ts';

// ============================================================
// Debug overlay constants
// ============================================================

const INSPECT_RADIUS_PX = 15; // click detection radius in canvas pixels
const HIGHLIGHT_RADIUS = 10;  // yellow highlight ring radius in canvas pixels
const HIGHLIGHT_COLOR = '#ffff00';
const HIGHLIGHT_LINE_WIDTH = 2;

const PANEL_WIDTH = 180;
const PANEL_PADDING = 8;
const PANEL_LINE_HEIGHT = 16;
const PANEL_BG = 'rgba(0, 0, 0, 0.85)';
const TEXT_COLOR = '#ffffff';
const FONT = '12px monospace';
const FONT_SMALL = '11px monospace';

// Action bar
const BAR_SELECTED_BORDER = '#ffffff';
const BAR_HEIGHT = 10;
const BAR_MAX_WIDTH = PANEL_WIDTH - PANEL_PADDING * 2 - 60; // leave room for label

// Coordinate mapper type used by the renderer
type PitchToCanvas = (v: { x: number; y: number }) => { x: number; y: number };

// ============================================================
// DebugOverlay
// ============================================================

/**
 * Click-to-inspect debug overlay for the Canvas renderer.
 *
 * Usage:
 *   const overlay = new DebugOverlay(canvas, decisionLog);
 *   // In the render loop, AFTER the main renderer draw call:
 *   overlay.draw(ctx, snapshot, (v) => renderer.pitchToCanvas(v));
 *
 * Clicking on a player within INSPECT_RADIUS_PX pixels shows a panel with:
 *   - Player ID and role
 *   - Current fatigue level (bar)
 *   - Top 3 scored actions with score bars
 *   - Currently selected action highlighted
 *
 * Clicking on empty space or pressing Escape deselects the current agent.
 */
export class DebugOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly decisionLog: DecisionLog;
  private inspectedAgentId: string | null = null;

  // Cached from the last draw() call — needed for click hit testing
  private cachedSnapshot: SimSnapshot | null = null;
  private cachedPitchToCanvas: PitchToCanvas | null = null;

  constructor(canvas: HTMLCanvasElement, decisionLog: DecisionLog) {
    this.canvas = canvas;
    this.decisionLog = decisionLog;

    // Register click handler
    canvas.addEventListener('click', (e) => this.handleClick(e));

    // Register Escape key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.inspectedAgentId = null;
      }
    });
  }

  /**
   * Returns true if an agent is currently being inspected.
   */
  isActive(): boolean {
    return this.inspectedAgentId !== null;
  }

  /**
   * Draw the debug overlay onto the canvas context.
   * Call this AFTER the main renderer draw() call.
   *
   * @param ctx - Canvas 2D rendering context
   * @param snapshot - Current simulation snapshot
   * @param pitchToCanvas - Coordinate mapper from simulation metres to canvas pixels
   */
  draw(
    ctx: CanvasRenderingContext2D,
    snapshot: SimSnapshot,
    pitchToCanvas: PitchToCanvas,
  ): void {
    // Cache snapshot for click hit testing
    this.cachedSnapshot = snapshot;
    this.cachedPitchToCanvas = pitchToCanvas;

    if (!this.inspectedAgentId) return;

    // Find the inspected player in the snapshot
    const player = snapshot.players.find(p => p.id === this.inspectedAgentId);
    if (!player) {
      // Player no longer in snapshot — deselect
      this.inspectedAgentId = null;
      return;
    }

    const canvasPos = pitchToCanvas(player.position);

    // 1. Draw highlight circle
    this.drawHighlight(ctx, canvasPos);

    // 2. Get latest decision entry for this agent
    const entry = this.decisionLog.getLatest(this.inspectedAgentId);

    // 3. Draw info panel
    this.drawPanel(ctx, player, entry, canvasPos);
  }

  // ============================================================
  // Private drawing helpers
  // ============================================================

  private drawHighlight(
    ctx: CanvasRenderingContext2D,
    pos: { x: number; y: number },
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, HIGHLIGHT_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = HIGHLIGHT_COLOR;
    ctx.lineWidth = HIGHLIGHT_LINE_WIDTH;
    ctx.stroke();
    ctx.restore();
  }

  private drawPanel(
    ctx: CanvasRenderingContext2D,
    player: PlayerState,
    entry: AgentDecisionEntry | undefined,
    playerCanvasPos: { x: number; y: number },
  ): void {
    // Top 3 actions sorted by score
    const topActions = entry
      ? [...entry.scores].sort((a, b) => b.score - a.score).slice(0, 3)
      : [];

    // Lines: player ID + role, fatigue bar, divider, top 3 actions or "no data"
    const lineCount = 2 + 1 + (topActions.length > 0 ? topActions.length : 1);
    const panelHeight = PANEL_PADDING * 2 + lineCount * PANEL_LINE_HEIGHT + 6;

    // Position panel to avoid going off-canvas
    let panelX = playerCanvasPos.x + 16;
    let panelY = playerCanvasPos.y - 10;

    if (panelX + PANEL_WIDTH > this.canvas.width - 4) {
      panelX = playerCanvasPos.x - PANEL_WIDTH - 16;
    }
    if (panelY + panelHeight > this.canvas.height - 4) {
      panelY = this.canvas.height - panelHeight - 4;
    }
    if (panelY < 4) panelY = 4;

    ctx.save();

    // Panel background — rounded rectangle
    this.drawRoundedRect(ctx, panelX, panelY, PANEL_WIDTH, panelHeight, 6);
    ctx.fillStyle = PANEL_BG;
    ctx.fill();

    // Panel text
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = FONT;

    let lineY = panelY + PANEL_PADDING + PANEL_LINE_HEIGHT - 4;

    // Line 1: Player ID + role (truncated if needed)
    const idLabel = `${player.id.slice(0, 8)} [${player.role}]`;
    ctx.fillText(idLabel, panelX + PANEL_PADDING, lineY);
    lineY += PANEL_LINE_HEIGHT;

    // Line 2: Fatigue bar
    ctx.fillText('fatigue:', panelX + PANEL_PADDING, lineY);
    this.drawBar(
      ctx,
      panelX + PANEL_PADDING + 52,
      lineY - BAR_HEIGHT + 2,
      player.fatigue,
      BAR_MAX_WIDTH,
      false,  // fatigue is not "selected"
      true,   // invert: high fatigue = more red
    );
    lineY += PANEL_LINE_HEIGHT;

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + PANEL_PADDING, lineY - 4);
    ctx.lineTo(panelX + PANEL_WIDTH - PANEL_PADDING, lineY - 4);
    ctx.stroke();
    lineY += 2;

    // Action scores (top 3)
    if (topActions.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = FONT_SMALL;
      ctx.fillText('no decisions yet', panelX + PANEL_PADDING, lineY);
    } else {
      const selected = entry!.selected;
      for (const scored of topActions) {
        const isSelected = scored.action === selected;
        const scoreClamped = Math.max(0, Math.min(1, scored.score));

        // Action label (shortened to 8 chars)
        const label = scored.action.slice(0, 8);
        ctx.fillStyle = isSelected ? '#ffff44' : TEXT_COLOR;
        ctx.font = isSelected ? `bold ${FONT_SMALL}` : FONT_SMALL;
        ctx.fillText(label, panelX + PANEL_PADDING, lineY);

        // Score bar
        this.drawBar(
          ctx,
          panelX + PANEL_PADDING + 62,
          lineY - BAR_HEIGHT + 2,
          scoreClamped,
          BAR_MAX_WIDTH,
          isSelected,
          false,
        );

        lineY += PANEL_LINE_HEIGHT;
      }
    }

    ctx.restore();
  }

  /**
   * Draws a horizontal score bar.
   *
   * @param ctx - Canvas context
   * @param x - Left edge of bar
   * @param y - Top edge of bar
   * @param value - 0..1 fill ratio
   * @param maxWidth - Maximum bar width in pixels
   * @param isSelected - Whether to draw white border highlight
   * @param invertColor - Whether high value = red (e.g. fatigue)
   */
  private drawBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    value: number,
    maxWidth: number,
    isSelected: boolean,
    invertColor: boolean,
  ): void {
    const fillWidth = Math.floor(value * maxWidth);

    // Bar fill color: lerp between green and red based on value
    // invertColor=true: high value = red (fatigue)
    // invertColor=false: high value = green (score)
    const r = invertColor
      ? Math.floor(value * 204) + 22
      : Math.floor((1 - value) * 204) + 22;
    const g = invertColor
      ? Math.floor((1 - value) * 204) + 22
      : Math.floor(value * 204) + 22;
    const fillColor = `rgb(${r}, ${g}, 34)`;

    ctx.save();

    // Background track
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, maxWidth, BAR_HEIGHT);

    // Fill
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, fillWidth, BAR_HEIGHT);

    // Selected highlight border
    if (isSelected) {
      ctx.strokeStyle = BAR_SELECTED_BORDER;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, maxWidth, BAR_HEIGHT);
    }

    ctx.restore();
  }

  /**
   * Draws a rounded rectangle path (without filling or stroking).
   */
  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
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

  // ============================================================
  // Event handlers
  // ============================================================

  private handleClick(e: MouseEvent): void {
    if (!this.cachedSnapshot || !this.cachedPitchToCanvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    let closestId: string | null = null;
    let closestDist = INSPECT_RADIUS_PX;

    for (const player of this.cachedSnapshot.players) {
      const pos = this.cachedPitchToCanvas(player.position);
      const dx = pos.x - clickX;
      const dy = pos.y - clickY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = player.id;
      }
    }

    if (closestId !== null) {
      this.inspectedAgentId = closestId;
    } else {
      // Click on empty space — deselect
      this.inspectedAgentId = null;
    }
  }
}
