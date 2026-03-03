import { describe, it, expect } from 'vitest';
import {
  advancePhase,
  TICKS_PER_HALF,
  TOTAL_MATCH_TICKS,
} from './phases.ts';
import { MatchPhase } from '../types.ts';

describe('Phase constants', () => {
  it('TICKS_PER_HALF is 2700', () => {
    expect(TICKS_PER_HALF).toBe(2700);
  });

  it('TOTAL_MATCH_TICKS is 5400', () => {
    expect(TOTAL_MATCH_TICKS).toBe(5400);
  });

  it('TOTAL_MATCH_TICKS equals 2 * TICKS_PER_HALF', () => {
    expect(TOTAL_MATCH_TICKS).toBe(2 * TICKS_PER_HALF);
  });
});

describe('advancePhase - KICKOFF transitions', () => {
  it('stays KICKOFF at tick 0 when justScored=false', () => {
    const result = advancePhase(MatchPhase.KICKOFF, 0, false);
    expect(result.phase).toBe(MatchPhase.KICKOFF);
  });

  it('transitions KICKOFF → FIRST_HALF at tick 1', () => {
    const result = advancePhase(MatchPhase.KICKOFF, 1, false);
    expect(result.phase).toBe(MatchPhase.FIRST_HALF);
  });

  it('produces no events when staying in KICKOFF at tick 0', () => {
    const result = advancePhase(MatchPhase.KICKOFF, 0, false);
    expect(result.events).toHaveLength(0);
  });

  it('produces kickoff event on KICKOFF → FIRST_HALF transition', () => {
    const result = advancePhase(MatchPhase.KICKOFF, 1, false);
    const kickoffEvents = result.events.filter(e => e.type === 'kickoff');
    expect(kickoffEvents).toHaveLength(1);
    expect(kickoffEvents[0]!.tick).toBe(1);
  });
});

describe('advancePhase - FIRST_HALF transitions', () => {
  it('stays FIRST_HALF at tick 2699', () => {
    const result = advancePhase(MatchPhase.FIRST_HALF, 2699, false);
    expect(result.phase).toBe(MatchPhase.FIRST_HALF);
  });

  it('transitions FIRST_HALF → HALFTIME at tick 2700', () => {
    const result = advancePhase(MatchPhase.FIRST_HALF, 2700, false);
    expect(result.phase).toBe(MatchPhase.HALFTIME);
  });

  it('produces halftime event at tick 2700', () => {
    const result = advancePhase(MatchPhase.FIRST_HALF, 2700, false);
    const halftimeEvents = result.events.filter(e => e.type === 'halftime');
    expect(halftimeEvents).toHaveLength(1);
    expect(halftimeEvents[0]!.tick).toBe(2700);
  });

  it('produces no events while in FIRST_HALF before halftime', () => {
    const result = advancePhase(MatchPhase.FIRST_HALF, 1000, false);
    expect(result.events).toHaveLength(0);
  });
});

describe('advancePhase - HALFTIME transitions', () => {
  it('transitions HALFTIME → SECOND_HALF at tick 2701', () => {
    const result = advancePhase(MatchPhase.HALFTIME, 2701, false);
    expect(result.phase).toBe(MatchPhase.SECOND_HALF);
  });

  it('stays HALFTIME at tick 2700', () => {
    const result = advancePhase(MatchPhase.HALFTIME, 2700, false);
    expect(result.phase).toBe(MatchPhase.HALFTIME);
  });

  it('produces no events while in HALFTIME', () => {
    const result = advancePhase(MatchPhase.HALFTIME, 2700, false);
    expect(result.events).toHaveLength(0);
  });
});

describe('advancePhase - SECOND_HALF transitions', () => {
  it('stays SECOND_HALF before tick 5400', () => {
    const result = advancePhase(MatchPhase.SECOND_HALF, 5399, false);
    expect(result.phase).toBe(MatchPhase.SECOND_HALF);
  });

  it('transitions SECOND_HALF → FULL_TIME at tick 5400', () => {
    const result = advancePhase(MatchPhase.SECOND_HALF, 5400, false);
    expect(result.phase).toBe(MatchPhase.FULL_TIME);
  });

  it('produces fulltime event at tick 5400', () => {
    const result = advancePhase(MatchPhase.SECOND_HALF, 5400, false);
    const fulltimeEvents = result.events.filter(e => e.type === 'fulltime');
    expect(fulltimeEvents).toHaveLength(1);
    expect(fulltimeEvents[0]!.tick).toBe(5400);
  });
});

describe('advancePhase - FULL_TIME terminal state', () => {
  it('stays FULL_TIME beyond tick 5400', () => {
    const result = advancePhase(MatchPhase.FULL_TIME, 5401, false);
    expect(result.phase).toBe(MatchPhase.FULL_TIME);
  });

  it('stays FULL_TIME at tick 5400', () => {
    const result = advancePhase(MatchPhase.FULL_TIME, 5400, false);
    expect(result.phase).toBe(MatchPhase.FULL_TIME);
  });

  it('produces no events in FULL_TIME', () => {
    const result = advancePhase(MatchPhase.FULL_TIME, 6000, false);
    expect(result.events).toHaveLength(0);
  });
});

describe('advancePhase - goal → kickoff restart', () => {
  it('FIRST_HALF with justScored=true returns KICKOFF phase', () => {
    const result = advancePhase(MatchPhase.FIRST_HALF, 1500, true);
    expect(result.phase).toBe(MatchPhase.KICKOFF);
  });

  it('SECOND_HALF with justScored=true returns KICKOFF phase', () => {
    const result = advancePhase(MatchPhase.SECOND_HALF, 3500, true);
    expect(result.phase).toBe(MatchPhase.KICKOFF);
  });

  it('justScored produces a goal event', () => {
    const result = advancePhase(MatchPhase.FIRST_HALF, 1500, true);
    const goalEvents = result.events.filter(e => e.type === 'goal');
    expect(goalEvents).toHaveLength(1);
    expect(goalEvents[0]!.tick).toBe(1500);
  });

  it('justScored at halftime tick still triggers kickoff (goal takes priority)', () => {
    // A goal scored exactly at tick 2700 should result in kickoff, not halftime
    const result = advancePhase(MatchPhase.FIRST_HALF, 2700, true);
    expect(result.phase).toBe(MatchPhase.KICKOFF);
  });
});

describe('advancePhase - return type structure', () => {
  it('always returns an object with phase and events', () => {
    const result = advancePhase(MatchPhase.FIRST_HALF, 100, false);
    expect(result).toHaveProperty('phase');
    expect(result).toHaveProperty('events');
    expect(Array.isArray(result.events)).toBe(true);
  });
});
