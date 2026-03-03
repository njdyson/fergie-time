import type { SimSnapshot, PlayerState } from '../simulation/types.ts';
import { Vec2 } from '../simulation/math/vec2.ts';
import { drawPitch } from './pitch.ts';

// ============================================================
// Rendering constants
// ============================================================

// Pitch dimensions in metres (matches simulation constants)
const PITCH_W = 105;
const PITCH_H = 68;

// Padding around the pitch in canvas pixels
const PITCH_PADDING = 20;

// Player rendering
const PLAYER_RADIUS = 6; // canvas pixels
const DIRECTION_LINE_LENGTH = 10; // canvas pixels

// Ball rendering
const BALL_BASE_RADIUS = 5; // canvas pixels at ground level
const MAX_BALL_Z = 20; // metres — at this height ball radius scales up 50%
// Shadow color alpha: 0.35 at ground level, fades with ball height
const SHADOW_RX_BASE = 7; // shadow ellipse x-radius at ground
const SHADOW_RY_BASE = 3; // shadow ellipse y-radius at ground

// Team colors
const HOME_COLOR = '#3366cc';
const AWAY_COLOR = '#cc3333';
const BALL_FILL = '#ffffff';
const BALL_STROKE = '#222222';

// HUD colors
const HUD_BG = 'rgba(0, 0, 0, 0.70)';
const HUD_TEXT = '#ffffff';
const HUD_FONT = 'bold 14px monospace';
const HUD_FONT_SMALL = '12px monospace';
const STATS_BG = 'rgba(0, 0, 30, 0.82)';

// ============================================================
// Linear interpolation helper
// ============================================================

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

// ============================================================
// CanvasRenderer
// ============================================================

/**
 * Renders SimSnapshot data to a <canvas> element.
 *
 * Coordinate mapping: simulation metres → canvas pixels.
 * Pitch origin (0, 0) maps to the top-left corner of the pitch area.
 *
 * draw(prev, curr, alpha) interpolates player and ball positions
 * between prev and curr snapshots using alpha [0..1] for smooth 60fps display.
 *
 * Key bindings (registered on document):
 *   'S' — toggle stats overlay
 *   'D' — toggle debug overlay (click-to-inspect)
 *   'H' — toggle spatial heat map
 */
export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scaleX: number = 1;
  private scaleY: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;

  // Overlay state
  showStats: boolean = false;
  showDebug: boolean = false;
  showHeatmap: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D rendering context from canvas');
    }
    this.ctx = ctx;
    this.resize();

    // Re-layout on window resize
    window.addEventListener('resize', () => this.resize());

    // Key bindings for overlay toggles
    document.addEventListener('keydown', (e) => {
      if (e.key === 's' || e.key === 'S') {
        this.showStats = !this.showStats;
      }
      if (e.key === 'd' || e.key === 'D') {
        this.showDebug = !this.showDebug;
      }
      if (e.key === 'h' || e.key === 'H') {
        this.showHeatmap = !this.showHeatmap;
      }
    });
  }

  /**
   * Recalculate canvas size and coordinate mapping.
   * Canvas fills available width with the correct 105:68 aspect ratio.
   */
  private resize(): void {
    const availableWidth = this.canvas.parentElement?.clientWidth ?? window.innerWidth;
    // Reserve space for controls bar + gap below canvas
    const controlsEl = document.getElementById('controls');
    const controlsHeight = controlsEl ? controlsEl.offsetHeight + 16 : 50;
    const availableHeight = window.innerHeight - controlsHeight;

    // Compute canvas size preserving aspect ratio within available space
    const aspectRatio = PITCH_W / PITCH_H;
    let canvasWidth = availableWidth;
    let canvasHeight = Math.floor(canvasWidth / aspectRatio);

    if (canvasHeight > availableHeight) {
      canvasHeight = availableHeight;
      canvasWidth = Math.floor(canvasHeight * aspectRatio);
    }

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;

    // Pitch area: canvas minus padding on all sides
    const pitchPixelW = canvasWidth - PITCH_PADDING * 2;
    const pitchPixelH = canvasHeight - PITCH_PADDING * 2;

    this.scaleX = pitchPixelW / PITCH_W;
    this.scaleY = pitchPixelH / PITCH_H;
    this.offsetX = PITCH_PADDING;
    this.offsetY = PITCH_PADDING;
  }

  /**
   * Maps a simulation coordinate (metres) to canvas pixels.
   */
  pitchToCanvas(v: Vec2 | { x: number; y: number }): { x: number; y: number } {
    return {
      x: Math.floor(this.offsetX + v.x * this.scaleX),
      y: Math.floor(this.offsetY + v.y * this.scaleY),
    };
  }

  /**
   * Draw one frame, interpolating between prev and curr snapshots.
   *
   * Draw order:
   *   1. Clear canvas
   *   2. Pitch lines (drawPitch)
   *   3. Heatmap (if enabled)
   *   4. Player circles with direction indicator
   *   5. Ball shadow (ellipse, alpha proportional to height)
   *   6. Ball (circle, radius scales with Z height)
   *   7. Match info HUD (score, minute, phase)
   *   8. Stats overlay (if enabled)
   */
  draw(prev: SimSnapshot, curr: SimSnapshot, alpha: number): void {
    const ctx = this.ctx;

    // 1. Clear canvas
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Pitch lines
    drawPitch(ctx, (v) => this.pitchToCanvas(v));

    // 3. Heatmap (if enabled)
    if (this.showHeatmap) {
      this.drawHeatmap(ctx, curr);
    }

    // 4. Players
    for (let i = 0; i < curr.players.length; i++) {
      const currPlayer = curr.players[i];
      const prevPlayer = prev.players[i] ?? currPlayer;
      if (currPlayer) {
        this.drawPlayer(ctx, prevPlayer ?? currPlayer, currPlayer, alpha);
      }
    }

    // 5 & 6. Ball shadow and ball
    this.drawBall(ctx, prev, curr, alpha);

    // 7. Match info HUD
    this.drawMatchInfo(ctx, curr);

    // 8. Stats overlay
    if (this.showStats) {
      this.drawStatsOverlay(ctx, curr);
    }
  }

  // ============================================================
  // Player drawing
  // ============================================================

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    prev: PlayerState,
    curr: PlayerState,
    alpha: number,
  ): void {
    // Interpolate position
    const x = lerp(prev.position.x, curr.position.x, alpha);
    const y = lerp(prev.position.y, curr.position.y, alpha);
    const c = this.pitchToCanvas(new Vec2(x, y));

    // Player circle
    ctx.beginPath();
    ctx.arc(c.x, c.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = curr.teamId === 'home' ? HOME_COLOR : AWAY_COLOR;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Direction indicator line (from velocity)
    const vx = lerp(prev.velocity.x, curr.velocity.x, alpha);
    const vy = lerp(prev.velocity.y, curr.velocity.y, alpha);
    const speed = Math.sqrt(vx * vx + vy * vy);

    if (speed > 0.1) {
      const dirX = (vx / speed) * DIRECTION_LINE_LENGTH;
      const dirY = (vy / speed) * DIRECTION_LINE_LENGTH;

      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + dirX, c.y + dirY);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ============================================================
  // Ball drawing
  // ============================================================

  private drawBall(
    ctx: CanvasRenderingContext2D,
    prev: SimSnapshot,
    curr: SimSnapshot,
    alpha: number,
  ): void {
    // Interpolate position
    const bx = lerp(prev.ball.position.x, curr.ball.position.x, alpha);
    const by = lerp(prev.ball.position.y, curr.ball.position.y, alpha);
    const bz = lerp(prev.ball.z, curr.ball.z, alpha);

    const groundPos = this.pitchToCanvas(new Vec2(bx, by));

    // 5. Shadow: ellipse at ground position
    const shadowAlpha = 0.35 * (1 - Math.min(bz / MAX_BALL_Z, 1));

    ctx.save();
    ctx.globalAlpha = shadowAlpha;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(
      groundPos.x,
      groundPos.y,
      Math.floor(SHADOW_RX_BASE),
      Math.floor(SHADOW_RY_BASE),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    // 6. Ball: circle at ground position, radius scales with Z
    const ballRadius = Math.floor(BALL_BASE_RADIUS * (1 + (bz / MAX_BALL_Z) * 0.5));
    const airborneOffsetY = -Math.floor(bz * this.scaleY * 0.3);

    ctx.beginPath();
    ctx.arc(groundPos.x, groundPos.y + airborneOffsetY, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = BALL_FILL;
    ctx.fill();
    ctx.strokeStyle = BALL_STROKE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ============================================================
  // Match info HUD
  // ============================================================

  private drawMatchInfo(ctx: CanvasRenderingContext2D, snap: SimSnapshot): void {
    const [homeScore, awayScore] = snap.score;
    const matchMinute = Math.min(90, Math.floor(snap.tick / 60));
    const phase = snap.matchPhase;

    // Phase label
    const phaseLabels: Record<string, string> = {
      KICKOFF: 'Kickoff',
      FIRST_HALF: `${matchMinute}'`,
      HALFTIME: 'HT',
      SECOND_HALF: `${matchMinute}'`,
      FULL_TIME: 'FT',
    };
    const timeLabel = phaseLabels[phase] ?? phase;

    // Score text
    const scoreText = `${homeScore} - ${awayScore}`;

    // Draw HUD at top center
    const hudX = this.canvas.width / 2;
    const hudY = 8;
    const boxW = 130;
    const boxH = 28;

    ctx.save();
    ctx.fillStyle = HUD_BG;
    this.drawRoundedRect(ctx, hudX - boxW / 2, hudY, boxW, boxH, 6);
    ctx.fill();

    ctx.fillStyle = HUD_TEXT;
    ctx.font = HUD_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Score
    ctx.fillText(scoreText, hudX - 20, hudY + boxH / 2);

    // Time
    ctx.fillStyle = '#aaccff';
    ctx.font = HUD_FONT_SMALL;
    ctx.fillText(timeLabel, hudX + 35, hudY + boxH / 2);

    ctx.restore();

    // Key hints at bottom
    this.drawKeyHints(ctx);
  }

  private drawKeyHints(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';

    const hints = [
      '[S] Stats',
      '[D] Debug',
      '[H] Heatmap',
      '[1/2/3] Speed',
      '[P] Pause',
    ].join('  ');

    ctx.fillText(hints, 6, this.canvas.height - 4);
    ctx.restore();
  }

  // ============================================================
  // Stats overlay
  // ============================================================

  private drawStatsOverlay(ctx: CanvasRenderingContext2D, snap: SimSnapshot): void {
    const stats = snap.stats;
    const lines = [
      'MATCH STATS',
      `Possession:  H ${stats.possession[0].toFixed(0)}%  A ${stats.possession[1].toFixed(0)}%`,
      `Shots:       H ${stats.shots[0]}  A ${stats.shots[1]}`,
      `Passes:      H ${stats.passes[0]}  A ${stats.passes[1]}`,
      `Tackles:     H ${stats.tackles[0]}  A ${stats.tackles[1]}`,
    ];

    const panelW = 210;
    const lineH = 18;
    const padding = 8;
    const panelH = padding * 2 + lines.length * lineH;
    const panelX = this.canvas.width - panelW - 8;
    const panelY = 8;

    ctx.save();
    this.drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 6);
    ctx.fillStyle = STATS_BG;
    ctx.fill();

    ctx.fillStyle = HUD_TEXT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let lineY = panelY + padding;
    for (let i = 0; i < lines.length; i++) {
      ctx.font = i === 0 ? HUD_FONT : HUD_FONT_SMALL;
      ctx.fillStyle = i === 0 ? '#aaccff' : HUD_TEXT;
      ctx.fillText(lines[i]!, panelX + padding, lineY);
      lineY += lineH;
    }

    ctx.restore();
  }

  // ============================================================
  // Spatial heat map
  // ============================================================

  /**
   * Draws a colored heatmap overlay showing team spatial distribution.
   * Blue = home team density, Red = away team density.
   */
  private drawHeatmap(ctx: CanvasRenderingContext2D, snap: SimSnapshot): void {
    const cellSize = 8; // metres per heat cell
    const cols = Math.ceil(105 / cellSize);
    const rows = Math.ceil(68 / cellSize);

    // Accumulate player counts per cell per team
    const homeGrid = new Float32Array(cols * rows);
    const awayGrid = new Float32Array(cols * rows);

    const radius = 12; // influence radius in metres

    for (const player of snap.players) {
      const grid = player.teamId === 'home' ? homeGrid : awayGrid;
      const cx = player.position.x;
      const cy = player.position.y;

      // Gaussian splat over nearby cells
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cellCx = (col + 0.5) * cellSize;
          const cellCy = (row + 0.5) * cellSize;
          const dx = cellCx - cx;
          const dy = cellCy - cy;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < radius * radius) {
            const weight = 1.0 - Math.sqrt(dist2) / radius;
            grid[row * cols + col]! += weight;
          }
        }
      }
    }

    // Draw colored cells
    ctx.save();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const homeVal = homeGrid[row * cols + col]! / 3;
        const awayVal = awayGrid[row * cols + col]! / 3;

        if (homeVal < 0.05 && awayVal < 0.05) continue;

        const tl = this.pitchToCanvas({ x: col * cellSize, y: row * cellSize });
        const br = this.pitchToCanvas({ x: (col + 1) * cellSize, y: (row + 1) * cellSize });
        const w = br.x - tl.x;
        const h = br.y - tl.y;

        // Blend home (blue) vs away (red)
        const homeAlpha = Math.min(0.35, homeVal * 0.35);
        const awayAlpha = Math.min(0.35, awayVal * 0.35);

        if (homeAlpha > 0.02) {
          ctx.fillStyle = `rgba(51,102,204,${homeAlpha.toFixed(2)})`;
          ctx.fillRect(tl.x, tl.y, w, h);
        }
        if (awayAlpha > 0.02) {
          ctx.fillStyle = `rgba(204,51,51,${awayAlpha.toFixed(2)})`;
          ctx.fillRect(tl.x, tl.y, w, h);
        }
      }
    }
    ctx.restore();
  }

  // ============================================================
  // Utility
  // ============================================================

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
}
