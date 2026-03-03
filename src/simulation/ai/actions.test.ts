import { describe, it, expect } from 'vitest';
import { ACTIONS } from './actions.ts';
import { ActionType } from '../types.ts';
import type { AgentContext } from '../types.ts';
import { Vec2 } from '../math/vec2.ts';

// Minimal base context for consideration function tests
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
    distanceToFormationAnchor: 0,
    isInPossessionTeam: true,
    nearestDefenderDistance: 15,
    nearestTeammateDistance: 10,
    ...overrides,
  };
}

describe('ACTIONS', () => {
  it('should define exactly 8 actions', () => {
    expect(ACTIONS.length).toBe(8);
  });

  it('should have an entry for every ActionType', () => {
    const ids = ACTIONS.map(a => a.id);
    for (const actionType of Object.values(ActionType)) {
      expect(ids).toContain(actionType);
    }
  });

  it('should have 3-5 consideration functions per action', () => {
    for (const action of ACTIONS) {
      expect(action.considerations.length).toBeGreaterThanOrEqual(3);
      expect(action.considerations.length).toBeLessThanOrEqual(5);
    }
  });

  it('each consideration function should return value in [0..1]', () => {
    const ctx = makeCtx();
    for (const action of ACTIONS) {
      for (const consideration of action.considerations) {
        const score = consideration(ctx);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('SHOOT action', () => {
  const shootAction = () => ACTIONS.find(a => a.id === ActionType.SHOOT)!;

  it('returns 0 when player does not have the ball', () => {
    const ctx = makeCtx({
      ball: {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: 'other-player',
      },
    });
    const action = shootAction();
    const product = action.considerations.reduce((acc, c) => acc * c(ctx), 1);
    expect(product).toBe(0);
  });

  it('scores higher when close to goal vs far away', () => {
    const closeCtx = makeCtx({ distanceToOpponentGoal: 10 });
    const farCtx = makeCtx({ distanceToOpponentGoal: 50 });
    const action = shootAction();
    const closeScore = action.considerations.reduce((acc, c) => acc * c(closeCtx), 1);
    const farScore = action.considerations.reduce((acc, c) => acc * c(farCtx), 1);
    expect(closeScore).toBeGreaterThan(farScore);
  });
});

describe('PRESS action', () => {
  const pressAction = () => ACTIONS.find(a => a.id === ActionType.PRESS)!;

  it('returns 0 when own team has the ball (isInPossessionTeam=true)', () => {
    const ctx = makeCtx({ isInPossessionTeam: true });
    const action = pressAction();
    const product = action.considerations.reduce((acc, c) => acc * c(ctx), 1);
    expect(product).toBe(0);
  });

  it('scores higher when closer to ball carrier', () => {
    const closeCtx = makeCtx({ isInPossessionTeam: false, distanceToBall: 5 });
    const farCtx = makeCtx({ isInPossessionTeam: false, distanceToBall: 40 });
    const action = pressAction();
    const closeScore = action.considerations.reduce((acc, c) => acc * c(closeCtx), 1);
    const farScore = action.considerations.reduce((acc, c) => acc * c(farCtx), 1);
    expect(closeScore).toBeGreaterThan(farScore);
  });
});

describe('MOVE_TO_POSITION action', () => {
  const moveAction = () => ACTIONS.find(a => a.id === ActionType.MOVE_TO_POSITION)!;

  it('scores higher when far from formation anchor', () => {
    const nearCtx = makeCtx({ distanceToFormationAnchor: 1 });
    const farCtx = makeCtx({ distanceToFormationAnchor: 30 });
    const action = moveAction();
    const nearScore = action.considerations.reduce((acc, c) => acc * c(nearCtx), 1);
    const farScore = action.considerations.reduce((acc, c) => acc * c(farCtx), 1);
    expect(farScore).toBeGreaterThan(nearScore);
  });
});

describe('PASS_FORWARD action', () => {
  const passForwardAction = () => ACTIONS.find(a => a.id === ActionType.PASS_FORWARD)!;

  it('returns 0 when player does not have the ball', () => {
    const ctx = makeCtx({
      ball: {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: 'other-player',
      },
    });
    const action = passForwardAction();
    const product = action.considerations.reduce((acc, c) => acc * c(ctx), 1);
    expect(product).toBe(0);
  });
});

describe('PASS_SAFE action', () => {
  const passSafeAction = () => ACTIONS.find(a => a.id === ActionType.PASS_SAFE)!;

  it('returns 0 when player does not have the ball', () => {
    const ctx = makeCtx({
      ball: {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: 'other-player',
      },
    });
    const action = passSafeAction();
    const product = action.considerations.reduce((acc, c) => acc * c(ctx), 1);
    expect(product).toBe(0);
  });

  it('scores higher when under pressure (closer defenders)', () => {
    const pressuredCtx = makeCtx({
      isInPossessionTeam: true,
      nearestDefenderDistance: 2,
    });
    const safeCtx = makeCtx({
      isInPossessionTeam: true,
      nearestDefenderDistance: 20,
    });
    const action = passSafeAction();
    const pressuredScore = action.considerations.reduce((acc, c) => acc * c(pressuredCtx), 1);
    const safeScore = action.considerations.reduce((acc, c) => acc * c(safeCtx), 1);
    expect(pressuredScore).toBeGreaterThan(safeScore);
  });
});

describe('DRIBBLE action', () => {
  const dribbleAction = () => ACTIONS.find(a => a.id === ActionType.DRIBBLE)!;

  it('returns 0 when player does not have the ball', () => {
    const ctx = makeCtx({
      ball: {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: 'other-player',
      },
    });
    const action = dribbleAction();
    const product = action.considerations.reduce((acc, c) => acc * c(ctx), 1);
    expect(product).toBe(0);
  });

  it('scores higher when no nearby defenders (more space)', () => {
    const spaceCtx = makeCtx({ nearestDefenderDistance: 25 });
    const closedCtx = makeCtx({ nearestDefenderDistance: 2 });
    const action = dribbleAction();
    const spaceScore = action.considerations.reduce((acc, c) => acc * c(spaceCtx), 1);
    const closedScore = action.considerations.reduce((acc, c) => acc * c(closedCtx), 1);
    expect(spaceScore).toBeGreaterThan(closedScore);
  });
});

describe('HOLD_SHIELD action', () => {
  const holdAction = () => ACTIONS.find(a => a.id === ActionType.HOLD_SHIELD)!;

  it('returns 0 when player does not have the ball', () => {
    const ctx = makeCtx({
      ball: {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: 'other-player',
      },
    });
    const action = holdAction();
    const product = action.considerations.reduce((acc, c) => acc * c(ctx), 1);
    expect(product).toBe(0);
  });

  it('scores higher when under more pressure (closer defenders)', () => {
    const pressuredCtx = makeCtx({ nearestDefenderDistance: 2 });
    const openCtx = makeCtx({ nearestDefenderDistance: 20 });
    const action = holdAction();
    const pressuredScore = action.considerations.reduce((acc, c) => acc * c(pressuredCtx), 1);
    const openScore = action.considerations.reduce((acc, c) => acc * c(openCtx), 1);
    expect(pressuredScore).toBeGreaterThan(openScore);
  });
});

describe('MAKE_RUN action', () => {
  const makeRunAction = () => ACTIONS.find(a => a.id === ActionType.MAKE_RUN)!;

  it('returns 0 when player has ball (make run is off-ball)', () => {
    const ctx = makeCtx({
      isInPossessionTeam: true,
      ball: {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: 'p1', // self has ball
      },
    });
    const action = makeRunAction();
    const product = action.considerations.reduce((acc, c) => acc * c(ctx), 1);
    expect(product).toBe(0);
  });

  it('scores higher when in possession team (off-ball run)', () => {
    // In possession team but not carrier - good for making runs
    const runCtx = makeCtx({
      isInPossessionTeam: true,
      ball: {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: 'teammate', // teammate has ball
      },
    });
    const action = makeRunAction();
    const product = action.considerations.reduce((acc, c) => acc * c(runCtx), 1);
    expect(product).toBeGreaterThan(0);
  });
});
