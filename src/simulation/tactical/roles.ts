import type { Role, Duty, ActionType } from '../types.ts';

// ============================================================
// Role/Duty weight modifiers for utility AI
// ============================================================

/**
 * ROLE_DUTY_WEIGHTS: A nested record mapping (Role, Duty) -> flat score modifiers per ActionType.
 *
 * These are additive bonuses applied on top of the personality-based consideration scores in
 * selectAction. Magnitudes are in the 0.05-0.15 range (similar to personality bonus scale).
 *
 * Calibration targets:
 *   - ST+ATTACK:  SHOOT +0.12, DRIBBLE +0.08, MAKE_RUN +0.10
 *   - CB+DEFEND:  PRESS +0.10, MOVE_TO_POSITION +0.08, MAKE_RUN -0.08
 *   - CDM+DEFEND: PRESS +0.12, MOVE_TO_POSITION +0.10
 *   - CAM+ATTACK: PASS_FORWARD +0.10, DRIBBLE +0.08
 *   - SUPPORT duty: near-zero (baseline)
 */
export const ROLE_DUTY_WEIGHTS: Record<
  Role,
  Record<Duty, Partial<Record<ActionType, number>>>
> = {
  GK: {
    DEFEND: {
      MOVE_TO_POSITION: 0.12,
      PRESS: 0.06,
      HOLD_SHIELD: 0.05,
    },
    SUPPORT: {},
    ATTACK: {
      PASS_SAFE: 0.05,
      PASS_FORWARD: 0.04,
    },
  },

  CB: {
    DEFEND: {
      PRESS: 0.10,
      MOVE_TO_POSITION: 0.08,
      HOLD_SHIELD: 0.06,
      MAKE_RUN: -0.08,
      SHOOT: -0.06,
      DRIBBLE: -0.04,
    },
    SUPPORT: {},
    ATTACK: {
      PASS_FORWARD: 0.05,
      PRESS: 0.04,
      MAKE_RUN: 0.03,
      MOVE_TO_POSITION: -0.04,
    },
  },

  LB: {
    DEFEND: {
      PRESS: 0.09,
      MOVE_TO_POSITION: 0.08,
      MAKE_RUN: -0.06,
    },
    SUPPORT: {},
    ATTACK: {
      PASS_FORWARD: 0.07,
      MAKE_RUN: 0.08,
      DRIBBLE: 0.04,
    },
  },

  RB: {
    DEFEND: {
      PRESS: 0.09,
      MOVE_TO_POSITION: 0.08,
      MAKE_RUN: -0.06,
    },
    SUPPORT: {},
    ATTACK: {
      PASS_FORWARD: 0.07,
      MAKE_RUN: 0.08,
      DRIBBLE: 0.04,
    },
  },

  CDM: {
    DEFEND: {
      PRESS: 0.12,
      MOVE_TO_POSITION: 0.10,
      HOLD_SHIELD: 0.07,
      MAKE_RUN: -0.06,
      SHOOT: -0.05,
    },
    SUPPORT: {
      PASS_SAFE: 0.03,
      MOVE_TO_POSITION: 0.02,
    },
    ATTACK: {
      PASS_FORWARD: 0.08,
      DRIBBLE: 0.04,
      PRESS: 0.03,
    },
  },

  CM: {
    DEFEND: {
      PRESS: 0.07,
      MOVE_TO_POSITION: 0.06,
      MAKE_RUN: -0.03,
    },
    SUPPORT: {},
    ATTACK: {
      PASS_FORWARD: 0.06,
      DRIBBLE: 0.04,
      MAKE_RUN: 0.05,
    },
  },

  CAM: {
    DEFEND: {
      PRESS: 0.06,
      MOVE_TO_POSITION: 0.05,
      SHOOT: -0.04,
    },
    SUPPORT: {
      PASS_FORWARD: 0.03,
      DRIBBLE: 0.02,
    },
    ATTACK: {
      PASS_FORWARD: 0.10,
      DRIBBLE: 0.08,
      SHOOT: 0.07,
      MAKE_RUN: 0.06,
    },
  },

  LW: {
    DEFEND: {
      PRESS: 0.07,
      MOVE_TO_POSITION: 0.06,
      MAKE_RUN: -0.04,
    },
    SUPPORT: {},
    ATTACK: {
      DRIBBLE: 0.09,
      PASS_FORWARD: 0.07,
      MAKE_RUN: 0.08,
      SHOOT: 0.06,
    },
  },

  RW: {
    DEFEND: {
      PRESS: 0.07,
      MOVE_TO_POSITION: 0.06,
      MAKE_RUN: -0.04,
    },
    SUPPORT: {},
    ATTACK: {
      DRIBBLE: 0.09,
      PASS_FORWARD: 0.07,
      MAKE_RUN: 0.08,
      SHOOT: 0.06,
    },
  },

  ST: {
    DEFEND: {
      PRESS: 0.06,
      MOVE_TO_POSITION: 0.05,
      MAKE_RUN: -0.04,
      SHOOT: -0.03,
    },
    SUPPORT: {},
    ATTACK: {
      SHOOT: 0.12,
      DRIBBLE: 0.08,
      MAKE_RUN: 0.10,
      PASS_FORWARD: 0.04,
    },
  },
};

// ============================================================
// getDutyWeightModifier
// ============================================================

/**
 * Returns the duty weight modifier for a given role, duty, and action type.
 *
 * This is an additive bonus applied to the action score in selectAction,
 * on top of consideration product and personality bonus.
 *
 * Returns 0 for unknown roles (graceful degradation).
 *
 * @param role - Player's positional role
 * @param duty - Player's tactical duty (DEFEND/SUPPORT/ATTACK)
 * @param actionType - The action being evaluated
 */
export function getDutyWeightModifier(
  role: Role | string,
  duty: Duty,
  actionType: ActionType,
): number {
  const roleWeights = ROLE_DUTY_WEIGHTS[role as Role];
  if (!roleWeights) return 0;

  const dutyWeights = roleWeights[duty];
  if (!dutyWeights) return 0;

  return dutyWeights[actionType] ?? 0;
}
