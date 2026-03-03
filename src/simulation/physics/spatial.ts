import { Vec2 } from '../math/vec2';

/**
 * SpatialGrid - Divides a 2D space into cells for O(1) neighbor queries.
 *
 * Instead of checking all N players against all N players (O(n^2)), each tick:
 *   1. clear() — empties all cells
 *   2. insert() each player into its cell
 *   3. query() — checks only the cell + adjacent cells (max ~9 cells, not N cells)
 *
 * For a 105m x 68m pitch with 10m cells: ~11 x 7 = 77 cells, ~3 players/cell.
 */

interface GridEntry {
  id: string;
  position: Vec2;
}

export class SpatialGrid {
  private readonly width: number;
  private readonly height: number;
  private readonly cellSize: number;
  private cells: Map<string, Set<GridEntry>>;

  constructor(width: number, height: number, cellSize: number) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  /**
   * Converts a world position to a cell key string.
   * Cell key: "${cellX}_${cellY}"
   */
  private cellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX}_${cellY}`;
  }

  /**
   * Converts a world position to cell coordinates.
   */
  private cellCoords(x: number, y: number): { cx: number; cy: number } {
    return {
      cx: Math.floor(x / this.cellSize),
      cy: Math.floor(y / this.cellSize),
    };
  }

  /**
   * Insert a player (by id) at the given position into the spatial grid.
   */
  insert(id: string, position: Vec2): void {
    const key = this.cellKey(position.x, position.y);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add({ id, position });
  }

  /**
   * Query all player IDs within `radius` meters of `position`.
   *
   * Checks the cell containing `position` plus all adjacent cells (3x3 neighborhood).
   * Filters results by actual Euclidean distance to avoid false positives from
   * players in adjacent cells that are geometrically outside the radius.
   */
  query(position: Vec2, radius: number): string[] {
    const { cx, cy } = this.cellCoords(position.x, position.y);

    // How many cells can the radius span?
    const cellsToCheck = Math.ceil(radius / this.cellSize);

    const results: string[] = [];

    for (let dx = -cellsToCheck; dx <= cellsToCheck; dx++) {
      for (let dy = -cellsToCheck; dy <= cellsToCheck; dy++) {
        const key = `${cx + dx}_${cy + dy}`;
        const cell = this.cells.get(key);
        if (!cell) continue;

        for (const entry of cell) {
          const dist = position.distanceTo(entry.position);
          if (dist <= radius) {
            results.push(entry.id);
          }
        }
      }
    }

    return results;
  }

  /**
   * Clear all entries from the grid.
   * Called at the start of each simulation tick before re-inserting all players.
   */
  clear(): void {
    this.cells.clear();
  }
}
