import type { SimSnapshot, PlayerState, ActionType } from '../simulation/types.ts';
import type { DecisionLog } from '../simulation/ai/decisionLog.ts';

// ============================================================
// Debug overlay constants
// ============================================================

const PANEL_CONTENT_WIDTH = 248;
const PANEL_X = 4;
const PANEL_PADDING = 5;
const PANEL_LINE_HEIGHT = 13;
const PANEL_GAP = 4;
const PANEL_BG = 'rgba(0, 0, 0, 0.75)';
const TEXT_COLOR = '#ffffff';
const FONT = '11px monospace';
const FONT_SMALL = '10px monospace';

// Action bar
const BAR_HEIGHT = 8;
const BAR_MAX_WIDTH = 52;
const BAR_SELECTED_BORDER = '#ffffff';

// Averaging window: 75 ticks = 2.5 seconds of sim time
const AVG_WINDOW = 75;

// Highlight on pitch
const HIGHLIGHT_RADIUS = 14;
const HIGHLIGHT_LINE_WIDTH = 2.5;

// Badge colors for each panel slot (matched on pitch + sidebar)
const BADGE_COLORS = ['#ffff00', '#00ffaa', '#ff8844', '#55bbff', '#ff66cc', '#88ff44'];

// Home/away team strip colors
const HOME_STRIP = '#3366cc';
const AWAY_STRIP = '#cc3333';

// Coordinate mapper type used by the renderer
type PitchToCanvas = (v: { x: number; y: number }) => { x: number; y: number };

// Averaged action data for display
interface ActionAverage {
  action: string;
  avgScore: number;
  selectionPct: number;
  isCurrent: boolean;
}

// Tracked player info (shared between drawPanels and drawHighlights)
interface TrackedPlayer {
  player: PlayerState;
  dist: number;
  index: number;
}

// ============================================================
// DebugOverlay
// ============================================================

/**
 * Debug overlay that renders cascading panels in a fixed-position
 * sidebar (separate canvas) showing the nearest N players to the ball.
 *
 * Highlight rings with numbered badges are drawn on the main pitch
 * canvas to identify which players the panels correspond to.
 *
 * The sidebar slides in from the left, matching the tuning panel style.
 */
export class DebugOverlay {
  private readonly debugCanvas: HTMLCanvasElement;
  private readonly decisionLog: DecisionLog;

  /** Players being tracked this frame — shared between drawPanels and drawHighlights */
  private tracked: TrackedPlayer[] = [];

  constructor(debugCanvas: HTMLCanvasElement, decisionLog: DecisionLog) {
    this.debugCanvas = debugCanvas;
    this.decisionLog = decisionLog;

    // Size the debug canvas to the sidebar
    this.resizeDebugCanvas();
    window.addEventListener('resize', () => this.resizeDebugCanvas());
  }

  private resizeDebugCanvas(): void {
    this.debugCanvas.width = 256;
    this.debugCanvas.height = window.innerHeight;
  }

  /**
   * Draw the debug panels on the sidebar canvas.
   * Call this every frame when debug mode is active.
   */
  drawPanels(snapshot: SimSnapshot): void {
    const ctx = this.debugCanvas.getContext('2d');
    if (!ctx) return;

    // Clear the sidebar canvas
    ctx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);

    const ballPos = snapshot.ball.position;

    // Find nearest players to ball (both teams)
    const withDist = snapshot.players.map(p => ({
      player: p,
      dist: Math.sqrt(
        (p.position.x - ballPos.x) ** 2 +
        (p.position.y - ballPos.y) ** 2,
      ),
    }));
    withDist.sort((a, b) => a.dist - b.dist);

    // How many panels fit vertically
    const panelHeight = this.computePanelHeight();
    const maxPanels = Math.max(1, Math.floor((this.debugCanvas.height - 8) / (panelHeight + PANEL_GAP)));
    const count = Math.min(maxPanels, BADGE_COLORS.length, withDist.length);

    // Store tracked players for drawHighlights
    this.tracked = [];
    for (let i = 0; i < count; i++) {
      this.tracked.push({ ...withDist[i]!, index: i });
    }

    // Draw panels stacked vertically
    let panelY = 4;
    for (let i = 0; i < count; i++) {
      const { player, dist } = withDist[i]!;
      const averaged = this.computeAveraged(player.id);
      const latest = this.decisionLog.getLatest(player.id);
      this.drawPanel(ctx, panelY, i, player, dist, averaged, latest?.selected);
      panelY += panelHeight + PANEL_GAP;
    }
  }

  /**
   * Draw highlight rings and numbered badges on the main pitch canvas.
   * Call this AFTER the main renderer draw() call.
   */
  drawHighlights(
    ctx: CanvasRenderingContext2D,
    pitchToCanvas: PitchToCanvas,
  ): void {
    for (const { player, index } of this.tracked) {
      const canvasPos = pitchToCanvas(player.position);
      this.drawHighlight(ctx, canvasPos, index);
    }
  }

  // ============================================================
  // Panel height computation
  // ============================================================

  private computePanelHeight(): number {
    // Header line + 8 action rows
    const lines = 1 + 8;
    return PANEL_PADDING * 2 + lines * PANEL_LINE_HEIGHT + 2;
  }

  // ============================================================
  // Averaging logic
  // ============================================================

  private computeAveraged(agentId: string): ActionAverage[] {
    const entries = this.decisionLog.getRecent(agentId, AVG_WINDOW);
    if (entries.length === 0) return [];

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

    result.sort((a, b) => b.avgScore - a.avgScore);
    return result;
  }

  // ============================================================
  // Private drawing helpers
  // ============================================================

  private drawHighlight(
    ctx: CanvasRenderingContext2D,
    pos: { x: number; y: number },
    index: number,
  ): void {
    const color = BADGE_COLORS[index] ?? BADGE_COLORS[0]!;

    ctx.save();

    // Highlight ring
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, HIGHLIGHT_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = HIGHLIGHT_LINE_WIDTH;
    ctx.stroke();

    // Number badge (small circle with number, top-right of player)
    const badgeX = pos.x + HIGHLIGHT_RADIUS - 2;
    const badgeY = pos.y - HIGHLIGHT_RADIUS + 2;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), badgeX, badgeY);

    ctx.restore();
  }

  private drawPanel(
    ctx: CanvasRenderingContext2D,
    panelY: number,
    index: number,
    player: PlayerState,
    distToBall: number,
    averaged: ActionAverage[],
    currentAction: ActionType | undefined,
  ): void {
    const panelHeight = this.computePanelHeight();
    const badgeColor = BADGE_COLORS[index] ?? BADGE_COLORS[0]!;
    const teamStrip = player.teamId === 'home' ? HOME_STRIP : AWAY_STRIP;

    ctx.save();

    // Panel background
    this.drawRoundedRect(ctx, PANEL_X, panelY, PANEL_CONTENT_WIDTH, panelHeight, 4);
    ctx.fillStyle = PANEL_BG;
    ctx.fill();

    // Team color strip on left edge
    ctx.fillStyle = teamStrip;
    ctx.fillRect(PANEL_X, panelY + 4, 3, panelHeight - 8);

    let lineY = panelY + PANEL_PADDING + PANEL_LINE_HEIGHT - 3;

    // Header: badge dot + #shirt [role] teamLabel - currentAction dist
    const teamLabel = player.teamId === 'home' ? 'H' : 'A';
    const shirtNum = parseInt(player.id.split('-').pop()!, 10) + 1;
    const actionLabel = currentAction ? this.formatAction(currentAction) : '---';
    const distLabel = `${distToBall.toFixed(0)}m`;

    // Badge dot
    ctx.beginPath();
    ctx.arc(PANEL_X + PANEL_PADDING + 6, lineY - 4, 5, 0, Math.PI * 2);
    ctx.fillStyle = badgeColor;
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), PANEL_X + PANEL_PADDING + 6, lineY - 4);

    // Player info text
    ctx.font = FONT;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const headerText = `#${shirtNum} [${player.role}] ${teamLabel}`;
    ctx.fillText(headerText, PANEL_X + PANEL_PADDING + 16, lineY);

    // Current action + distance on the right
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffff44';
    ctx.font = FONT_SMALL;
    ctx.fillText(`${actionLabel} ${distLabel}`, PANEL_X + PANEL_CONTENT_WIDTH - PANEL_PADDING, lineY);

    lineY += PANEL_LINE_HEIGHT;

    // Action rows — all actions sorted by average score
    ctx.textAlign = 'left';
    if (averaged.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = FONT_SMALL;
      ctx.fillText('no decisions yet', PANEL_X + PANEL_PADDING, lineY);
    } else {
      for (const row of averaged) {
        const isSelected = row.action === currentAction;

        // Action label
        const label = this.formatAction(row.action);
        ctx.fillStyle = isSelected ? '#ffff44' : TEXT_COLOR;
        ctx.font = isSelected ? `bold ${FONT_SMALL}` : FONT_SMALL;
        ctx.fillText(label, PANEL_X + PANEL_PADDING + 4, lineY);

        // Score bar
        const barX = PANEL_X + PANEL_PADDING + 82;
        const scoreClamped = Math.max(0, Math.min(1, row.avgScore));
        this.drawBar(ctx, barX, lineY - BAR_HEIGHT + 2, scoreClamped, BAR_MAX_WIDTH, isSelected);

        // Average score value
        ctx.fillStyle = isSelected ? '#ffff44' : 'rgba(255,255,255,0.6)';
        ctx.font = FONT_SMALL;
        ctx.fillText(row.avgScore.toFixed(2), barX + BAR_MAX_WIDTH + 4, lineY);

        // Selection percentage
        const pctText = row.selectionPct > 0 ? `${row.selectionPct.toFixed(0)}%` : '-';
        ctx.textAlign = 'right';
        ctx.fillText(pctText, PANEL_X + PANEL_CONTENT_WIDTH - PANEL_PADDING, lineY);
        ctx.textAlign = 'left';

        lineY += PANEL_LINE_HEIGHT;
      }
    }

    ctx.restore();
  }

  private formatAction(action: string): string {
    switch (action) {
      case 'MOVE_TO_POSITION': return 'MoveToPos';
      case 'PASS_FORWARD':     return 'PassFwd';
      case 'PASS_SAFE':        return 'PassSafe';
      case 'HOLD_SHIELD':      return 'Shield';
      case 'MAKE_RUN':         return 'MakeRun';
      default:                 return action.charAt(0) + action.slice(1).toLowerCase();
    }
  }

  private drawBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    value: number,
    maxWidth: number,
    isSelected: boolean,
  ): void {
    const fillWidth = Math.floor(value * maxWidth);

    const r = Math.floor((1 - value) * 204) + 22;
    const g = Math.floor(value * 204) + 22;
    const fillColor = `rgb(${r}, ${g}, 34)`;

    ctx.save();

    // Background track
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
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
}
