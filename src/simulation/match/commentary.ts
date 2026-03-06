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

/** Get surname (last word of full name) */
function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
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

/** Resolve a player ID to "Surname" using the player list, fallback to role */
function resolvePlayer(id: string, players: ReadonlyMap<string, PlayerState>): string {
  const p = players.get(id);
  if (!p) return id;
  return p.name ? surname(p.name) : String(p.role);
}

/** Build a display label from a game log entry + player map: "Surname" or fallback to role */
function entryLabel(playerId: string, playerRole: string, players: ReadonlyMap<string, PlayerState>): string {
  const p = players.get(playerId);
  if (p?.name) return surname(p.name);
  return playerRole;
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
      const pLabel = entryLabel(entry.playerId!, entry.playerRole!, players);
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
      const pLabel = entryLabel(entry.playerId!, entry.playerRole!, players);
      const t = team(entry.teamId);
      const zone = shotZone(dist);
      return { tick: entry.tick, matchMinute: min, text: `${t} ${pLabel} shoots ${zone}!`, type: 'shot' };
    }

    case 'goal': {
      const score = entry.data?.score as [number, number];
      const pLabel = entryLabel(entry.playerId!, entry.playerRole!, players);
      const t = team(entry.teamId);
      return {
        tick: entry.tick, matchMinute: min,
        text: `GOAL! ${t} ${pLabel} scores! (${score[0]}-${score[1]})`,
        type: 'goal',
      };
    }

    case 'tackle': {
      if (!(entry.data?.success as boolean)) return null;
      const pLabel = entryLabel(entry.playerId!, entry.playerRole!, players);
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

    case 'free_kick': {
      const t = team(entry.teamId);
      const pLabel = entry.playerId ? resolvePlayer(entry.playerId, players) : '';
      return {
        tick: entry.tick, matchMinute: min,
        text: `Free kick ${t}${pLabel ? ` - ${pLabel} standing over it` : ''}.`,
        type: 'setpiece',
      };
    }

    case 'foul': {
      const awardedTeam = team(entry.teamId);
      const fouler = entryLabel(entry.playerId!, entry.playerRole!, players);
      const victimId = entry.data?.victimPlayerId as string | undefined;
      const victim = victimId ? resolvePlayer(victimId, players) : 'the attacker';
      return {
        tick: entry.tick, matchMinute: min,
        text: `Foul by ${fouler} on ${victim}. Free kick to ${awardedTeam}.`,
        type: 'setpiece',
      };
    }

    case 'yellow_card': {
      const pLabel = entryLabel(entry.playerId!, entry.playerRole!, players);
      const t = team(entry.teamId);
      return {
        tick: entry.tick, matchMinute: min,
        text: `Yellow card for ${t} ${pLabel}.`,
        type: 'setpiece',
      };
    }

    case 'red_card': {
      const pLabel = entryLabel(entry.playerId!, entry.playerRole!, players);
      const t = team(entry.teamId);
      const secondYellow = Boolean(entry.data?.secondYellow);
      return {
        tick: entry.tick, matchMinute: min,
        text: secondYellow
          ? `Second yellow for ${t} ${pLabel} and the referee sends them off.`
          : `Red card for ${t} ${pLabel} and they are off.`,
        type: 'setpiece',
      };
    }

    case 'offside': {
      const pLabel = entryLabel(entry.playerId!, entry.playerRole!, players);
      const t = team(entry.teamId);
      return {
        tick: entry.tick, matchMinute: min,
        text: `The referee blows for offside against ${t} ${pLabel}.`,
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
