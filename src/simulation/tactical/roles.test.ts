import { describe, it, expect } from 'vitest';
import { getDutyWeightModifier, ROLE_DUTY_WEIGHTS } from './roles.ts';
import { ActionType } from '../types.ts';

describe('ROLE_DUTY_WEIGHTS', () => {
  it('has entries for all 10 roles', () => {
    const roles = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
    for (const role of roles) {
      expect(ROLE_DUTY_WEIGHTS[role as keyof typeof ROLE_DUTY_WEIGHTS]).toBeDefined();
    }
  });

  it('each role has entries for all 3 duty levels', () => {
    const duties = ['DEFEND', 'SUPPORT', 'ATTACK'];
    for (const [, dutyMap] of Object.entries(ROLE_DUTY_WEIGHTS)) {
      for (const duty of duties) {
        expect(dutyMap[duty as keyof typeof dutyMap]).toBeDefined();
      }
    }
  });
});

describe('getDutyWeightModifier', () => {
  describe('ST + ATTACK', () => {
    it('returns positive modifier for SHOOT', () => {
      const mod = getDutyWeightModifier('ST', 'ATTACK', ActionType.SHOOT);
      expect(mod).toBeGreaterThan(0);
    });

    it('returns positive modifier for MAKE_RUN', () => {
      const mod = getDutyWeightModifier('ST', 'ATTACK', ActionType.MAKE_RUN);
      expect(mod).toBeGreaterThan(0);
    });

    it('SHOOT modifier for ST+ATTACK is around 0.10-0.15', () => {
      const mod = getDutyWeightModifier('ST', 'ATTACK', ActionType.SHOOT);
      expect(mod).toBeGreaterThanOrEqual(0.08);
      expect(mod).toBeLessThanOrEqual(0.20);
    });
  });

  describe('CB + DEFEND', () => {
    it('returns positive modifier for PRESS', () => {
      const mod = getDutyWeightModifier('CB', 'DEFEND', ActionType.PRESS);
      expect(mod).toBeGreaterThan(0);
    });

    it('returns positive modifier for MOVE_TO_POSITION', () => {
      const mod = getDutyWeightModifier('CB', 'DEFEND', ActionType.MOVE_TO_POSITION);
      expect(mod).toBeGreaterThan(0);
    });

    it('returns negative modifier for MAKE_RUN', () => {
      const mod = getDutyWeightModifier('CB', 'DEFEND', ActionType.MAKE_RUN);
      expect(mod).toBeLessThan(0);
    });
  });

  describe('CM + SUPPORT', () => {
    it('returns near-zero modifiers (baseline)', () => {
      const mod = getDutyWeightModifier('CM', 'SUPPORT', ActionType.SHOOT);
      expect(Math.abs(mod)).toBeLessThan(0.05);
    });

    it('SUPPORT duty is close to zero for all actions', () => {
      const actions = Object.values(ActionType);
      for (const action of actions) {
        const mod = getDutyWeightModifier('CM', 'SUPPORT', action);
        expect(Math.abs(mod)).toBeLessThan(0.06);
      }
    });
  });

  describe('ATTACK vs DEFEND comparisons', () => {
    it('ATTACK duty increases SHOOT scores more than DEFEND duty for ST', () => {
      const attackMod = getDutyWeightModifier('ST', 'ATTACK', ActionType.SHOOT);
      const defendMod = getDutyWeightModifier('ST', 'DEFEND', ActionType.SHOOT);
      expect(attackMod).toBeGreaterThan(defendMod);
    });

    it('ATTACK duty increases DRIBBLE scores more than DEFEND duty for ST', () => {
      const attackMod = getDutyWeightModifier('ST', 'ATTACK', ActionType.DRIBBLE);
      const defendMod = getDutyWeightModifier('ST', 'DEFEND', ActionType.DRIBBLE);
      expect(attackMod).toBeGreaterThan(defendMod);
    });

    it('ATTACK duty increases MAKE_RUN scores more than DEFEND duty for ST', () => {
      const attackMod = getDutyWeightModifier('ST', 'ATTACK', ActionType.MAKE_RUN);
      const defendMod = getDutyWeightModifier('ST', 'DEFEND', ActionType.MAKE_RUN);
      expect(attackMod).toBeGreaterThan(defendMod);
    });

    it('DEFEND duty increases PRESS scores more than ATTACK duty for CB', () => {
      const defendMod = getDutyWeightModifier('CB', 'DEFEND', ActionType.PRESS);
      const attackMod = getDutyWeightModifier('CB', 'ATTACK', ActionType.PRESS);
      expect(defendMod).toBeGreaterThan(attackMod);
    });

    it('DEFEND duty increases MOVE_TO_POSITION scores more than ATTACK duty for CB', () => {
      const defendMod = getDutyWeightModifier('CB', 'DEFEND', ActionType.MOVE_TO_POSITION);
      const attackMod = getDutyWeightModifier('CB', 'ATTACK', ActionType.MOVE_TO_POSITION);
      expect(defendMod).toBeGreaterThan(attackMod);
    });
  });

  describe('CDM + DEFEND', () => {
    it('returns positive modifier for PRESS', () => {
      const mod = getDutyWeightModifier('CDM', 'DEFEND', ActionType.PRESS);
      expect(mod).toBeGreaterThan(0.08);
    });

    it('returns positive modifier for MOVE_TO_POSITION', () => {
      const mod = getDutyWeightModifier('CDM', 'DEFEND', ActionType.MOVE_TO_POSITION);
      expect(mod).toBeGreaterThan(0.08);
    });
  });

  describe('CAM + ATTACK', () => {
    it('returns positive modifier for PASS_FORWARD', () => {
      const mod = getDutyWeightModifier('CAM', 'ATTACK', ActionType.PASS_FORWARD);
      expect(mod).toBeGreaterThan(0);
    });

    it('returns positive modifier for DRIBBLE', () => {
      const mod = getDutyWeightModifier('CAM', 'ATTACK', ActionType.DRIBBLE);
      expect(mod).toBeGreaterThan(0);
    });
  });

  describe('unknown / edge cases', () => {
    it('returns 0 for unknown role', () => {
      const mod = getDutyWeightModifier('UNKNOWN_ROLE' as any, 'ATTACK', ActionType.SHOOT);
      expect(mod).toBe(0);
    });
  });
});
