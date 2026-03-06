import { describe, expect, it } from 'vitest';
import { createTestRosters } from '../engine.ts';
import { generateCommentary } from './commentary.ts';
import type { GameLogEntry } from './gameLog.ts';

describe('generateCommentary', () => {
  it('announces the offside whistle', () => {
    const { home, away } = createTestRosters();
    const players = new Map([...home, ...away].map(player => [player.id, player]));
    const entry: GameLogEntry = {
      tick: 120,
      matchMinute: 4,
      type: 'offside',
      teamId: 'home',
      playerId: home[9]!.id,
      playerRole: home[9]!.role,
      position: { x: home[9]!.position.x, y: home[9]!.position.y },
    };

    const line = generateCommentary(entry, players);
    expect(line).not.toBeNull();
    expect(line?.text).toContain('referee blows for offside');
    expect(line?.type).toBe('setpiece');
  });

  it('announces a foul and the free kick', () => {
    const { home, away } = createTestRosters();
    const players = new Map([...home, ...away].map(player => [player.id, player]));
    const entry: GameLogEntry = {
      tick: 240,
      matchMinute: 8,
      type: 'foul',
      teamId: 'home',
      playerId: away[2]!.id,
      playerRole: away[2]!.role,
      position: { x: home[9]!.position.x, y: home[9]!.position.y },
      data: { victimPlayerId: home[9]!.id },
    };

    const line = generateCommentary(entry, players);
    expect(line).not.toBeNull();
    expect(line?.text).toContain('Free kick to Home');
    expect(line?.type).toBe('setpiece');
  });

  it('announces yellow and red cards distinctly', () => {
    const { home, away } = createTestRosters();
    const players = new Map([...home, ...away].map(player => [player.id, player]));

    const yellow = generateCommentary({
      tick: 300,
      matchMinute: 10,
      type: 'yellow_card',
      teamId: 'away',
      playerId: away[2]!.id,
      playerRole: away[2]!.role,
      position: { x: away[2]!.position.x, y: away[2]!.position.y },
    }, players);

    const red = generateCommentary({
      tick: 301,
      matchMinute: 10,
      type: 'red_card',
      teamId: 'away',
      playerId: away[2]!.id,
      playerRole: away[2]!.role,
      position: { x: away[2]!.position.x, y: away[2]!.position.y },
      data: { secondYellow: true },
    }, players);

    expect(yellow?.text).toContain('Yellow card');
    expect(red?.text).toContain('Second yellow');
    expect(red?.type).toBe('setpiece');
  });
});
