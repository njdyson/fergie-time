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
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.35)';
const SHADOW_RX_BASE = 7; // shadow ellipse x-radius at ground
const SHADOW_RY_BASE = 3; // shadow ellipse y-radius at ground

// Team colors
const HOME_COLOR = '#3366cc';
const AWAY_COLOR = '#cc3333';
const BALL_FILL = '#ffffff';
const BALL_STROKE = '#222222';

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
 */
export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scaleX: number = 1;
  private scaleY: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;

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
  }

  /**
   * Recalculate canvas size and coordinate mapping.
   * Canvas fills available width with the correct 105:68 aspect ratio.
   */
  private resize(): void {
    const availableWidth = this.canvas.parentElement?.clientWidth ?? window.innerWidth;
    const availableHeight = window.innerHeight;

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
   *   3. Player circles with direction indicator
   *   4. Ball shadow (ellipse, alpha proportional to height)
   *   5. Ball (circle, radius scales with Z height)
   */
  draw(prev: SimSnapshot, curr: SimSnapshot, alpha: number): void {
    const ctx = this.ctx;

    // 1. Clear canvas
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Pitch lines
    drawPitch(ctx, (v) => this.pitchToCanvas(v));

    // 3. Players
    for (let i = 0; i < curr.players.length; i++) {
      const currPlayer = curr.players[i];
      const prevPlayer = prev.players[i] ?? currPlayer;
      if (currPlayer) {
        this.drawPlayer(ctx, prevPlayer ?? currPlayer, currPlayer, alpha);
      }
    }

    // 4 & 5. Ball shadow and ball
    this.drawBall(ctx, prev, curr, alpha);
  }

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

    // 4. Shadow: ellipse at ground position
    // Alpha decreases as ball rises (0.35 at ground → 0 at MAX_BALL_Z)
    const shadowAlpha = Math.max(0, SHADOW_COLOR.match(/[\d.]+\)/)?.[0]
      ? 0.35 * (1 - Math.min(bz / MAX_BALL_Z, 1))
      : 0.35 * (1 - Math.min(bz / MAX_BALL_Z, 1)));

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

    // 5. Ball: circle at ground position, radius scales with Z
    // Ball visual position shifts up slightly when airborne
    // In 2D top-down, we keep the same ground position but scale radius
    const ballRadius = Math.floor(BALL_BASE_RADIUS * (1 + (bz / MAX_BALL_Z) * 0.5));

    // Visual hint: move ball slightly "up" the canvas when it's airborne (Y-axis offset)
    const airborneOffsetY = -Math.floor(bz * this.scaleY * 0.3);

    ctx.beginPath();
    ctx.arc(groundPos.x, groundPos.y + airborneOffsetY, ballRadius, 0, Math.PI * 2);
    ctx.fillStyle = BALL_FILL;
    ctx.fill();
    ctx.strokeStyle = BALL_STROKE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
