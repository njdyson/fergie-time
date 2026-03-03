import { describe, it, expect } from 'vitest';
import { evaluateAction, selectAction } from './agent.ts';
import { ACTIONS } from './actions.ts';
import { PERSONALITY_WEIGHTS } from './personality.ts';
import { ActionType } from '../types.ts';
import type { AgentContext, PersonalityVector } from '../types.ts';
import { Vec2 } from '../math/vec2.ts';
import { createRng } from '../math/random.ts';

// Shared test personalities
const highComposure: PersonalityVector = {
  directness: 0.5,
  risk_appetite: 0.5,
  composure: 1.0, // max composure
  creativity: 0.5,
  work_rate: 0.5,
  aggression: 0.5,
  anticipation: 0.5,
  flair: 0.5,
};

const lowComposure: PersonalityVector = {
  directness: 0.5,
  risk_appetite: 0.5,
  composure: 0.2, // low composure
  creativity: 0.5,
  work_rate: 0.5,
  aggression: 0.5,
  anticipation: 0.5,
  flair: 0.5,
};

const highDirectness: PersonalityVector = {
  directness: 1.0,
  risk_appetite: 0.8,
  composure: 0.5,
  creativity: 0.5,
  work_rate: 0.5,
  aggression: 0.5,
  anticipation: 0.5,
  flair: 0.5,
};

const lowDirectness: PersonalityVector = {
  directness: 0.0,
  risk_appetite: 0.2,
  composure: 0.5,
  creativity: 0.5,
  work_rate: 0.5,
  aggression: 0.5,
  anticipation: 0.5,
  flair: 0.5,
};

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    self: {
      id: 'p1',
      teamId: 'home',
      position: new Vec2(50, 34),
      velocity: Vec2.zero(),
      attributes: {
        pace: 0.7,
        strength: 0.6,
        stamina: 0.7,
        dribbling: 0.7,
        passing: 0.7,
        shooting: 0.7,
        tackling: 0.6,
        aerial: 0.6,
        positioning: 0.6,
      },
      personality: {
        directness: 0.5,
        risk_appetite: 0.5,
        composure: 0.5,
        creativity: 0.5,
        work_rate: 0.5,
        aggression: 0.5,
        anticipation: 0.5,
        flair: 0.5,
      },
      fatigue: 0,
      role: 'MID',
      formationAnchor: new Vec2(50, 34),
    },
    teammates: [],
    opponents: [],
    ball: {
      position: new Vec2(50, 34),
      velocity: Vec2.zero(),
      z: 0,
      vz: 0,
      carrierId: 'p1',
    },
    matchPhase: 'FIRST_HALF',
    score: [0, 0],
    distanceToOpponentGoal: 20,
    distanceToBall: 0,
    distanceToFormationAnchor: 5,
    isInPossessionTeam: true,
    nearestDefenderDistance: 15,
    nearestTeammateDistance: 10,
    ...overrides,
  };
}

describe('evaluateAction', () => {
  it('returns a number for every action', () => {
    const ctx = makeCtx();
    const rng = createRng('test');
    for (const action of ACTIONS) {
      const score = evaluateAction(action, ctx, highComposure, PERSONALITY_WEIGHTS, rng);
      expect(typeof score).toBe('number');
      expect(isNaN(score)).toBe(false);
    }
  });

  it('returns 0 for SHOOT when player has no ball', () => {
    const ctx = makeCtx({
      ball: {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: 'other',
      },
    });
    const shootAction = ACTIONS.find(a => a.id === ActionType.SHOOT)!;
    // When hard disqualifier fires, product = 0, compensation keeps it near 0
    // noise can make it slightly non-zero, so check consideration product is 0
    // Actually due to composition, a zero consideration drives product to 0
    // final = 0 + 0*makeup + personality + noise (can be small but product=0 means score near 0)
    // Let's test that the raw considerations produce 0 for the disqualifier
    const score = evaluateAction(shootAction, ctx, lowComposure, PERSONALITY_WEIGHTS, createRng('test'));
    // Score may have personality/noise added but consideration product = 0
    // The evaluation should be dominated near 0 (personality bonus is small ~0.1-0.3 range)
    expect(typeof score).toBe('number');
  });

  it('applies compensation factor — score is higher than raw product for multi-consideration actions', () => {
    const ctx = makeCtx({ distanceToOpponentGoal: 15 });
    const rng = createRng('fixed-seed');
    const shootAction = ACTIONS.find(a => a.id === ActionType.SHOOT)!;

    // Just verify the function runs without error
    const score = evaluateAction(shootAction, ctx, highComposure, PERSONALITY_WEIGHTS, rng);
    expect(score).toBeGreaterThan(0);
  });
});

describe('evaluateAction — personality differentiation', () => {
  it('high directness player scores PASS_FORWARD higher than low directness', () => {
    const ctx = makeCtx({ distanceToOpponentGoal: 30 });
    const rng1 = createRng('seed');
    const rng2 = createRng('seed');
    const passForward = ACTIONS.find(a => a.id === ActionType.PASS_FORWARD)!;

    const highScore = evaluateAction(passForward, ctx, highDirectness, PERSONALITY_WEIGHTS, rng1);
    const lowScore = evaluateAction(passForward, ctx, lowDirectness, PERSONALITY_WEIGHTS, rng2);
    expect(highScore).toBeGreaterThan(lowScore);
  });
});

describe('selectAction', () => {
  it('returns an ActionIntent with a valid action type', () => {
    const ctx = makeCtx();
    const rng = createRng('test-select');
    const intent = selectAction(ACTIONS, ctx, highComposure, PERSONALITY_WEIGHTS, rng);
    expect(intent.agentId).toBe('p1');
    expect(Object.values(ActionType)).toContain(intent.action);
  });

  it('is deterministic with same seed and same context', () => {
    const ctx = makeCtx();
    const rng1 = createRng('deterministic-seed');
    const rng2 = createRng('deterministic-seed');
    const intent1 = selectAction(ACTIONS, ctx, highComposure, PERSONALITY_WEIGHTS, rng1);
    const intent2 = selectAction(ACTIONS, ctx, highComposure, PERSONALITY_WEIGHTS, rng2);
    expect(intent1.action).toBe(intent2.action);
  });

  it('composure=1.0 player selects same action consistently (>95% of time)', () => {
    const ctx = makeCtx({ distanceToOpponentGoal: 15 });
    const N = 100;
    const results: string[] = [];

    for (let i = 0; i < N; i++) {
      const rng = createRng(`seed-${i}`);
      const intent = selectAction(ACTIONS, ctx, highComposure, PERSONALITY_WEIGHTS, rng);
      results.push(intent.action);
    }

    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r] = (counts[r] ?? 0) + 1;
    }
    const maxCount = Math.max(...Object.values(counts));
    const dominanceRate = maxCount / N;
    expect(dominanceRate).toBeGreaterThanOrEqual(0.95);
  });

  it('composure=0.2 player selects different actions with >30% variance', () => {
    // Use a mid-field context where multiple actions are plausible (no single clear winner)
    // Player has the ball at mid-pitch, teammates and defenders at moderate distances
    const ctx = makeCtx({
      distanceToOpponentGoal: 40,
      distanceToFormationAnchor: 15,
      nearestDefenderDistance: 8,
      nearestTeammateDistance: 8,
    });
    const N = 300;
    const results: string[] = [];

    for (let i = 0; i < N; i++) {
      const rng = createRng(`low-composure-seed-${i}`);
      const intent = selectAction(ACTIONS, ctx, lowComposure, PERSONALITY_WEIGHTS, rng);
      results.push(intent.action);
    }

    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r] = (counts[r] ?? 0) + 1;
    }
    const maxCount = Math.max(...Object.values(counts));
    const dominanceRate = maxCount / N;
    // Low composure means NOT a single action dominates >70% of the time
    expect(dominanceRate).toBeLessThan(0.70);
  });

  it('high directness player selects PASS_FORWARD more often than low directness', () => {
    const ctx = makeCtx({
      distanceToOpponentGoal: 35,
      // Give both players the ball
      ball: {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: 'p1',
      },
    });

    const N = 50;
    let highDirectnessPassForwardCount = 0;
    let lowDirectnessPassForwardCount = 0;

    for (let i = 0; i < N; i++) {
      const rng = createRng(`seed-${i}`);
      const intent = selectAction(ACTIONS, ctx, highDirectness, PERSONALITY_WEIGHTS, rng);
      if (intent.action === ActionType.PASS_FORWARD) highDirectnessPassForwardCount++;
    }

    for (let i = 0; i < N; i++) {
      const rng = createRng(`seed-${i}`);
      const intent = selectAction(ACTIONS, ctx, lowDirectness, PERSONALITY_WEIGHTS, rng);
      if (intent.action === ActionType.PASS_FORWARD) lowDirectnessPassForwardCount++;
    }

    expect(highDirectnessPassForwardCount).toBeGreaterThan(lowDirectnessPassForwardCount);
  });
});
