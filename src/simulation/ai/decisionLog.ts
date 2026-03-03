import type { ActionType } from '../types.ts';
import { ActionType as AT } from '../types.ts';

// ============================================================
// Types
// ============================================================

/**
 * One agent's decision at a single tick — the scored options and the selected action.
 */
export interface AgentDecisionEntry {
  readonly tick: number;
  readonly agentId: string;
  readonly scores: ReadonlyArray<{ readonly action: ActionType; readonly score: number }>;
  readonly selected: ActionType;
}

/**
 * Result of auditing decision log entries for calibration quality.
 *
 * - actionFrequencies: normalized selection frequency per action type (0..1 summing to ~1.0)
 * - degenerate: actions selected more than 40% of the time — indicates utility AI degeneracy
 * - underused: actions selected less than 5% of the time — indicates miscalibration or dead actions
 */
export interface ScoreAuditReport {
  readonly actionFrequencies: Record<ActionType, number>;
  readonly degenerate: ActionType[];
  readonly underused: ActionType[];
}

// ============================================================
// DecisionLog — per-agent ring buffer
// ============================================================

/**
 * The number of entries to retain per agent.
 * 300 entries = 10 seconds of match time at 30 ticks/sec.
 */
const BUFFER_SIZE = 300;

/**
 * Per-agent ring buffer for storing recent decision log entries.
 *
 * When the buffer is full, new entries overwrite the oldest entry (ring buffer semantics).
 * This bounds memory usage to BUFFER_SIZE entries per agent regardless of match length.
 */
export class DecisionLog {
  /**
   * Map from agentId to a ring buffer (fixed-size array) and write pointer.
   */
  private readonly buffers = new Map<string, AgentDecisionEntry[]>();
  private readonly heads = new Map<string, number>(); // write pointer per agent
  private readonly sizes = new Map<string, number>(); // current fill level per agent

  /**
   * Adds an entry to the agent's ring buffer.
   * When the buffer is full, the oldest entry is overwritten.
   */
  log(entry: AgentDecisionEntry): void {
    const { agentId } = entry;

    if (!this.buffers.has(agentId)) {
      // Initialize ring buffer with pre-allocated array
      this.buffers.set(agentId, new Array<AgentDecisionEntry>(BUFFER_SIZE));
      this.heads.set(agentId, 0);
      this.sizes.set(agentId, 0);
    }

    const buf = this.buffers.get(agentId)!;
    const head = this.heads.get(agentId)!;
    const size = this.sizes.get(agentId)!;

    buf[head] = entry;
    this.heads.set(agentId, (head + 1) % BUFFER_SIZE);
    if (size < BUFFER_SIZE) {
      this.sizes.set(agentId, size + 1);
    }
  }

  /**
   * Returns all recent entries for an agent in chronological order (oldest → newest).
   * Returns an empty array if the agent has no logged entries.
   */
  getEntries(agentId: string): readonly AgentDecisionEntry[] {
    const buf = this.buffers.get(agentId);
    if (!buf) return [];

    const head = this.heads.get(agentId)!;
    const size = this.sizes.get(agentId)!;

    if (size < BUFFER_SIZE) {
      // Buffer not yet full — entries are at indices [0..size-1] in order
      return buf.slice(0, size) as AgentDecisionEntry[];
    }

    // Buffer is full — entries wrap around. Oldest entry is at 'head' (next write position).
    // Reconstruct chronological order: [head..BUFFER_SIZE-1] + [0..head-1]
    const result: AgentDecisionEntry[] = [];
    for (let i = 0; i < BUFFER_SIZE; i++) {
      result.push(buf[(head + i) % BUFFER_SIZE]!);
    }
    return result;
  }

  /**
   * Returns the last `count` entries for an agent in chronological order (oldest → newest).
   * More efficient than getEntries() when only a small window is needed (e.g., 30 ticks).
   */
  getRecent(agentId: string, count: number): readonly AgentDecisionEntry[] {
    const buf = this.buffers.get(agentId);
    if (!buf) return [];

    const head = this.heads.get(agentId)!;
    const size = this.sizes.get(agentId)!;
    const n = Math.min(count, size);
    if (n === 0) return [];

    const result: AgentDecisionEntry[] = [];
    for (let i = 0; i < n; i++) {
      const idx = (head - n + i + BUFFER_SIZE) % BUFFER_SIZE;
      result.push(buf[idx]!);
    }
    return result;
  }

  /**
   * Returns the most recently logged entry for an agent, or undefined if none.
   */
  getLatest(agentId: string): AgentDecisionEntry | undefined {
    const buf = this.buffers.get(agentId);
    if (!buf) return undefined;

    const head = this.heads.get(agentId)!;
    const size = this.sizes.get(agentId)!;
    if (size === 0) return undefined;

    // Latest entry is just before the current head pointer
    const latestIdx = (head - 1 + BUFFER_SIZE) % BUFFER_SIZE;
    return buf[latestIdx];
  }

  /**
   * Empties all decision logs. Call on match reset.
   */
  clear(): void {
    this.buffers.clear();
    this.heads.clear();
    this.sizes.clear();
  }
}

// ============================================================
// Score range audit
// ============================================================

// All known action types for frequency coverage
const ALL_ACTIONS: ActionType[] = [
  AT.PASS_FORWARD,
  AT.PASS_SAFE,
  AT.DRIBBLE,
  AT.SHOOT,
  AT.HOLD_SHIELD,
  AT.MOVE_TO_POSITION,
  AT.PRESS,
  AT.MAKE_RUN,
];

/**
 * Audits a set of decision log entries for calibration quality.
 *
 * Computes the selection frequency of each action type over all entries.
 * Flags actions that are too dominant (degenerate, > 40%) or too rare (underused, < 5%).
 *
 * Use this post-match or after a sufficient number of ticks to detect utility AI degeneracy
 * or dead actions that need their consideration functions recalibrated.
 *
 * @param entries - Array of AgentDecisionEntry from one or more agents
 * @returns ScoreAuditReport with frequencies and flagged action types
 */
export function auditScoreRanges(entries: readonly AgentDecisionEntry[]): ScoreAuditReport {
  const counts: Record<ActionType, number> = {
    [AT.PASS_FORWARD]: 0,
    [AT.PASS_SAFE]: 0,
    [AT.DRIBBLE]: 0,
    [AT.SHOOT]: 0,
    [AT.HOLD_SHIELD]: 0,
    [AT.MOVE_TO_POSITION]: 0,
    [AT.PRESS]: 0,
    [AT.MAKE_RUN]: 0,
  };

  for (const entry of entries) {
    counts[entry.selected] = (counts[entry.selected] ?? 0) + 1;
  }

  const total = entries.length;
  const actionFrequencies: Record<ActionType, number> = { ...counts };

  if (total > 0) {
    for (const action of ALL_ACTIONS) {
      actionFrequencies[action] = counts[action]! / total;
    }
  }

  const degenerate: ActionType[] = [];
  const underused: ActionType[] = [];

  // Only audit if there are entries to analyze — with no data, all frequencies are 0
  // and flagging every action as underused would be meaningless noise.
  if (total > 0) {
    for (const action of ALL_ACTIONS) {
      const freq = actionFrequencies[action]!;
      if (freq > 0.40) {
        degenerate.push(action);
      } else if (freq < 0.05) {
        underused.push(action);
      }
    }
  }

  return { actionFrequencies, degenerate, underused };
}
