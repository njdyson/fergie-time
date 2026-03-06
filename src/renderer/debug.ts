import type { SimSnapshot, PlayerState, ActionType, TeamId, ActionIntent } from '../simulation/types.ts';
import type { DecisionLog } from '../simulation/ai/decisionLog.ts';
import { Vec2 } from '../simulation/math/vec2.ts';
import { TUNING } from '../simulation/tuning.ts';

const PANEL_WIDTH = 300;
const PANEL_INSET = 6;
const PANEL_GAP = 4;
const PLAYER_ROW_HEIGHT = 74;
const HEADER_HEIGHT = 16;
const ACTION_ROW_HEIGHT = 10;
const ACTION_ROWS = 5;
const PANEL_BG = 'rgba(5, 10, 20, 0.9)';
const PANEL_BORDER = 'rgba(148, 163, 184, 0.18)';
const POSSESSION_BORDER = '#facc15';
const SELECTED_BORDER = '#22d3ee';
const MUTED_TEXT = '#93a4bb';
const CURRENT_TEXT = '#f8fafc';
const FONT_HEADER = 'bold 11px monospace';
const FONT_ROW = '10px monospace';
const TEAM_ACCENT: Record<TeamId, string> = {
  home: '#3b82f6',
  away: '#ef4444',
};
const VISION_FILL: Record<TeamId, string> = {
  home: 'rgba(96, 165, 250, 0.14)',
  away: 'rgba(239, 68, 68, 0.08)',
};
const VISION_STROKE: Record<TeamId, string> = {
  home: 'rgba(191, 219, 254, 0.42)',
  away: 'rgba(248, 113, 113, 0.2)',
};
const ACTION_BAR_WIDTH = 58;
const DEBUG_VISION_RADIUS_SCALE = 0.58;
const DEBUG_VISION_ARC_SCALE = 0.72;
const ACTION_ORDER: readonly ActionType[] = [
  'SHOOT',
  'PASS_THROUGH',
  'PASS_FORWARD',
  'PASS_SAFE',
  'DRIBBLE',
  'HOLD_SHIELD',
  'OFFER_SUPPORT',
  'MAKE_RUN',
  'PRESS',
  'MOVE_TO_POSITION',
] as const;

type PitchToCanvas = (v: { x: number; y: number }) => { x: number; y: number };

interface ActionAverage {
  action: ActionType;
  avgScore: number;
  selectionPct: number;
}

export class DebugOverlay {
  private readonly debugCanvas: HTMLCanvasElement;
  private readonly decisionLog: DecisionLog;
  private readonly teamId: TeamId;
  private lastSnapshot: SimSnapshot | null = null;
  private selectedPlayerId: string | null = null;

  constructor(debugCanvas: HTMLCanvasElement, decisionLog: DecisionLog, teamId: TeamId) {
    this.debugCanvas = debugCanvas;
    this.decisionLog = decisionLog;
    this.teamId = teamId;
    this.resizeDebugCanvas();
    window.addEventListener('resize', () => this.resizeDebugCanvas());
  }

  private resizeDebugCanvas(): void {
    this.debugCanvas.width = PANEL_WIDTH;
    this.debugCanvas.height = window.innerHeight;
  }

  drawPanels(snapshot: SimSnapshot): void {
    const ctx = this.debugCanvas.getContext('2d');
    if (!ctx) return;
    this.lastSnapshot = snapshot;

    ctx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);

    const players = snapshot.players
      .filter((player) => player.teamId === this.teamId)
      .sort((a, b) => shirtNumber(a.id) - shirtNumber(b.id));

    let y = PANEL_INSET;
    for (const player of players) {
      this.drawPlayerPanel(ctx, snapshot, player, y);
      y += PLAYER_ROW_HEIGHT + PANEL_GAP;
    }
  }

  drawPossessionHighlight(
    snapshot: SimSnapshot,
    ctx: CanvasRenderingContext2D,
    pitchToCanvas: PitchToCanvas,
  ): void {
    if (!snapshot.ball.carrierId) return;
    const carrier = snapshot.players.find((player) => player.id === snapshot.ball.carrierId);
    if (!carrier) return;

    const pos = pitchToCanvas(carrier.position);
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
    ctx.strokeStyle = POSSESSION_BORDER;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
    ctx.strokeStyle = carrier.teamId === 'home' ? TEAM_ACCENT.home : TEAM_ACCENT.away;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();
  }

  drawPitchVisuals(
    snapshot: SimSnapshot,
    ctx: CanvasRenderingContext2D,
    pitchToCanvas: PitchToCanvas,
    intents: readonly ActionIntent[],
  ): void {
    const teamPlayers = snapshot.players.filter((player) => player.teamId === this.teamId);
    const intentsByAgent = new Map(intents.map((intent) => [intent.agentId, intent]));
    const selectedPlayer = this.selectedPlayerId
      ? teamPlayers.find((player) => player.id === this.selectedPlayerId)
      : null;

    ctx.save();
    if (selectedPlayer) {
      const intent = intentsByAgent.get(selectedPlayer.id);
      this.drawVisionCone(ctx, pitchToCanvas, snapshot, selectedPlayer, intent);
    }
    for (const player of teamPlayers) {
      const intent = intentsByAgent.get(player.id);
      if (!intent) continue;
      this.drawIntentLine(ctx, pitchToCanvas, snapshot, player, intent);
    }
    ctx.restore();
  }

  private drawPlayerPanel(
    ctx: CanvasRenderingContext2D,
    snapshot: SimSnapshot,
    player: PlayerState,
    y: number,
  ): void {
    const x = PANEL_INSET;
    const width = this.debugCanvas.width - PANEL_INSET * 2;
    const isCarrier = snapshot.ball.carrierId === player.id;
    const isSelected = this.selectedPlayerId === player.id;
    const latest = this.decisionLog.getLatest(player.id);
    const displayActions = this.getDisplayActions(player.id, latest?.selected);

    ctx.save();
    this.drawRoundedRect(ctx, x, y, width, PLAYER_ROW_HEIGHT, 5);
    ctx.fillStyle = PANEL_BG;
    ctx.fill();
    ctx.strokeStyle = isSelected ? SELECTED_BORDER : (isCarrier ? POSSESSION_BORDER : PANEL_BORDER);
    ctx.lineWidth = isSelected ? 1.8 : (isCarrier ? 1.6 : 1);
    ctx.stroke();

    ctx.fillStyle = TEAM_ACCENT[player.teamId];
    ctx.fillRect(x, y, 4, PLAYER_ROW_HEIGHT);

    const shirt = shirtNumber(player.id);
    ctx.fillStyle = CURRENT_TEXT;
    ctx.font = FONT_HEADER;
    ctx.textAlign = 'left';
    ctx.fillText(`${shirt.toString().padStart(2, '0')} ${player.role}`, x + 10, y + HEADER_HEIGHT);

    if (latest?.selected) {
      ctx.textAlign = 'right';
      ctx.fillStyle = isSelected ? SELECTED_BORDER : (isCarrier ? POSSESSION_BORDER : MUTED_TEXT);
      ctx.fillText(formatAction(latest.selected), x + width - 8, y + HEADER_HEIGHT);
    }

    let rowY = y + HEADER_HEIGHT + 12;
    for (const row of displayActions) {
      const isCurrent = row.action === latest?.selected;
      const style = getIntentStyle(row.action);
      ctx.textAlign = 'left';
      ctx.font = FONT_ROW;
      ctx.fillStyle = isCurrent ? withAdjustedAlpha(style.color, 1.15) : style.color;
      ctx.fillText(formatAction(row.action), x + 10, rowY);

      const barX = x + 92;
      const scoreClamped = Math.max(0, Math.min(1, row.avgScore));
      this.drawBar(ctx, barX, rowY - 7, scoreClamped, ACTION_BAR_WIDTH, isCurrent, style.color);

      ctx.fillStyle = isCurrent ? CURRENT_TEXT : MUTED_TEXT;
      ctx.fillText(row.avgScore.toFixed(2), barX + ACTION_BAR_WIDTH + 6, rowY);

      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(row.selectionPct)}%`, x + width - 8, rowY);
      rowY += ACTION_ROW_HEIGHT;
    }

    ctx.restore();
  }

  setSelectedPlayerId(playerId: string | null): void {
    this.selectedPlayerId = playerId;
  }

  getSelectedPlayerIdAt(y: number): string | null {
    const snapshot = this.lastSnapshot;
    if (!snapshot) return null;

    const players = snapshot.players
      .filter((player) => player.teamId === this.teamId)
      .sort((a, b) => shirtNumber(a.id) - shirtNumber(b.id));

    const rowSpan = PLAYER_ROW_HEIGHT + PANEL_GAP;
    const relativeY = y - PANEL_INSET;
    if (relativeY < 0) return null;
    const rowIndex = Math.floor(relativeY / rowSpan);
    const rowOffset = relativeY - rowIndex * rowSpan;
    if (rowOffset > PLAYER_ROW_HEIGHT) return null;
    return players[rowIndex]?.id ?? null;
  }

  private getDisplayActions(agentId: string, currentAction?: ActionType): ActionAverage[] {
    const entries = this.decisionLog.getRecent(agentId, 75);
    if (entries.length === 0) return [];

    const accum = new Map<ActionType, { total: number; count: number; selections: number }>();
    for (const action of ACTION_ORDER) {
      accum.set(action, { total: 0, count: 0, selections: 0 });
    }

    for (const entry of entries) {
      for (const { action, score } of entry.scores) {
        const bucket = accum.get(action as ActionType);
        if (!bucket) continue;
        bucket.total += score;
        bucket.count += 1;
      }
      const selected = accum.get(entry.selected);
      if (selected) selected.selections += 1;
    }

    const ranked = ACTION_ORDER.map((action) => {
      const bucket = accum.get(action)!;
      return {
        action,
        avgScore: bucket.count > 0 ? bucket.total / bucket.count : 0,
        selectionPct: entries.length > 0 ? (bucket.selections / entries.length) * 100 : 0,
      };
    }).sort((a, b) => b.avgScore - a.avgScore);

    const top = ranked.slice(0, ACTION_ROWS);
    if (currentAction && !top.some((row) => row.action === currentAction)) {
      const currentRow = ranked.find((row) => row.action === currentAction);
      if (currentRow) {
        top[top.length - 1] = currentRow;
      }
    }

    top.sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action));
    return top;
  }

  private drawBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    value: number,
    width: number,
    isCurrent: boolean,
    color: string,
  ): void {
    const fillWidth = Math.round(width * value);

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x, y, width, 6);
    ctx.fillStyle = withAdjustedAlpha(color, 0.9 + value * 0.35);
    ctx.fillRect(x, y, fillWidth, 6);
    if (isCurrent) {
      ctx.strokeStyle = withAdjustedAlpha(color, 1.2);
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, width + 1, 7);
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

  private drawVisionCone(
    ctx: CanvasRenderingContext2D,
    pitchToCanvas: PitchToCanvas,
    snapshot: SimSnapshot,
    player: PlayerState,
    intent?: ActionIntent,
  ): void {
    const facing = resolveFacingDirection(player, snapshot, intent);
    const start = pitchToCanvas(player.position);
    const visionLength =
      (TUNING.opponentVisionRadiusMin +
      player.attributes.vision * (TUNING.opponentVisionRadiusMax - TUNING.opponentVisionRadiusMin)) * DEBUG_VISION_RADIUS_SCALE;
    const blindSpotAngle = Math.acos(Math.max(-1, Math.min(1, TUNING.opponentVisionBlindSpotDot))) * DEBUG_VISION_ARC_SCALE;
    const visionArcDeg = (blindSpotAngle * 180) / Math.PI;
    const left = rotateVector(facing, -visionArcDeg).scale(visionLength);
    const right = rotateVector(facing, visionArcDeg).scale(visionLength);
    const leftPt = pitchToCanvas(player.position.add(left));
    const rightPt = pitchToCanvas(player.position.add(right));

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(leftPt.x, leftPt.y);
    ctx.arc(
      start.x,
      start.y,
      Math.hypot(leftPt.x - start.x, leftPt.y - start.y),
      Math.atan2(leftPt.y - start.y, leftPt.x - start.x),
      Math.atan2(rightPt.y - start.y, rightPt.x - start.x),
    );
    ctx.closePath();
    ctx.fillStyle = snapshot.ball.carrierId === player.id
      ? withAdjustedAlpha(VISION_FILL[player.teamId], 1.35)
      : VISION_FILL[player.teamId];
    ctx.fill();
    ctx.strokeStyle = snapshot.ball.carrierId === player.id
      ? withAdjustedAlpha(VISION_STROKE[player.teamId], 1.25)
      : VISION_STROKE[player.teamId];
    ctx.lineWidth = snapshot.ball.carrierId === player.id ? 1.35 : 1.1;
    ctx.stroke();
    ctx.restore();
  }

  private drawIntentLine(
    ctx: CanvasRenderingContext2D,
    pitchToCanvas: PitchToCanvas,
    snapshot: SimSnapshot,
    player: PlayerState,
    intent: ActionIntent,
  ): void {
    const target = resolveIntentTarget(player, snapshot, intent);
    if (!target) return;

    const start = pitchToCanvas(player.position);
    const end = pitchToCanvas(target);
    const style = getIntentStyle(intent.action);

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash(style.dash);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.stroke();

    const tipDir = target.subtract(player.position).normalize();
    const left = rotateVector(tipDir, 150).scale(1.2);
    const right = rotateVector(tipDir, -150).scale(1.2);
    const leftPt = pitchToCanvas(target.add(left));
    const rightPt = pitchToCanvas(target.add(right));
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(leftPt.x, leftPt.y);
    ctx.lineTo(rightPt.x, rightPt.y);
    ctx.closePath();
    ctx.fillStyle = style.color;
    ctx.fill();
    ctx.restore();
  }
}

function shirtNumber(playerId: string): number {
  const tail = playerId.split('-').pop();
  const parsed = Number.parseInt(tail ?? '0', 10);
  return Number.isNaN(parsed) ? 0 : parsed + 1;
}

function formatAction(action: ActionType): string {
  switch (action) {
    case 'MOVE_TO_POSITION': return 'Move';
    case 'PASS_FORWARD': return 'Pass+';
    case 'PASS_SAFE': return 'Pass=';
    case 'PASS_THROUGH': return 'Through';
    case 'HOLD_SHIELD': return 'Shield';
    case 'MAKE_RUN': return 'Run';
    case 'OFFER_SUPPORT': return 'Support';
    case 'DRIBBLE': return 'Dribble';
    case 'SHOOT': return 'Shoot';
    case 'PRESS': return 'Press';
    default: return action;
  }
}

function resolveFacingDirection(
  player: PlayerState,
  snapshot: SimSnapshot,
  intent?: ActionIntent,
): Vec2 {
  const target = intent ? resolveIntentTarget(player, snapshot, intent) : null;
  if (target) {
    const toTarget = target.subtract(player.position);
    if (toTarget.length() > 0.01) return toTarget.normalize();
  }

  return resolveBaseFacingDirection(player, snapshot);
}

function resolveBaseFacingDirection(
  player: PlayerState,
  snapshot: SimSnapshot,
): Vec2 {

  if (player.velocity.length() > 0.2) {
    return player.velocity.normalize();
  }

  if (snapshot.ball.carrierId && snapshot.ball.carrierId !== player.id) {
    const ballDir = snapshot.ball.position.subtract(player.position);
    if (ballDir.length() > 0.01) return ballDir.normalize();
  }

  return new Vec2(player.teamId === 'home' ? 1 : -1, 0);
}

function resolveIntentTarget(
  player: PlayerState,
  snapshot: SimSnapshot,
  intent: ActionIntent,
): Vec2 | null {
  if (intent.targetPlayerId) {
    const targetPlayer = snapshot.players.find((candidate) => candidate.id === intent.targetPlayerId);
    if (targetPlayer) return targetPlayer.position;
  }
  if (intent.target) return intent.target;

  switch (intent.action) {
    case 'SHOOT':
      return new Vec2(player.teamId === 'home' ? 105 : 0, 34);
    case 'PASS_FORWARD':
    case 'PASS_SAFE':
      return player.position.add(resolveBaseFacingDirection(player, snapshot).scale(16));
    case 'PASS_THROUGH':
      return player.position.add(resolveBaseFacingDirection(player, snapshot).scale(22));
    case 'DRIBBLE':
      return player.position.add(resolveBaseFacingDirection(player, snapshot).scale(8));
    case 'MAKE_RUN':
    case 'PRESS':
      return player.position.add(resolveBaseFacingDirection(player, snapshot).scale(10));
    case 'OFFER_SUPPORT':
    case 'MOVE_TO_POSITION':
      return player.position.add(resolveBaseFacingDirection(player, snapshot).scale(6));
    default:
      return null;
  }
}

function rotateVector(vec: Vec2, degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return new Vec2(
    vec.x * cos - vec.y * sin,
    vec.x * sin + vec.y * cos,
  );
}

function withAdjustedAlpha(rgba: string, multiplier: number): string {
  const match = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if (!match) return rgba;
  const [, r, g, b, a] = match;
  const nextAlpha = Math.min(1, Number.parseFloat(a ?? '1') * multiplier);
  return `rgba(${r}, ${g}, ${b}, ${nextAlpha})`;
}

function getIntentStyle(action: ActionType): { color: string; width: number; dash: number[] } {
  switch (action) {
    case 'SHOOT':
      return { color: 'rgba(251, 146, 60, 0.95)', width: 2.4, dash: [] };
    case 'PASS_THROUGH':
      return { color: 'rgba(34, 211, 238, 0.95)', width: 2, dash: [7, 4] };
    case 'PASS_FORWARD':
      return { color: 'rgba(125, 211, 252, 0.9)', width: 1.8, dash: [7, 3] };
    case 'PASS_SAFE':
      return { color: 'rgba(186, 230, 253, 0.85)', width: 1.5, dash: [4, 3] };
    case 'DRIBBLE':
      return { color: 'rgba(74, 222, 128, 0.9)', width: 1.8, dash: [] };
    case 'PRESS':
      return { color: 'rgba(250, 204, 21, 0.85)', width: 1.8, dash: [5, 3] };
    case 'MAKE_RUN':
      return { color: 'rgba(96, 165, 250, 0.85)', width: 1.7, dash: [6, 3] };
    case 'OFFER_SUPPORT':
      return { color: 'rgba(148, 163, 184, 0.65)', width: 1.3, dash: [3, 3] };
    case 'MOVE_TO_POSITION':
      return { color: 'rgba(100, 116, 139, 0.55)', width: 1.2, dash: [2, 4] };
    default:
      return { color: 'rgba(148, 163, 184, 0.6)', width: 1.2, dash: [2, 4] };
  }
}
