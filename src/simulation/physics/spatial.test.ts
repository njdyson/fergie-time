import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialGrid } from './spatial';
import { Vec2 } from '../math/vec2';

describe('SpatialGrid', () => {
  let grid: SpatialGrid;

  beforeEach(() => {
    // Standard pitch: 105m x 68m, cell size 10m
    grid = new SpatialGrid(105, 68, 10);
  });

  describe('construction', () => {
    it('creates a grid with the specified dimensions', () => {
      expect(grid).toBeDefined();
    });

    it('creates a grid with custom cell size', () => {
      const customGrid = new SpatialGrid(100, 80, 5);
      expect(customGrid).toBeDefined();
    });
  });

  describe('insert and query', () => {
    it('returns empty array when no players inserted', () => {
      const result = grid.query(new Vec2(50, 34), 10);
      expect(result).toEqual([]);
    });

    it('finds a player at the exact query position', () => {
      grid.insert('player1', new Vec2(50, 34));
      const result = grid.query(new Vec2(50, 34), 5);
      expect(result).toContain('player1');
    });

    it('finds a player within the query radius', () => {
      grid.insert('player1', new Vec2(52, 34));
      const result = grid.query(new Vec2(50, 34), 5);
      expect(result).toContain('player1');
    });

    it('does not return a player outside the query radius', () => {
      grid.insert('player1', new Vec2(60, 34));
      const result = grid.query(new Vec2(50, 34), 5);
      expect(result).not.toContain('player1');
    });

    it('finds multiple players within radius', () => {
      grid.insert('player1', new Vec2(51, 34));
      grid.insert('player2', new Vec2(49, 34));
      grid.insert('player3', new Vec2(50, 36));
      grid.insert('player4', new Vec2(70, 34)); // too far
      const result = grid.query(new Vec2(50, 34), 5);
      expect(result).toContain('player1');
      expect(result).toContain('player2');
      expect(result).toContain('player3');
      expect(result).not.toContain('player4');
    });

    it('finds players that are exactly at the radius boundary (within rounding)', () => {
      // Player exactly 5m away
      grid.insert('player1', new Vec2(55, 34));
      const result = grid.query(new Vec2(50, 34), 5);
      expect(result).toContain('player1');
    });

    it('finds players in adjacent cells', () => {
      // Player in an adjacent cell (crosses cell boundary at 60m)
      grid.insert('player1', new Vec2(59, 34)); // cell 5_3
      const result = grid.query(new Vec2(61, 34), 5); // cell 6_3
      expect(result).toContain('player1');
    });

    it('handles players near the pitch corners', () => {
      grid.insert('cornerPlayer', new Vec2(1, 1));
      const result = grid.query(new Vec2(0, 0), 5);
      expect(result).toContain('cornerPlayer');
    });

    it('handles multiple players in the same cell', () => {
      grid.insert('p1', new Vec2(15, 15));
      grid.insert('p2', new Vec2(16, 15));
      grid.insert('p3', new Vec2(17, 15));
      const result = grid.query(new Vec2(15, 15), 10);
      expect(result).toContain('p1');
      expect(result).toContain('p2');
      expect(result).toContain('p3');
    });
  });

  describe('clear', () => {
    it('removes all players after clear()', () => {
      grid.insert('player1', new Vec2(50, 34));
      grid.insert('player2', new Vec2(51, 34));
      grid.clear();
      const result = grid.query(new Vec2(50, 34), 10);
      expect(result).toEqual([]);
    });

    it('allows re-insertion after clear()', () => {
      grid.insert('player1', new Vec2(50, 34));
      grid.clear();
      grid.insert('player1', new Vec2(20, 20));
      const result = grid.query(new Vec2(20, 20), 5);
      expect(result).toContain('player1');
      // Player1 should not be found at old position
      const oldResult = grid.query(new Vec2(50, 34), 5);
      expect(oldResult).not.toContain('player1');
    });
  });

  describe('performance characteristics', () => {
    it('supports 22 players with query returning only nearby players', () => {
      // Insert 22 players spread across the pitch
      for (let i = 0; i < 22; i++) {
        const x = (i % 11) * 9 + 5;
        const y = Math.floor(i / 11) * 34 + 17;
        grid.insert(`player${i}`, new Vec2(x, y));
      }
      // Query near player0 (at 5, 17) with small radius
      const result = grid.query(new Vec2(5, 17), 5);
      // Should find player0 and very few others, not all 22
      expect(result.length).toBeLessThan(10);
      expect(result).toContain('player0');
    });
  });

  describe('large radius queries', () => {
    it('query with radius 15m covers multiple cells', () => {
      grid.insert('close', new Vec2(50, 34));
      grid.insert('medium', new Vec2(60, 34)); // 10m away
      grid.insert('far', new Vec2(65, 34));    // 15m away (on boundary)
      grid.insert('tooFar', new Vec2(70, 34)); // 20m away
      const result = grid.query(new Vec2(50, 34), 15);
      expect(result).toContain('close');
      expect(result).toContain('medium');
      expect(result).toContain('far');
      expect(result).not.toContain('tooFar');
    });
  });
});
