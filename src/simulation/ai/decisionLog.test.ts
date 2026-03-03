import { describe, it, expect } from 'vitest';
import {
  DecisionLog,
  auditScoreRanges,
} from './decisionLog.ts';
import type { AgentDecisionEntry } from './decisionLog.ts';
import { ActionType } from '../types.ts';

// Helper to create an AgentDecisionEntry
function makeEntry(
  agentId: string,
  tick: number,
  selected: (typeof ActionType)[keyof typeof ActionType],
): AgentDecisionEntry {
  return {
    tick,
    agentId,
    scores: [
      { action: ActionType.SHOOT, score: 0.8 },
      { action: ActionType.PASS_FORWARD, score: 0.6 },
      { action: ActionType.PASS_SAFE, score: 0.5 },
      { action: ActionType.DRIBBLE, score: 0.4 },
    ],
    selected,
  };
}

describe('DecisionLog', () => {
  describe('constructor', () => {
    it('creates an empty log', () => {
      const log = new DecisionLog();
      expect(log.getEntries('agent1')).toHaveLength(0);
      expect(log.getLatest('agent1')).toBeUndefined();
    });
  });

  describe('log and getEntries', () => {
    it('stores an entry for an agent', () => {
      const log = new DecisionLog();
      const entry = makeEntry('agent1', 1, ActionType.SHOOT);
      log.log(entry);
      const entries = log.getEntries('agent1');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(entry);
    });

    it('stores entries separately per agent', () => {
      const log = new DecisionLog();
      log.log(makeEntry('agent1', 1, ActionType.SHOOT));
      log.log(makeEntry('agent2', 1, ActionType.PASS_FORWARD));
      expect(log.getEntries('agent1')).toHaveLength(1);
      expect(log.getEntries('agent2')).toHaveLength(1);
      expect(log.getEntries('agent3')).toHaveLength(0);
    });

    it('accumulates multiple entries for same agent', () => {
      const log = new DecisionLog();
      log.log(makeEntry('agent1', 1, ActionType.SHOOT));
      log.log(makeEntry('agent1', 2, ActionType.PASS_FORWARD));
      log.log(makeEntry('agent1', 3, ActionType.DRIBBLE));
      expect(log.getEntries('agent1')).toHaveLength(3);
    });

    it('returns a readonly array from getEntries', () => {
      const log = new DecisionLog();
      log.log(makeEntry('agent1', 1, ActionType.SHOOT));
      const entries = log.getEntries('agent1');
      // Should not be modifiable (this is a type guarantee, but we check it's array-like)
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('getLatest', () => {
    it('returns undefined for unknown agent', () => {
      const log = new DecisionLog();
      expect(log.getLatest('unknown')).toBeUndefined();
    });

    it('returns the most recently logged entry', () => {
      const log = new DecisionLog();
      log.log(makeEntry('agent1', 1, ActionType.SHOOT));
      log.log(makeEntry('agent1', 2, ActionType.PASS_FORWARD));
      log.log(makeEntry('agent1', 3, ActionType.DRIBBLE));
      const latest = log.getLatest('agent1');
      expect(latest?.tick).toBe(3);
      expect(latest?.selected).toBe(ActionType.DRIBBLE);
    });
  });

  describe('ring buffer behavior', () => {
    it('stores up to BUFFER_SIZE (300) entries', () => {
      const log = new DecisionLog();
      for (let i = 0; i < 300; i++) {
        log.log(makeEntry('agent1', i, ActionType.SHOOT));
      }
      expect(log.getEntries('agent1')).toHaveLength(300);
    });

    it('overwrites oldest entry when buffer is full', () => {
      const log = new DecisionLog();
      // Fill buffer to capacity
      for (let i = 0; i < 300; i++) {
        log.log(makeEntry('agent1', i, ActionType.SHOOT));
      }
      // Add one more — should overwrite tick=0
      log.log(makeEntry('agent1', 300, ActionType.PASS_FORWARD));

      const entries = log.getEntries('agent1');
      // Still 300 entries (not 301)
      expect(entries).toHaveLength(300);
      // Oldest entry should now be tick=1, not tick=0
      const ticks = entries.map(e => e.tick);
      expect(ticks).not.toContain(0);
      expect(ticks).toContain(300);
    });

    it('maintains correct order after wraparound', () => {
      const log = new DecisionLog();
      for (let i = 0; i < 305; i++) {
        log.log(makeEntry('agent1', i, ActionType.SHOOT));
      }
      const entries = log.getEntries('agent1');
      expect(entries).toHaveLength(300);
      // Should contain ticks 5..304 (oldest 5 overwritten)
      const ticks = entries.map(e => e.tick);
      expect(Math.min(...ticks)).toBe(5);
      expect(Math.max(...ticks)).toBe(304);
    });

    it('getLatest still returns the most recent after ring buffer wraps', () => {
      const log = new DecisionLog();
      for (let i = 0; i < 350; i++) {
        log.log(makeEntry('agent1', i, i < 300 ? ActionType.SHOOT : ActionType.PASS_FORWARD));
      }
      const latest = log.getLatest('agent1');
      expect(latest?.tick).toBe(349);
      expect(latest?.selected).toBe(ActionType.PASS_FORWARD);
    });
  });

  describe('clear', () => {
    it('empties all logs', () => {
      const log = new DecisionLog();
      log.log(makeEntry('agent1', 1, ActionType.SHOOT));
      log.log(makeEntry('agent2', 1, ActionType.PASS_FORWARD));
      log.clear();
      expect(log.getEntries('agent1')).toHaveLength(0);
      expect(log.getEntries('agent2')).toHaveLength(0);
    });

    it('allows new entries after clear', () => {
      const log = new DecisionLog();
      log.log(makeEntry('agent1', 1, ActionType.SHOOT));
      log.clear();
      log.log(makeEntry('agent1', 2, ActionType.PASS_FORWARD));
      expect(log.getEntries('agent1')).toHaveLength(1);
      expect(log.getLatest('agent1')?.selected).toBe(ActionType.PASS_FORWARD);
    });
  });
});

describe('auditScoreRanges', () => {
  it('returns empty report for no entries', () => {
    const report = auditScoreRanges([]);
    expect(report.degenerate).toHaveLength(0);
    expect(report.underused).toHaveLength(0);
  });

  it('computes action frequencies correctly', () => {
    const entries: AgentDecisionEntry[] = [];
    // 500 PASS_SAFE, 500 SHOOT = 1000 total
    for (let i = 0; i < 500; i++) {
      entries.push(makeEntry('a', i, ActionType.PASS_SAFE));
    }
    for (let i = 500; i < 1000; i++) {
      entries.push(makeEntry('a', i, ActionType.SHOOT));
    }
    const report = auditScoreRanges(entries);
    expect(report.actionFrequencies[ActionType.PASS_SAFE]).toBeCloseTo(0.5, 2);
    expect(report.actionFrequencies[ActionType.SHOOT]).toBeCloseTo(0.5, 2);
  });

  it('flags PASS_SAFE as degenerate when selected 450/1000 times (45% > 40%)', () => {
    const entries: AgentDecisionEntry[] = [];
    for (let i = 0; i < 450; i++) {
      entries.push(makeEntry('a', i, ActionType.PASS_SAFE));
    }
    for (let i = 450; i < 1000; i++) {
      entries.push(makeEntry('a', i, ActionType.DRIBBLE));
    }
    const report = auditScoreRanges(entries);
    expect(report.degenerate).toContain(ActionType.PASS_SAFE);
  });

  it('does NOT flag action at exactly 40% as degenerate (boundary check)', () => {
    const entries: AgentDecisionEntry[] = [];
    for (let i = 0; i < 400; i++) {
      entries.push(makeEntry('a', i, ActionType.PASS_SAFE));
    }
    for (let i = 400; i < 1000; i++) {
      entries.push(makeEntry('a', i, ActionType.DRIBBLE));
    }
    const report = auditScoreRanges(entries);
    expect(report.degenerate).not.toContain(ActionType.PASS_SAFE);
  });

  it('flags SHOOT as underused when selected 10/1000 times (1% < 5%)', () => {
    const entries: AgentDecisionEntry[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(makeEntry('a', i, ActionType.SHOOT));
    }
    for (let i = 10; i < 1000; i++) {
      entries.push(makeEntry('a', i, ActionType.DRIBBLE));
    }
    const report = auditScoreRanges(entries);
    expect(report.underused).toContain(ActionType.SHOOT);
  });

  it('does NOT flag action at exactly 5% as underused (boundary check)', () => {
    const entries: AgentDecisionEntry[] = [];
    for (let i = 0; i < 50; i++) {
      entries.push(makeEntry('a', i, ActionType.SHOOT));
    }
    for (let i = 50; i < 1000; i++) {
      entries.push(makeEntry('a', i, ActionType.DRIBBLE));
    }
    const report = auditScoreRanges(entries);
    expect(report.underused).not.toContain(ActionType.SHOOT);
  });

  it('does NOT flag action selected at 30% as underused or degenerate', () => {
    const entries: AgentDecisionEntry[] = [];
    for (let i = 0; i < 300; i++) {
      entries.push(makeEntry('a', i, ActionType.SHOOT));
    }
    for (let i = 300; i < 1000; i++) {
      entries.push(makeEntry('a', i, ActionType.DRIBBLE));
    }
    const report = auditScoreRanges(entries);
    expect(report.degenerate).not.toContain(ActionType.SHOOT);
    expect(report.underused).not.toContain(ActionType.SHOOT);
  });

  it('can flag multiple degenerate and underused actions simultaneously', () => {
    const entries: AgentDecisionEntry[] = [];
    // DRIBBLE 50%, PASS_SAFE 45%, SHOOT 5% → DRIBBLE not degen, PASS_SAFE degen, SHOOT at boundary
    for (let i = 0; i < 500; i++) {
      entries.push(makeEntry('a', i, ActionType.DRIBBLE));
    }
    for (let i = 500; i < 950; i++) {
      entries.push(makeEntry('a', i, ActionType.PASS_SAFE));
    }
    for (let i = 950; i < 1000; i++) {
      entries.push(makeEntry('a', i, ActionType.SHOOT));
    }
    const report = auditScoreRanges(entries);
    expect(report.degenerate).toContain(ActionType.DRIBBLE); // 50% > 40%
    expect(report.degenerate).toContain(ActionType.PASS_SAFE); // 45% > 40%
    // Actions not in entries at all should be considered underused
    expect(report.underused).toContain(ActionType.PRESS); // 0% < 5%
  });

  it('includes actions with 0% frequency in underused', () => {
    const entries: AgentDecisionEntry[] = [];
    // Only DRIBBLE selected
    for (let i = 0; i < 100; i++) {
      entries.push(makeEntry('a', i, ActionType.DRIBBLE));
    }
    const report = auditScoreRanges(entries);
    // All other actions are at 0% — should be underused
    expect(report.underused).toContain(ActionType.SHOOT);
    expect(report.underused).toContain(ActionType.PASS_FORWARD);
    expect(report.underused).toContain(ActionType.PASS_SAFE);
    expect(report.underused).toContain(ActionType.PRESS);
    // DRIBBLE at 100% — degenerate
    expect(report.degenerate).toContain(ActionType.DRIBBLE);
  });

  it('actionFrequencies sums to ~1.0', () => {
    const entries: AgentDecisionEntry[] = [];
    for (let i = 0; i < 1000; i++) {
      const actions = [
        ActionType.SHOOT, ActionType.PASS_FORWARD, ActionType.PASS_SAFE,
        ActionType.DRIBBLE, ActionType.PRESS,
      ];
      entries.push(makeEntry('a', i, actions[i % actions.length]!));
    }
    const report = auditScoreRanges(entries);
    const total = Object.values(report.actionFrequencies).reduce((sum, v) => sum + v, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });
});
