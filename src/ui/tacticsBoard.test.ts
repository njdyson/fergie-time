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

    it('formation is always Vec2[] (snap-grid mode)', () => {
      const config = board.getTacticalConfig();
      expect(Array.isArray(config.formation)).toBe(true);
      expect((config.formation as unknown[]).length).toBe(11);
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

  // ── applyPresetPositions ──────────────────────────────────

  describe('applyPresetPositions', () => {
    it('changes positions and roles to match the new template', () => {
      board.applyPresetPositions('4-3-3');
      const config = board.getTacticalConfig();
      const template = FORMATION_TEMPLATES['4-3-3'];
      expect(config.roles).toEqual(template.roles);
    });

    it('roles update to match new formation', () => {
      board.applyPresetPositions('4-2-3-1');
      const config = board.getTacticalConfig();
      const template = FORMATION_TEMPLATES['4-2-3-1'];
      expect(config.roles).toEqual(template.roles);
    });

    it('preserves duties across formation change', () => {
      board.setPlayerDuty(9, 'ATTACK');
      board.applyPresetPositions('4-3-3');
      const config = board.getTacticalConfig();
      expect(config.duties[9]).toBe('ATTACK');
    });

    it('getFormationString returns the correct string', () => {
      board.applyPresetPositions('3-5-2');
      // 3-5-2 template: 3 defenders, 5 midfielders, 2 forwards
      // After snapping to bands, the formation string should reflect the structure
      const str = board.getFormationString();
      expect(str.split('-').reduce((s, n) => s + Number(n), 0)).toBe(10);
    });

    it('supports all 5 formation presets', () => {
      const formations = ['4-4-2', '4-3-3', '4-5-1', '3-5-2', '4-2-3-1'] as const;
      for (const f of formations) {
        board.applyPresetPositions(f);
        const config = board.getTacticalConfig();
        expect(config.roles).toHaveLength(11);
        expect(config.duties).toHaveLength(11);
        expect(Array.isArray(config.formation)).toBe(true);
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

  // ── getTacticalConfig always returns Vec2[] ────────────────

  describe('getTacticalConfig with custom positions', () => {
    it('always returns Vec2[] formation (snap-grid mode)', () => {
      const config = board.getTacticalConfig();
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
