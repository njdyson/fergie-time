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
const PLAYER_RADIUS = 10; // canvas pixels
const DIRECTION_LINE_LENGTH = 12; // canvas pixels
const SHIRT_FONT = 'bold 9px sans-serif';
const ROLE_FONT = '8px monospace';
const ROLE_LABEL_OFFSET_Y = -14; // pixels above player center

// Ball rendering
const BALL_BASE_RADIUS = 5; // canvas pixels at ground level
const MAX_BALL_Z = 20; // metres — at this height ball radius scales up 50%
// Shadow color alpha: 0.35 at ground level, fades with ball height
const SHADOW_RX_BASE = 7; // shadow ellipse x-radius at ground
const SHADOW_RY_BASE = 3; // shadow ellipse y-radius at ground

// Team colors
const HOME_COLOR = '#3366cc';
const AWAY_COLOR = '#cc3333';
const HOME_GK_COLOR = '#66cc99';
const AWAY_GK_COLOR = '#ffcc33';
const BALL_FILL = '#ffffff';
const BALL_STROKE = '#222222';

// HUD colors
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
  showAnchors: boolean = false; // V1 overhaul: show anchor ghosts + structure lines when paused
  showGhosts: boolean = false; // Show faint anchor ghosts during live play (toggled by G key)
  selectedHomePlayerIndex: number = -1; // V1 overhaul: highlight selected player on pitch
  freedomValues: number[] = []; // Per-player freedom multiplier values (0..1) for radius overlay

  // Transition phase visualization: show both in-poss and OOP anchors for selected player
  editingTransitionPhase: 'defensiveTransition' | 'attackingTransition' | null = null;
  inPossAnchors: { x: number; y: number }[] = [];
  oopAnchors: { x: number; y: number }[] = [];

  /** Horizontal pixels reserved for side panels (subtracted from available width) */
  panelOffset: number = 0;

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
  resize(): void {
    // Use the actual container width (flex layout handles panel offsets)
    const wrapper = this.canvas.parentElement;
    // Clear any previous maxHeight constraint before measuring so we get the full available space
    if (wrapper) wrapper.style.maxHeight = '';
    const availableWidth = wrapper ? wrapper.clientWidth : (window.innerWidth - this.panelOffset);
    const availableHeight = wrapper ? wrapper.clientHeight : (window.innerHeight - 56);

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

    // Shrink wrapper to match canvas so there's no gap below the pitch
    if (wrapper && canvasHeight < availableHeight) {
      wrapper.style.maxHeight = canvasHeight + 'px';
    } else if (wrapper) {
      wrapper.style.maxHeight = '';
    }

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

    // 3b. Team direction indicators
    this.drawDirectionIndicators(ctx);

    // 4. Players
    for (let i = 0; i < curr.players.length; i++) {
      const currPlayer = curr.players[i];
      const prevPlayer = prev.players[i] ?? currPlayer;
      if (currPlayer) {
        // When anchors are shown (tactics overlay open), hide home players
        // and fade away players for context (hide away entirely pre-kickoff)
        if (this.showAnchors && currPlayer.teamId === 'home') continue;
        if (this.showAnchors && currPlayer.teamId === 'away') {
          if (curr.matchPhase === 'KICKOFF') continue; // hide away pre-kickoff
          ctx.save();
          ctx.globalAlpha = 0.2;
          this.drawPlayer(ctx, prevPlayer ?? currPlayer, currPlayer, alpha);
          ctx.restore();
          continue;
        }
        this.drawPlayer(ctx, prevPlayer ?? currPlayer, currPlayer, alpha);
      }
    }

    // 4b. Ghost anchors during live play (G toggle)
    if (this.showGhosts && !this.showAnchors) {
      this.drawGhostAnchors(ctx, curr);
    }

    // 5 & 6. Ball shadow and ball
    this.drawBall(ctx, prev, curr, alpha);

    // 7. Key hints (bottom of canvas)
    this.drawKeyHints(ctx);

    // 8. Stats overlay
    if (this.showStats) {
      this.drawStatsOverlay(ctx, curr);
    }

    // 9. Anchor ghost overlay (V1 overhaul — when paused with tactics overlay)
    if (this.showAnchors) {
      this.drawAnchorOverlay(ctx, curr);
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

    // Pick fill colour: GK gets a different colour
    let fillColor: string;
    if (curr.role === 'GK') {
      fillColor = curr.teamId === 'home' ? HOME_GK_COLOR : AWAY_GK_COLOR;
    } else {
      fillColor = curr.teamId === 'home' ? HOME_COLOR : AWAY_COLOR;
    }

    // Player circle
    ctx.beginPath();
    ctx.arc(c.x, c.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shirt number (extract from ID: "home-0" → 1, "away-10" → 11)
    const idParts = curr.id.split('-');
    const shirtNum = String(parseInt(idParts[idParts.length - 1]!, 10) + 1);
    ctx.save();
    ctx.font = SHIRT_FONT;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shirtNum, c.x, c.y + 1);
    ctx.restore();

    // Player surname label above player (fall back to role if no name)
    const displayName = curr.name ? (curr.name.split(' ').pop() ?? curr.role) : curr.role;
    ctx.save();
    ctx.font = ROLE_FONT;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(displayName, c.x, c.y + ROLE_LABEL_OFFSET_Y);
    ctx.restore();

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
  // Team direction indicators
  // ============================================================

  private drawDirectionIndicators(ctx: CanvasRenderingContext2D): void {
    const y = this.offsetY - 6;

    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.textBaseline = 'bottom';

    // Home shoots right → (left side of pitch)
    ctx.fillStyle = HOME_COLOR;
    ctx.textAlign = 'left';
    ctx.fillText('HOME \u2192', this.offsetX + 4, y);

    // Away shoots left ← (right side of pitch)
    ctx.fillStyle = AWAY_COLOR;
    ctx.textAlign = 'right';
    const pitchRight = this.offsetX + PITCH_W * this.scaleX;
    ctx.fillText('\u2190 AWAY', pitchRight - 4, y);

    ctx.restore();
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

  private drawKeyHints(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';

    const hints = [
      '[D] Debug',
      '[Space] Pause',
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
      `On Target:   H ${stats.shotsOnTarget[0]}  A ${stats.shotsOnTarget[1]}`,
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
  // Anchor overlay (V1 overhaul — tactics editing visualization)
  // ============================================================

  /**
   * Draws formation anchor positions as the primary player display (replaces live positions).
   * Solid circles with shirt numbers and surnames at anchor positions.
   * Structure lines show defensive, midfield, and forward lines.
   */
  private drawAnchorOverlay(ctx: CanvasRenderingContext2D, snap: SimSnapshot): void {
    const homePlayers = snap.players.filter(p => p.teamId === 'home');
    if (homePlayers.length === 0) return;

    ctx.save();

    // Draw freedom radius circle for SELECTED player only (behind player circles)
    if (this.freedomValues.length > 0 && this.selectedHomePlayerIndex >= 0) {
      const i = this.selectedHomePlayerIndex;
      const freedom = this.freedomValues[i] ?? 0.5;
      if (freedom > 0.05) {
        const p = homePlayers[i]!;
        const anchor = this.pitchToCanvas(p.formationAnchor);
        const radiusM = freedom * 20;
        const radiusPx = Math.max(0, radiusM * Math.min(this.scaleX, this.scaleY));
        if (radiusPx > PLAYER_RADIUS) {
          ctx.beginPath();
          ctx.arc(anchor.x, anchor.y, radiusPx, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(59, 130, 246, ${0.08 + freedom * 0.12})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(96, 165, 250, ${0.35 + freedom * 0.35})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Transition edit mode: when editing def/att trans with a player selected,
    // fade non-selected players and show both phase positions for the selected one
    const inTransEdit = this.editingTransitionPhase !== null
      && this.selectedHomePlayerIndex >= 0
      && this.inPossAnchors.length > 0;

    // Draw solid player circles at anchor positions
    for (let i = 0; i < homePlayers.length; i++) {
      const p = homePlayers[i]!;
      const anchor = this.pitchToCanvas(p.formationAnchor);
      const isGK = p.role === 'GK';
      const isSelected = i === this.selectedHomePlayerIndex;
      // Selected player: bright white/gold, non-selected: standard team color
      const fillColor = isSelected
        ? (isGK ? '#88eebb' : '#5599ee')
        : (isGK ? HOME_GK_COLOR : HOME_COLOR);

      // In transition edit, fade non-selected players
      if (inTransEdit && !isSelected) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = SHIRT_FONT;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), anchor.x, anchor.y + 1);
        ctx.restore();
        continue;
      }

      // Selected player highlight ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, PLAYER_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Solid player circle
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fbbf24' : '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Shirt number
      const shirtNum = String(i + 1);
      ctx.font = SHIRT_FONT;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shirtNum, anchor.x, anchor.y + 1);

      // Player surname above circle
      const name = p.name ?? p.role;
      const surname = name.split(' ').pop() ?? name;
      ctx.font = ROLE_FONT;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(surname, anchor.x, anchor.y + ROLE_LABEL_OFFSET_Y);

      // Transition edit: draw "to" ghost + arrow from main circle
      // The main circle already shows the "from" position (engine pushes the from-phase config)
      if (inTransEdit && isSelected) {
        const idx = this.selectedHomePlayerIndex;
        // Def trans: player moves from in-poss → OOP
        // Att trans: player moves from OOP → in-poss
        const toAnchors = this.editingTransitionPhase === 'defensiveTransition'
          ? this.oopAnchors : this.inPossAnchors;
        const toPos = toAnchors[idx];

        if (toPos) {
          const to = this.pitchToCanvas(toPos);

          // "To" ghost marker (where player moves to)
          ctx.save();
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.arc(to.x, to.y, PLAYER_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = '#22c55e';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = SHIRT_FONT;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(shirtNum, to.x, to.y + 1);
          // Label
          ctx.font = ROLE_FONT;
          ctx.fillStyle = '#22c55e';
          ctx.textBaseline = 'bottom';
          const toLabel = this.editingTransitionPhase === 'defensiveTransition' ? 'OOP' : 'IN POSS';
          ctx.fillText(toLabel, to.x, to.y + ROLE_LABEL_OFFSET_Y);
          ctx.restore();

          // Arrow from main circle → to ghost
          ctx.save();
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(anchor.x, anchor.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.setLineDash([]);
          // Arrow head
          const angle = Math.atan2(to.y - anchor.y, to.x - anchor.x);
          const headLen = 10;
          ctx.fillStyle = 'rgba(250, 204, 21, 0.7)';
          ctx.beginPath();
          ctx.moveTo(to.x, to.y);
          ctx.lineTo(to.x - headLen * Math.cos(angle - 0.4), to.y - headLen * Math.sin(angle - 0.4));
          ctx.lineTo(to.x - headLen * Math.cos(angle + 0.4), to.y - headLen * Math.sin(angle + 0.4));
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Structure lines from anchor positions (cluster-based grouping)
    const outfield = homePlayers.filter(p => p.role !== 'GK');
    if (outfield.length >= 4) {
      const sorted = [...outfield].sort((a, b) => a.formationAnchor.x - b.formationAnchor.x);

      // Cluster forwards: players within 8m of the most advanced
      const mostAdvX = sorted[sorted.length - 1]!.formationAnchor.x;
      const fwdGroup = sorted.filter(p => mostAdvX - p.formationAnchor.x < 8);
      const fwdLine = fwdGroup.reduce((s, p) => s + p.formationAnchor.x, 0) / fwdGroup.length;

      // Cluster defenders: players within 8m of the least advanced
      const leastAdvX = sorted[0]!.formationAnchor.x;
      const defGroup = sorted.filter(p => p.formationAnchor.x - leastAdvX < 8);
      const defLine = defGroup.reduce((s, p) => s + p.formationAnchor.x, 0) / defGroup.length;

      // Midfield: everything in between
      const midGroup = sorted.filter(p => !fwdGroup.includes(p) && !defGroup.includes(p));
      const midLine = midGroup.length > 0
        ? midGroup.reduce((s, p) => s + p.formationAnchor.x, 0) / midGroup.length
        : (defLine + fwdLine) / 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);

      // Extend lines 3m beyond pitch edges so they're visible even on halfway line
      for (const lineX of [defLine, midLine, fwdLine]) {
        const left = this.pitchToCanvas({ x: lineX, y: -3 });
        const right = this.pitchToCanvas({ x: lineX, y: 71 });
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  // ============================================================
  // Ghost anchors (live play — faint formation position markers)
  // ============================================================

  /**
   * Draws faint ghost circles at home team anchor positions during live play.
   * Shows where players SHOULD be relative to their formation.
   */
  private drawGhostAnchors(ctx: CanvasRenderingContext2D, snap: SimSnapshot): void {
    const homePlayers = snap.players.filter(p => p.teamId === 'home');
    if (homePlayers.length === 0) return;

    ctx.save();
    ctx.globalAlpha = 0.25;

    for (let i = 0; i < homePlayers.length; i++) {
      const p = homePlayers[i]!;
      const anchor = this.pitchToCanvas(p.formationAnchor);
      const isGK = p.role === 'GK';
      const fillColor = isGK ? HOME_GK_COLOR : HOME_COLOR;

      // Ghost circle (smaller, unfilled)
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, PLAYER_RADIUS - 2, 0, Math.PI * 2);
      ctx.strokeStyle = fillColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Shirt number
      ctx.font = SHIRT_FONT;
      ctx.fillStyle = fillColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), anchor.x, anchor.y + 1);
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
