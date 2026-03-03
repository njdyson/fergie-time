import type { SimSnapshot, PlayerState, ActionType } from '../simulation/types.ts';
import type { DecisionLog } from '../simulation/ai/decisionLog.ts';

// ============================================================
// Debug overlay constants
// ============================================================

const INSPECT_RADIUS_PX = 15; // click detection radius in canvas pixels
const HIGHLIGHT_RADIUS = 10;  // yellow highlight ring radius in canvas pixels
const HIGHLIGHT_COLOR = '#ffff00';
const HIGHLIGHT_LINE_WIDTH = 2;

const PANEL_WIDTH = 260;
const PANEL_PADDING = 8;
const PANEL_LINE_HEIGHT = 16;
const PANEL_BG = 'rgba(0, 0, 0, 0.88)';
const TEXT_COLOR = '#ffffff';
const FONT = '12px monospace';
const FONT_SMALL = '11px monospace';

// Action bar
const BAR_SELECTED_BORDER = '#ffffff';
const BAR_HEIGHT = 10;
const BAR_MAX_WIDTH = 70; // fixed bar width for consistency

// Averaging window: 30 ticks = 1 second of sim time
const AVG_WINDOW = 30;

// Coordinate mapper type used by the renderer
type PitchToCanvas = (v: { x: number; y: number }) => { x: number; y: number };

// Averaged action data for display
interface ActionAverage {
  action: string;
  avgScore: number;
  selectionPct: number;
  isCurrent: boolean;
}

// ============================================================
// DebugOverlay
// ============================================================

/**
 * Click-to-inspect debug overlay for the Canvas renderer.
 *
 * Shows averaged scores over the last 30 ticks (1 second) so the panel
 * is stable and readable. Displays ALL 8 actions sorted by average score,
 * with selection frequency % and the current action highlighted.
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
   */
  draw(
    ctx: CanvasRenderingContext2D,
    snapshot: SimSnapshot,
    pitchToCanvas: PitchToCanvas,
    debugEnabled: boolean = true,
  ): void {
    // Cache snapshot for click hit testing
    this.cachedSnapshot = snapshot;
    this.cachedPitchToCanvas = pitchToCanvas;

    if (!debugEnabled || !this.inspectedAgentId) return;

    // Find the inspected player in the snapshot
    const player = snapshot.players.find(p => p.id === this.inspectedAgentId);
    if (!player) {
      this.inspectedAgentId = null;
      return;
    }

    const canvasPos = pitchToCanvas(player.position);

    // 1. Draw highlight circle
    this.drawHighlight(ctx, canvasPos);

    // 2. Compute averaged decision data over last 30 ticks
    const averaged = this.computeAveraged(this.inspectedAgentId);

    // 3. Get current action from latest entry
    const latest = this.decisionLog.getLatest(this.inspectedAgentId);

    // 4. Draw info panel
    this.drawPanel(ctx, player, averaged, latest?.selected, canvasPos);
  }

  // ============================================================
  // Averaging logic
  // ============================================================

  private computeAveraged(agentId: string): ActionAverage[] {
    const entries = this.decisionLog.getRecent(agentId, AVG_WINDOW);
    if (entries.length === 0) return [];

    // Accumulate scores and selection counts per action
    const scoreAccum = new Map<string, { total: number; count: number; selections: number }>();

    for (const entry of entries) {
      for (const { action, score } of entry.scores) {
        let acc = scoreAccum.get(action);
        if (!acc) {
          acc = { total: 0, count: 0, selections: 0 };
          scoreAccum.set(action, acc);
        }
        acc.total += score;
        acc.count += 1;
      }
      const sel = scoreAccum.get(entry.selected);
      if (sel) sel.selections += 1;
    }

    const totalEntries = entries.length;
    const currentAction = entries[entries.length - 1]?.selected;
    const result: ActionAverage[] = [];

    for (const [action, acc] of scoreAccum) {
      result.push({
        action,
        avgScore: acc.count > 0 ? acc.total / acc.count : 0,
        selectionPct: totalEntries > 0 ? (acc.selections / totalEntries) * 100 : 0,
        isCurrent: action === currentAction,
      });
    }

    // Sort by average score descending
    result.sort((a, b) => b.avgScore - a.avgScore);
    return result;
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
    averaged: ActionAverage[],
    currentAction: ActionType | undefined,
    playerCanvasPos: { x: number; y: number },
  ): void {
    // Lines: header + fatigue + divider + actions (or "no data")
    const actionLines = averaged.length > 0 ? averaged.length : 1;
    const lineCount = 2 + 1 + actionLines;
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

    // Line 1: Player ID + role + team
    const teamLabel = player.teamId === 'home' ? 'H' : 'A';
    const idLabel = `${player.id.slice(0, 8)} [${player.role}] ${teamLabel}`;
    ctx.fillText(idLabel, panelX + PANEL_PADDING, lineY);
    lineY += PANEL_LINE_HEIGHT;

    // Line 2: Fatigue bar
    ctx.font = FONT_SMALL;
    ctx.fillText('fatigue:', panelX + PANEL_PADDING, lineY);
    const fatPct = `${(player.fatigue * 100).toFixed(0)}%`;
    this.drawBar(
      ctx,
      panelX + PANEL_PADDING + 56,
      lineY - BAR_HEIGHT + 2,
      player.fatigue,
      BAR_MAX_WIDTH,
      false,
      true,
    );
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(fatPct, panelX + PANEL_PADDING + 56 + BAR_MAX_WIDTH + 4, lineY);
    lineY += PANEL_LINE_HEIGHT;

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + PANEL_PADDING, lineY - 4);
    ctx.lineTo(panelX + PANEL_WIDTH - PANEL_PADDING, lineY - 4);
    ctx.stroke();

    // Column header
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '10px monospace';
    ctx.fillText('action', panelX + PANEL_PADDING, lineY + 2);
    ctx.fillText('avg score', panelX + PANEL_PADDING + 96, lineY + 2);
    ctx.fillText('sel%', panelX + PANEL_WIDTH - PANEL_PADDING - 30, lineY + 2);
    lineY += PANEL_LINE_HEIGHT - 2;

    // Action rows — all 8, averaged over last 30 ticks
    if (averaged.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = FONT_SMALL;
      ctx.fillText('no decisions yet', panelX + PANEL_PADDING, lineY);
    } else {
      for (const row of averaged) {
        const isSelected = row.action === currentAction;

        // Action label (show full name, formatted)
        const label = this.formatAction(row.action);
        ctx.fillStyle = isSelected ? '#ffff44' : TEXT_COLOR;
        ctx.font = isSelected ? `bold ${FONT_SMALL}` : FONT_SMALL;
        ctx.fillText(label, panelX + PANEL_PADDING, lineY);

        // Score bar
        const scoreClamped = Math.max(0, Math.min(1, row.avgScore));
        this.drawBar(
          ctx,
          panelX + PANEL_PADDING + 96,
          lineY - BAR_HEIGHT + 2,
          scoreClamped,
          BAR_MAX_WIDTH,
          isSelected,
          false,
        );

        // Selection percentage
        const pctText = row.selectionPct > 0 ? `${row.selectionPct.toFixed(0)}%` : '-';
        ctx.fillStyle = isSelected ? '#ffff44' : 'rgba(255,255,255,0.7)';
        ctx.font = FONT_SMALL;
        ctx.fillText(pctText, panelX + PANEL_WIDTH - PANEL_PADDING - 28, lineY);

        lineY += PANEL_LINE_HEIGHT;
      }
    }

    ctx.restore();
  }

  private formatAction(action: string): string {
    // Convert SCREAMING_SNAKE to Title Case abbreviation
    switch (action) {
      case 'MOVE_TO_POSITION': return 'MoveToPos';
      case 'PASS_FORWARD':     return 'PassFwd';
      case 'PASS_SAFE':        return 'PassSafe';
      case 'HOLD_SHIELD':      return 'Shield';
      case 'MAKE_RUN':         return 'MakeRun';
      default:                 return action.charAt(0) + action.slice(1).toLowerCase();
    }
  }

  /**
   * Draws a horizontal score bar.
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
