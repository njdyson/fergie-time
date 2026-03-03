import { describe, it, expect, beforeEach } from 'vitest';
import { TacticsBoard } from './tacticsBoard.ts';
import { FORMATION_TEMPLATES } from '../simulation/tactical/formation.ts';

// ============================================================
// Mock canvas for headless testing
// ============================================================

function makeMockCanvas(): HTMLCanvasElement {
  // Minimal canvas mock that satisfies TacticsBoard's constructor
  const ctx: Partial<CanvasRenderingContext2D> = {
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    closePath: () => {},
    ellipse: () => {},
    setLineDash: () => {},
    fillText: () => {},
    save: () => {},
    restore: () => {},
    canvas: null as unknown as HTMLCanvasElement,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
  };

  const canvas = {
    width: 840,
    height: 544,
    style: { display: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 840, height: 544, right: 840, bottom: 544, x: 0, y: 0, toJSON: () => ({}) }),
    addEventListener: (_: string, __: EventListenerOrEventListenerObject) => {},
    getContext: (type: string) => {
      if (type === '2d') return ctx as CanvasRenderingContext2D;
      return null;
    },
  } as unknown as HTMLCanvasElement;

  (ctx as Record<string, unknown>).canvas = canvas;
  return canvas;
}

// ============================================================
// Tests
// ============================================================

describe('TacticsBoard', () => {
  let canvas: HTMLCanvasElement;
  let board: TacticsBoard;

  beforeEach(() => {
    canvas = makeMockCanvas();
    board = new TacticsBoard(canvas, '4-4-2');
  });

  // ── getTacticalConfig ─────────────────────────────────────

  describe('getTacticalConfig', () => {
    it('returns valid config after construction', () => {
      const config = board.getTacticalConfig();
      expect(config).toBeDefined();
      expect(config.roles).toHaveLength(11);
      expect(config.duties).toHaveLength(11);
    });

    it('formation is "4-4-2" by default', () => {
      const config = board.getTacticalConfig();
      // When positions match template, returns the FormationId string
      expect(config.formation).toBe('4-4-2');
    });

    it('all duties default to SUPPORT', () => {
      const config = board.getTacticalConfig();
      for (const duty of config.duties) {
        expect(duty).toBe('SUPPORT');
      }
    });

    it('roles match the 4-4-2 formation template', () => {
      const config = board.getTacticalConfig();
      const template = FORMATION_TEMPLATES['4-4-2'];
      expect(config.roles).toEqual(template.roles);
    });
  });

  // ── setFormation ──────────────────────────────────────────

  describe('setFormation', () => {
    it('changes positions to match the new template', () => {
      board.setFormation('4-3-3');
      const config = board.getTacticalConfig();
      expect(config.formation).toBe('4-3-3');
    });

    it('roles update to match new formation', () => {
      board.setFormation('4-2-3-1');
      const config = board.getTacticalConfig();
      const template = FORMATION_TEMPLATES['4-2-3-1'];
      expect(config.roles).toEqual(template.roles);
    });

    it('preserves duties across formation change', () => {
      board.setPlayerDuty(9, 'ATTACK');
      board.setFormation('4-3-3');
      const config = board.getTacticalConfig();
      expect(config.duties[9]).toBe('ATTACK');
    });

    it('returns the new formation from getFormation()', () => {
      board.setFormation('3-5-2');
      expect(board.getFormation()).toBe('3-5-2');
    });

    it('supports all 5 formation presets', () => {
      const formations = ['4-4-2', '4-3-3', '4-5-1', '3-5-2', '4-2-3-1'] as const;
      for (const f of formations) {
        board.setFormation(f);
        expect(board.getFormation()).toBe(f);
        const config = board.getTacticalConfig();
        expect(config.roles).toHaveLength(11);
        expect(config.duties).toHaveLength(11);
      }
    });
  });

  // ── setPlayerDuty ─────────────────────────────────────────

  describe('setPlayerDuty', () => {
    it('updates the duty for the specified player', () => {
      board.setPlayerDuty(0, 'DEFEND');
      const config = board.getTacticalConfig();
      expect(config.duties[0]).toBe('DEFEND');
    });

    it('updates ATTACK duty for a striker', () => {
      board.setPlayerDuty(9, 'ATTACK'); // index 9 = first ST in 4-4-2
      const config = board.getTacticalConfig();
      expect(config.duties[9]).toBe('ATTACK');
    });

    it('can set all 3 duty types', () => {
      board.setPlayerDuty(1, 'DEFEND');
      board.setPlayerDuty(5, 'SUPPORT');
      board.setPlayerDuty(9, 'ATTACK');
      const config = board.getTacticalConfig();
      expect(config.duties[1]).toBe('DEFEND');
      expect(config.duties[5]).toBe('SUPPORT');
      expect(config.duties[9]).toBe('ATTACK');
    });

    it('ignores out-of-range player index', () => {
      // Should not throw
      expect(() => board.setPlayerDuty(-1, 'ATTACK')).not.toThrow();
      expect(() => board.setPlayerDuty(11, 'ATTACK')).not.toThrow();
    });
  });

  // ── getTacticalConfig with custom positions ───────────────

  describe('getTacticalConfig with custom drag', () => {
    it('returns Vec2[] when player is dragged from template position', () => {
      // Simulate dragging player 9 (ST) to a very different position
      // by directly calling the internal method via casting
      const boardAny = board as unknown as Record<string, unknown>;
      const positions = boardAny['positions'] as Array<{ x: number; y: number }>;
      // Move player 9 significantly
      positions[9] = { x: 80, y: 34 };
      (boardAny['roles'] as string[])[9] = 'ST';

      const config = board.getTacticalConfig();
      // Formation should be a Vec2[] since position deviated
      expect(Array.isArray(config.formation)).toBe(true);
      expect((config.formation as unknown[]).length).toBe(11);
    });
  });

  // ── show / hide ───────────────────────────────────────────

  describe('show / hide', () => {
    it('show sets display to block', () => {
      board.show();
      expect(canvas.style.display).toBe('block');
    });

    it('hide sets display to none', () => {
      board.hide();
      expect(canvas.style.display).toBe('none');
    });
  });
});
