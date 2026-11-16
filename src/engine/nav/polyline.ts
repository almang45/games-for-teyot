import type { Point } from '../../../contracts/common.ts';
import { distance } from './graph.ts';

const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/** An immutable polyline addressed by arc length from its first point. */
export class Polyline {
  readonly points: readonly Point[];
  /** `cumulative[i]`: arc length from the first point to `points[i]`. */
  readonly #cumulative: readonly number[];

  constructor(points: readonly Point[]) {
    if (points.length === 0) throw new RangeError('a polyline needs at least one point');
    this.points = points;
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      cumulative.push((cumulative[i - 1] ?? 0) + (a && b ? distance(a, b) : 0));
    }
    this.#cumulative = cumulative;
  }

  get length(): number {
    return this.#cumulative.at(-1) ?? 0;
  }

  /** The point `s` along, clamped to the ends. */
  at(s: number): Point {
    const target = Math.min(Math.max(s, 0), this.length);
    for (let i = 1; i < this.points.length; i++) {
      const end = this.#cumulative[i] ?? 0;
      const a = this.points[i - 1];
      const b = this.points[i];
      if (a && b && target <= end) {
        const start = this.#cumulative[i - 1] ?? 0;
        return end === start ? b : lerp(a, b, (target - start) / (end - start));
      }
    }
    return this.points.at(-1) ?? [0, 0];
  }

  /** The part between arc lengths `from` and `to`, in that direction: reversed when `to < from`. */
  between(from: number, to: number): Point[] {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const inside = this.points.filter((_, i) => {
      const s = this.#cumulative[i] ?? 0;
      return s > lo && s < hi;
    });
    const part = [this.at(lo), ...inside, this.at(hi)];
    return to < from ? part.reverse() : part;
  }
}
