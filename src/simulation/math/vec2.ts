/**
 * Immutable 2D vector class for simulation physics.
 * All operations return new Vec2 instances — original is never mutated.
 */
export class Vec2 {
  readonly x: number;
  readonly y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** Returns a Vec2 at the origin (0, 0). */
  static zero(): Vec2 {
    return new Vec2(0, 0);
  }

  /** Returns a new Vec2 that is the sum of this and other. */
  add(other: Vec2): Vec2 {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  /** Returns a new Vec2 that is this minus other. */
  subtract(other: Vec2): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  /** Returns a new Vec2 scaled by scalar. */
  scale(scalar: number): Vec2 {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  /** Returns the Euclidean length (magnitude) of this vector. */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Returns a unit vector in the same direction.
   * Returns Vec2.zero() if length < 0.001 to avoid division by zero.
   */
  normalize(): Vec2 {
    const len = this.length();
    if (len < 0.001) {
      return Vec2.zero();
    }
    return new Vec2(this.x / len, this.y / len);
  }

  /** Returns the dot product of this and other. */
  dot(other: Vec2): number {
    return this.x * other.x + this.y * other.y;
  }

  /** Returns the Euclidean distance from this to other. */
  distanceTo(other: Vec2): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
