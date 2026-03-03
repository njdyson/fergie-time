import type { Vec2 } from '../simulation/math/vec2.ts';

// Pitch dimensions in metres (FIFA standard)
const PITCH_W = 105;
const PITCH_H = 68;

// Goal dimensions
const GOAL_WIDTH = 7.32;
const GOAL_DEPTH = 2.5; // visual depth of goal net behind the line

// Penalty area dimensions
const PENALTY_AREA_LENGTH = 16.5; // from goal line
const PENALTY_AREA_WIDTH = 40.32; // total width

// Goal area dimensions (six-yard box)
const GOAL_AREA_LENGTH = 5.5;
const GOAL_AREA_WIDTH = 18.32;

// Center circle radius
const CENTER_CIRCLE_RADIUS = 9.15;

// Corner arc radius
const CORNER_ARC_RADIUS = 1;

// Penalty spot distance from goal line
const PENALTY_SPOT_DISTANCE = 11;

// Colors
const PITCH_COLOR = '#2d8a4e';
const LINE_COLOR = '#ffffff';
const LINE_WIDTH = 0.15; // metres — mapped to canvas pixels via pitchToCanvas scale

/**
 * Draw all pitch markings onto the given 2D canvas context.
 *
 * @param ctx           - Canvas 2D rendering context
 * @param pitchToCanvas - Maps a simulation Vec2 (0..105, 0..68) to canvas { x, y } pixels
 */
export function drawPitch(
  ctx: CanvasRenderingContext2D,
  pitchToCanvas: (v: Vec2) => { x: number; y: number },
): void {
  const canvas = ctx.canvas;

  // Fill pitch green background
  ctx.fillStyle = PITCH_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- Helpers ---

  // Convert metres to canvas pixels for line width
  const scale = pitchToCanvas({ x: 1, y: 0 } as Vec2).x - pitchToCanvas({ x: 0, y: 0 } as Vec2).x;
  const scaledLineWidth = Math.max(1, Math.floor(LINE_WIDTH * scale));

  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = scaledLineWidth;
  ctx.fillStyle = LINE_COLOR;

  function canvasCoord(x: number, y: number): { x: number; y: number } {
    return pitchToCanvas({ x, y } as Vec2);
  }

  function rect(x: number, y: number, w: number, h: number): void {
    const tl = canvasCoord(x, y);
    const br = canvasCoord(x + w, y + h);
    ctx.strokeRect(
      Math.floor(tl.x),
      Math.floor(tl.y),
      Math.floor(br.x - tl.x),
      Math.floor(br.y - tl.y),
    );
  }

  function line(x1: number, y1: number, x2: number, y2: number): void {
    const a = canvasCoord(x1, y1);
    const b = canvasCoord(x2, y2);
    ctx.beginPath();
    ctx.moveTo(Math.floor(a.x), Math.floor(a.y));
    ctx.lineTo(Math.floor(b.x), Math.floor(b.y));
    ctx.stroke();
  }

  function dot(x: number, y: number, r: number): void {
    const c = canvasCoord(x, y);
    const pixelR = Math.max(2, Math.floor(r * scale));
    ctx.beginPath();
    ctx.arc(Math.floor(c.x), Math.floor(c.y), pixelR, 0, Math.PI * 2);
    ctx.fill();
  }

  function arc(
    x: number,
    y: number,
    r: number,
    startAngle: number,
    endAngle: number,
    counterClockwise = false,
  ): void {
    const c = canvasCoord(x, y);
    const pixelR = Math.floor(r * scale);
    ctx.beginPath();
    ctx.arc(Math.floor(c.x), Math.floor(c.y), pixelR, startAngle, endAngle, counterClockwise);
    ctx.stroke();
  }

  // --- 1. Pitch outline ---
  rect(0, 0, PITCH_W, PITCH_H);

  // --- 2. Halfway line ---
  line(PITCH_W / 2, 0, PITCH_W / 2, PITCH_H);

  // --- 3. Center circle ---
  arc(PITCH_W / 2, PITCH_H / 2, CENTER_CIRCLE_RADIUS, 0, Math.PI * 2);

  // --- 4. Center spot ---
  dot(PITCH_W / 2, PITCH_H / 2, 0.15);

  // --- 5. Left penalty area (home goal side) ---
  const leftPAY = (PITCH_H - PENALTY_AREA_WIDTH) / 2;
  rect(0, leftPAY, PENALTY_AREA_LENGTH, PENALTY_AREA_WIDTH);

  // --- 6. Right penalty area (away goal side) ---
  const rightPAX = PITCH_W - PENALTY_AREA_LENGTH;
  rect(rightPAX, leftPAY, PENALTY_AREA_LENGTH, PENALTY_AREA_WIDTH);

  // --- 7. Left goal area (six-yard box) ---
  const leftGAY = (PITCH_H - GOAL_AREA_WIDTH) / 2;
  rect(0, leftGAY, GOAL_AREA_LENGTH, GOAL_AREA_WIDTH);

  // --- 8. Right goal area ---
  const rightGAX = PITCH_W - GOAL_AREA_LENGTH;
  rect(rightGAX, leftGAY, GOAL_AREA_LENGTH, GOAL_AREA_WIDTH);

  // --- 9. Left goal posts ---
  const goalY1 = (PITCH_H - GOAL_WIDTH) / 2;
  const goalY2 = goalY1 + GOAL_WIDTH;
  // Draw goal as a rectangle behind the goal line
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = scaledLineWidth;
  const leftGoalTL = canvasCoord(-GOAL_DEPTH, goalY1);
  const leftGoalBR = canvasCoord(0, goalY2);
  ctx.strokeRect(
    Math.floor(leftGoalTL.x),
    Math.floor(leftGoalTL.y),
    Math.floor(leftGoalBR.x - leftGoalTL.x),
    Math.floor(leftGoalBR.y - leftGoalTL.y),
  );

  // --- 10. Right goal posts ---
  const rightGoalTL = canvasCoord(PITCH_W, goalY1);
  const rightGoalBR = canvasCoord(PITCH_W + GOAL_DEPTH, goalY2);
  ctx.strokeRect(
    Math.floor(rightGoalTL.x),
    Math.floor(rightGoalTL.y),
    Math.floor(rightGoalBR.x - rightGoalTL.x),
    Math.floor(rightGoalBR.y - rightGoalTL.y),
  );

  // Reset line color
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = scaledLineWidth;

  // --- 11. Left penalty spot ---
  dot(PENALTY_SPOT_DISTANCE, PITCH_H / 2, 0.15);

  // --- 12. Right penalty spot ---
  dot(PITCH_W - PENALTY_SPOT_DISTANCE, PITCH_H / 2, 0.15);

  // --- 13. Penalty arcs (D-arcs) ---
  // Left D: center at penalty spot, arc outside penalty area
  // The D starts where it exits the penalty area
  arc(PENALTY_SPOT_DISTANCE, PITCH_H / 2, CENTER_CIRCLE_RADIUS, -0.9, 0.9, false);

  // Right D: mirrored
  arc(PITCH_W - PENALTY_SPOT_DISTANCE, PITCH_H / 2, CENTER_CIRCLE_RADIUS, Math.PI - 0.9, Math.PI + 0.9, false);

  // --- 14. Corner arcs ---
  // Top-left corner
  arc(0, 0, CORNER_ARC_RADIUS, 0, Math.PI / 2);
  // Top-right corner
  arc(PITCH_W, 0, CORNER_ARC_RADIUS, Math.PI / 2, Math.PI);
  // Bottom-left corner
  arc(0, PITCH_H, CORNER_ARC_RADIUS, -Math.PI / 2, 0);
  // Bottom-right corner
  arc(PITCH_W, PITCH_H, CORNER_ARC_RADIUS, Math.PI, (3 * Math.PI) / 2);
}
