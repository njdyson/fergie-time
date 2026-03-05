import type { GameLogEntry } from './gameLog.ts';
import type { PlayerState } from '../types.ts';

// ============================================================
// Commentary line
// ============================================================

export interface CommentaryLine {
  readonly tick: number;
  readonly matchMinute: number;
  readonly text: string;
  readonly type: 'pass' | 'shot' | 'goal' | 'tackle' | 'info' | 'setpiece';
}

// ============================================================
// Helpers
// ============================================================

/** "home-9" → 10 (1-indexed shirt number) */
function shirtNum(playerId: string): number {
  return parseInt(playerId.split('-')[1] ?? '0', 10) + 1;
}

/** "10 ST" */
function label(playerId: string, role: string): string {
  return `${shirtNum(playerId)} ${role}`;
}

function team(teamId: string): string {
  return teamId === 'home' ? 'Home' : 'Away';
}

function shotZone(dist: number): string {
  if (dist <= 5.5) return 'from close range';
  if (dist <= 16.5) return 'from inside the box';
  if (dist <= 25) return 'from the edge of the area';
  if (dist <= 35) return 'from outside the box';
  return 'from long range';
}

function passDesc(dist: number): string {
  if (dist < 12) return 'short';
  if (dist > 28) return 'long';
  return '';
}

/** Resolve a player ID to "10 ST" using the player list */
function resolvePlayer(id: string, players: ReadonlyMap<string, PlayerState>): string {
  const p = players.get(id);
  return p ? label(id, p.role) : id;
}

// ============================================================
// Generate commentary from a single event
// ============================================================

/**
 * Turn a game log entry into a human-readable commentary line.
 * Returns null for events that don't warrant commentary (failed tackles, phase markers, etc.).
 */
export function generateCommentary(
  entry: GameLogEntry,
  players: ReadonlyMap<string, PlayerState>,
): CommentaryLine | null {
  const min = entry.matchMinute;

  switch (entry.type) {
    case 'pass': {
      const dist = (entry.data?.distance as number) ?? 0;
      const passType = entry.data?.passType as string;
      const targetId = entry.data?.targetPlayerId as string;
      const pLabel = label(entry.playerId!, entry.playerRole!);
      const tLabel = targetId ? resolvePlayer(targetId, players) : '?';
      const t = team(entry.teamId);
      const len = passDesc(dist);

      let text: string;
      if (len === 'long') {
        text = `${t} ${pLabel} plays a long ball to ${tLabel} (${dist}m)`;
      } else if (len === 'short') {
        text = `${t} ${pLabel} ${passType === 'safe' ? 'lays it off' : 'plays it'} to ${tLabel}`;
      } else {
        const dir = passType === 'forward' ? 'forward' : 'back';
        text = `${t} ${pLabel} passes ${dir} to ${tLabel} (${dist}m)`;
      }
      return { tick: entry.tick, matchMinute: min, text, type: 'pass' };
    }

    case 'shot': {
      const dist = (entry.data?.distanceToGoal as number) ?? 0;
      const pLabel = label(entry.playerId!, entry.playerRole!);
      const t = team(entry.teamId);
      const zone = shotZone(dist);
      return { tick: entry.tick, matchMinute: min, text: `${t} ${pLabel} shoots ${zone}!`, type: 'shot' };
    }

    case 'goal': {
      const score = entry.data?.score as [number, number];
      const pLabel = label(entry.playerId!, entry.playerRole!);
      const t = team(entry.teamId);
      return {
        tick: entry.tick, matchMinute: min,
        text: `GOAL! ${t} ${pLabel} scores! (${score[0]}-${score[1]})`,
        type: 'goal',
      };
    }

    case 'tackle': {
      if (!(entry.data?.success as boolean)) return null;
      const pLabel = label(entry.playerId!, entry.playerRole!);
      const t = team(entry.teamId);
      const targetId = entry.data?.targetPlayerId as string;
      const tgtDesc = targetId ? ` from ${resolvePlayer(targetId, players)}` : '';
      return {
        tick: entry.tick, matchMinute: min,
        text: `${t} ${pLabel} wins the ball${tgtDesc}`,
        type: 'tackle',
      };
    }

    case 'throw_in': {
      const t = team(entry.teamId);
      const pLabel = entry.playerId ? resolvePlayer(entry.playerId, players) : '';
      return {
        tick: entry.tick, matchMinute: min,
        text: `Throw-in ${t}${pLabel ? ` — ${pLabel} to take` : ''}`,
        type: 'setpiece',
      };
    }

    case 'corner': {
      const t = team(entry.teamId);
      const pLabel = entry.playerId ? resolvePlayer(entry.playerId, players) : '';
      return {
        tick: entry.tick, matchMinute: min,
        text: `Corner kick ${t}${pLabel ? ` — ${pLabel} to take` : ''}`,
        type: 'setpiece',
      };
    }

    case 'goal_kick': {
      const t = team(entry.teamId);
      return {
        tick: entry.tick, matchMinute: min,
        text: `Goal kick ${t}`,
        type: 'setpiece',
      };
    }

    case 'halftime':
      return { tick: entry.tick, matchMinute: 45, text: 'Half time.', type: 'info' };

    case 'fulltime':
      return { tick: entry.tick, matchMinute: 90, text: 'Full time!', type: 'info' };

    default:
      return null;
  }
}
