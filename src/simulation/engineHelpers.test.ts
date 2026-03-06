import { describe, expect, it } from 'vitest';
import { Vec2 } from './math/vec2.ts';
import {
  computeGoalkeeperSetPosition,
  computeDribbleDirection,
  computeLooseBallRecoveryTarget,
  computeShotSpeed,
  computeShotTargetY,
  computeShotVerticalVelocity,
  assessCardDecision,
  computePassLeadFactor,
  computePassPickupCooldown,
  computePassSpeed,
  computePerceptionFacing,
  createTestRosters,
  filterPlayersByVision,
  applyDisciplineToPersonality,
  resolveTackleRecoveryPositions,
  resolveEffectivePossessionTeam,
  resolveGoalkeeperSave,
  resolveCardOutcome,
  resolveLockedCarrierAction,
  SimulationEngine,
  shouldDelayPeriodWhistle,
  shouldBookedPlayerAttemptTackle,
  shouldAbortPassAttempt,
} from './engine.ts';
import { ActionType, RestartType } from './types.ts';

describe('pass helper tuning', () => {
  it('scales pass speed by distance and intent', () => {
    expect(computePassSpeed(6, 'PASS_SAFE')).toBeLessThan(computePassSpeed(24, 'PASS_SAFE'));
    expect(computePassSpeed(20, 'PASS_SAFE')).toBeLessThan(computePassSpeed(20, 'PASS_THROUGH'));
  });

  it('keeps safe-pass lead much smaller than through-ball lead', () => {
    const safeLead = computePassLeadFactor(18, 6, 'PASS_SAFE', 0.75, 0.75);
    const throughLead = computePassLeadFactor(18, 6, 'PASS_THROUGH', 0.75, 0.75);
    expect(safeLead).toBeLessThan(throughLead);
    expect(safeLead).toBeLessThan(0.12);
  });

  it('shortens pickup lockout for short passes', () => {
    const shortSpeed = computePassSpeed(8, 'PASS_SAFE');
    const longSpeed = computePassSpeed(28, 'PASS_FORWARD');
    expect(computePassPickupCooldown(8, shortSpeed)).toBeLessThan(computePassPickupCooldown(28, longSpeed));
  });

  it('aborts very unsafe short passes under heavy pressure', () => {
    expect(shouldAbortPassAttempt('PASS_SAFE', 0.4, 7, 1.8)).toBe(true);
    expect(shouldAbortPassAttempt('PASS_FORWARD', 0.65, 14, 4)).toBe(false);
  });
});

describe('shot helper tuning', () => {
  it('keeps composed finishers tighter to the goal frame', () => {
    const { home, away } = createTestRosters();
    const goalkeeper = away[0]!;
    const eliteFinisher = {
      ...home[9]!,
      position: new Vec2(90, 34),
      attributes: { ...home[9]!.attributes, shooting: 0.92 },
      personality: { ...home[9]!.personality, composure: 0.9, flair: 0.75 },
    };
    const rushedFinisher = {
      ...eliteFinisher,
      attributes: { ...eliteFinisher.attributes, shooting: 0.42 },
      personality: { ...eliteFinisher.personality, composure: 0.32, flair: 0.25 },
    };

    const eliteTargetY = computeShotTargetY(eliteFinisher, goalkeeper, 15, 8, 0.82);
    const rushedTargetY = computeShotTargetY(rushedFinisher, goalkeeper, 15, 1.8, 0.82);
    const eliteMiss = Math.max(0, Math.abs(eliteTargetY - 34) - 3.66);
    const rushedMiss = Math.max(0, Math.abs(rushedTargetY - 34) - 3.66);

    expect(eliteMiss).toBeLessThanOrEqual(rushedMiss);
  });

  it('adds more loft when the goalkeeper is advanced', () => {
    const shallowSpeed = computeShotSpeed(18, 0.78, 0.72, 6, 1.5);
    const chippedSpeed = computeShotSpeed(18, 0.78, 0.72, 6, 8.5);
    const shallowVz = computeShotVerticalVelocity(18, shallowSpeed, 0.78, 0.72, 6, 1.5, 0.6);
    const chippedVz = computeShotVerticalVelocity(18, chippedSpeed, 0.78, 0.72, 6, 8.5, 0.6);

    expect(chippedVz).toBeGreaterThan(shallowVz);
    expect(chippedSpeed).toBeLessThan(shallowSpeed);
  });
});

describe('perception model', () => {
  it('faces the ball when stationary so opponents behind goal-facing can still be perceived', () => {
    const { home, away } = createTestRosters();
    const observer = {
      ...home[6]!,
      position: new Vec2(52, 34),
      velocity: Vec2.zero(),
    };
    const ball = {
      position: new Vec2(44, 34),
      velocity: Vec2.zero(),
      z: 0,
      vz: 0,
      carrierId: null,
    };
    const rearOpponent = {
      ...away[6]!,
      position: new Vec2(40, 34),
    };

    const facing = computePerceptionFacing(observer, ball);
    expect(facing.x).toBeLessThan(0);
    expect(filterPlayersByVision(observer, [rearOpponent], 0.7, ball, 'opponent')).toHaveLength(1);
  });

  it('gives teammates a wider awareness cone than opponents at the same angle', () => {
    const { home, away } = createTestRosters();
    const observer = {
      ...home[7]!,
      position: new Vec2(50, 34),
      velocity: Vec2.zero(),
    };
    const ball = {
      position: new Vec2(60, 34),
      velocity: Vec2.zero(),
      z: 0,
      vz: 0,
      carrierId: null,
    };
    const angledTeammate = {
      ...home[8]!,
      position: new Vec2(46, 49),
    };
    const angledOpponent = {
      ...away[8]!,
      position: new Vec2(46, 49),
    };

    expect(filterPlayersByVision(observer, [angledTeammate], 0.7, ball, 'teammate')).toHaveLength(1);
    expect(filterPlayersByVision(observer, [angledOpponent], 0.7, ball, 'opponent')).toHaveLength(0);
  });
});

describe('tackle recovery positioning', () => {
  it('keeps both players inside the pitch after contact near a touchline', () => {
    const { home, away } = createTestRosters();
    const carrier = {
      ...home[9]!,
      position: new Vec2(98, 0.4),
    };
    const tackler = {
      ...away[2]!,
      position: new Vec2(97.2, 0.8),
    };

    const recovery = resolveTackleRecoveryPositions(carrier, tackler);
    expect(recovery.carrierPosition.x).toBeGreaterThanOrEqual(0.5);
    expect(recovery.carrierPosition.y).toBeGreaterThanOrEqual(0.5);
    expect(recovery.tacklerPosition.x).toBeGreaterThanOrEqual(0.5);
    expect(recovery.tacklerPosition.y).toBeGreaterThanOrEqual(0.5);
  });

  it('separates the players instead of leaving them stacked', () => {
    const { home, away } = createTestRosters();
    const carrier = {
      ...home[9]!,
      position: new Vec2(60, 34),
    };
    const tackler = {
      ...away[2]!,
      position: new Vec2(59.5, 34),
    };

    const before = carrier.position.distanceTo(tackler.position);
    const recovery = resolveTackleRecoveryPositions(carrier, tackler);
    const after = recovery.carrierPosition.distanceTo(recovery.tacklerPosition);
    expect(after).toBeGreaterThan(before);
  });
});

describe('goalkeeper set positioning', () => {
  it('steps further off the line for close central danger', () => {
    const anchor = new Vec2(5, 34);
    const deepSet = computeGoalkeeperSetPosition('home', new Vec2(18, 34), anchor, false);
    const conservativeSet = computeGoalkeeperSetPosition('home', new Vec2(70, 10), anchor, false);

    expect(deepSet.x).toBeGreaterThan(conservativeSet.x);
    expect(Math.abs(deepSet.y - 34)).toBeLessThan(Math.abs(conservativeSet.y - 34));
  });

  it('blends back toward the anchor when own team has secure possession far away', () => {
    const anchor = new Vec2(5, 34);
    const noBall = computeGoalkeeperSetPosition('home', new Vec2(80, 34), anchor, false);
    const withBall = computeGoalkeeperSetPosition('home', new Vec2(80, 34), anchor, true);

    expect(Math.abs(withBall.x - anchor.x)).toBeLessThan(Math.abs(noBall.x - anchor.x));
    expect(withBall.y).toBeCloseTo(anchor.y, 1);
  });
});

describe('goalkeeper save resolution', () => {
  it('lets a well-positioned keeper catch a moderate central shot', () => {
    const { away } = createTestRosters();
    const goalkeeper = {
      ...away[0]!,
      position: new Vec2(100.5, 34),
      attributes: { ...away[0]!.attributes, positioning: 0.88, aerial: 0.8 },
    };
    const prevBall = {
      position: new Vec2(99.8, 34),
      velocity: new Vec2(14, 0),
      z: 0.4,
      vz: 0.2,
      carrierId: null,
    };
    const nextBall = {
      position: new Vec2(100.6, 34),
      velocity: new Vec2(13.5, 0),
      z: 0.45,
      vz: -0.1,
      carrierId: null,
    };

    const result = resolveGoalkeeperSave(prevBall, nextBall, goalkeeper, 105, 0.12);
    expect(result).not.toBeNull();
    expect(result?.caught).toBe(true);
    expect(result?.ball.carrierId).toBe(goalkeeper.id);
  });

  it('can parry a faster shot instead of always catching', () => {
    const { away } = createTestRosters();
    const goalkeeper = {
      ...away[0]!,
      position: new Vec2(100.2, 33.6),
      attributes: { ...away[0]!.attributes, positioning: 0.82, aerial: 0.78 },
    };
    const prevBall = {
      position: new Vec2(99.4, 33.4),
      velocity: new Vec2(21, 0.6),
      z: 1.3,
      vz: 0.2,
      carrierId: null,
    };
    const nextBall = {
      position: new Vec2(100.3, 33.45),
      velocity: new Vec2(20.2, 0.55),
      z: 1.45,
      vz: -0.15,
      carrierId: null,
    };

    const result = resolveGoalkeeperSave(prevBall, nextBall, goalkeeper, 105, 0.34);
    expect(result).not.toBeNull();
    expect(result?.caught).toBe(false);
    expect(result?.ball.carrierId).toBeNull();
    expect(result!.ball.velocity.x).toBeLessThan(0);
  });

  it('ignores shots that are clearly wide of the frame', () => {
    const { away } = createTestRosters();
    const goalkeeper = {
      ...away[0]!,
      position: new Vec2(100.5, 34),
    };
    const prevBall = {
      position: new Vec2(99.2, 44),
      velocity: new Vec2(18, 0.4),
      z: 0.8,
      vz: 0,
      carrierId: null,
    };
    const nextBall = {
      position: new Vec2(100.1, 44.1),
      velocity: new Vec2(17.2, 0.35),
      z: 0.75,
      vz: -0.1,
      carrierId: null,
    };

    expect(resolveGoalkeeperSave(prevBall, nextBall, goalkeeper, 105, 0.1)).toBeNull();
  });
});

describe('period whistle delay', () => {
  it('delays halftime/fulltime for a carrier in the final third', () => {
    const { home, away } = createTestRosters();
    const carrier = { ...home[9]!, position: new Vec2(85, 34) };
    const snapshot = new SimulationEngine({ seed: 'delay-whistle', homeRoster: [carrier, ...home.slice(1)], awayRoster: away }).getCurrentSnapshot();
    const liveSnapshot = {
      ...snapshot,
      ball: { ...snapshot.ball, position: carrier.position, carrierId: carrier.id },
      players: [carrier, ...snapshot.players.slice(1)],
    };

    expect(shouldDelayPeriodWhistle(liveSnapshot, null, 0, 2700)).toBe(true);
  });

  it('delays while a restart is still active or just released', () => {
    const { home, away } = createTestRosters();
    const snapshot = new SimulationEngine({ seed: 'delay-restart', homeRoster: home, awayRoster: away }).getCurrentSnapshot();
    const deadBallSnapshot = {
      ...snapshot,
      deadBallInfo: { type: RestartType.CORNER, teamId: 'home' as const, position: new Vec2(105, 0) },
    };

    expect(shouldDelayPeriodWhistle(deadBallSnapshot, null, 0, 2700)).toBe(true);
    expect(shouldDelayPeriodWhistle(snapshot, RestartType.FREE_KICK, 2705, 2700)).toBe(true);
    expect(shouldDelayPeriodWhistle(snapshot, RestartType.FREE_KICK, 2699, 2700)).toBe(false);
  });
});

describe('discipline helpers', () => {
  it('makes booked players more cautious', () => {
    const cautious = applyDisciplineToPersonality({
      directness: 0.7,
      risk_appetite: 0.72,
      composure: 0.6,
      creativity: 0.5,
      work_rate: 0.82,
      aggression: 0.78,
      anticipation: 0.64,
      flair: 0.45,
    }, 1);

    expect(cautious.aggression).toBeLessThan(0.78);
    expect(cautious.risk_appetite).toBeLessThan(0.72);
    expect(cautious.work_rate).toBeLessThan(0.82);
  });

  it('upgrades a second yellow to a dismissal', () => {
    const outcome = resolveCardOutcome(1, 'YELLOW');
    expect(outcome.event).toBe('red');
    expect(outcome.secondYellow).toBe(true);
    expect(outcome.sentOff).toBe(true);
    expect(outcome.yellowCards).toBe(2);
  });

  it('treats last-man fouls on a central runner as a red card', () => {
    const { home, away } = createTestRosters();
    const victim = {
      ...home[9]!,
      position: new Vec2(87, 34),
      velocity: new Vec2(4.8, 0),
    };
    const fouler = {
      ...away[2]!,
      position: new Vec2(84.5, 34.8),
      velocity: new Vec2(2, 0),
    };
    const covering = away.filter(player => player.id !== fouler.id).map((player, idx) => (
      idx < 9
        ? { ...player, sentOff: true }
        : player
    ));

    expect(assessCardDecision(fouler, victim, [victim, fouler, ...covering])).toBe('RED');
  });

  it('makes a booked defender hold shape unless danger is severe', () => {
    const { home, away } = createTestRosters();
    const bookedDefender = {
      ...away[2]!,
      yellowCards: 1,
      position: new Vec2(58, 36),
    };
    const carrier = {
      ...home[7]!,
      position: new Vec2(62, 30),
      velocity: new Vec2(1.2, 0),
    };

    expect(shouldBookedPlayerAttemptTackle(bookedDefender, carrier, [carrier, bookedDefender, ...home.slice(0, 3), ...away.slice(0, 3)])).toBe(false);
  });
});

describe('carrier movement smoothing', () => {
  it('keeps a locked carrier moving instead of stalling on a shoot choice', () => {
    expect(resolveLockedCarrierAction(ActionType.SHOOT, 18, 3.8)).toBe(ActionType.DRIBBLE);
    expect(resolveLockedCarrierAction(ActionType.PASS_FORWARD, 34, 1.4)).toBe(ActionType.HOLD_SHIELD);
    expect(resolveLockedCarrierAction(ActionType.DRIBBLE, 18, 3.8)).toBe(ActionType.DRIBBLE);
  });

  it('preserves most forward momentum when a nearby defender is slightly off to one side', () => {
    const { home, away } = createTestRosters();
    const dribbler = {
      ...home[9]!,
      position: new Vec2(88, 34),
      velocity: new Vec2(4.8, 0.35),
    };
    const defender = {
      ...away[2]!,
      position: new Vec2(90.2, 35.1),
    };

    const dir = computeDribbleDirection(dribbler, [defender]);
    expect(dir.x).toBeGreaterThan(0.75);
    expect(Math.abs(dir.y)).toBeLessThan(0.65);
  });
});

describe('phase possession resolution', () => {
  it('keeps the passer team in possession while a pass is in flight', () => {
    const { home } = createTestRosters();
    expect(resolveEffectivePossessionTeam(home[9]!, null)).toBe('home');
    expect(resolveEffectivePossessionTeam(null, 'away')).toBe('away');
    expect(resolveEffectivePossessionTeam(null, null)).toBeNull();
  });
});

describe('loose ball recovery', () => {
  it('turns the closest support player into a ball attacker when the ball is loose', () => {
    const { home } = createTestRosters();
    const player = {
      ...home[7]!,
      role: 'CM',
      position: new Vec2(48, 34),
    };
    const teammate = {
      ...home[8]!,
      role: 'RW',
      position: new Vec2(60, 40),
    };
    const target = computeLooseBallRecoveryTarget(
      player,
      [teammate],
      {
        position: new Vec2(50, 34),
        velocity: new Vec2(0.8, 0),
        z: 0,
        vz: 0,
        carrierId: null,
      },
      6.8,
    );

    expect(target).not.toBeNull();
    expect(target?.x).toBeCloseTo(50, 1);
    expect(target?.y).toBeCloseTo(34, 1);
  });

  it('does not send a non-closest player after the same loose ball', () => {
    const { home } = createTestRosters();
    const farther = {
      ...home[7]!,
      role: 'CM',
      position: new Vec2(58, 34),
    };
    const closer = {
      ...home[8]!,
      role: 'RW',
      position: new Vec2(50.5, 34.2),
    };
    const target = computeLooseBallRecoveryTarget(
      farther,
      [closer],
      {
        position: new Vec2(50, 34),
        velocity: Vec2.zero(),
        z: 0,
        vz: 0,
        carrierId: null,
      },
      6.8,
    );

    expect(target).toBeNull();
  });
});

describe('engine roster normalization', () => {
  it('accepts plain x/y vector-like player fields without crashing', () => {
    const { home, away } = createTestRosters();
    const plainHome = home.map((p) => ({
      ...p,
      position: { x: p.position.x, y: p.position.y } as any,
      velocity: { x: p.velocity.x, y: p.velocity.y } as any,
      formationAnchor: { x: p.formationAnchor.x, y: p.formationAnchor.y } as any,
    }));

    expect(() => {
      const engine = new SimulationEngine({ seed: 'normalize-vectors', homeRoster: plainHome, awayRoster: away });
      engine.tick(33.33);
    }).not.toThrow();
  });
});
