/**
 * 2:1 dimetric projection used by the house (ASSETS.md §2): one floor tile is twice as wide as it
 * is tall on screen. World units are floor tiles; `z` is height in tiles.
 */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface IsoProjection {
  /** Screen width of one tile edge projected onto the x axis, in design pixels. */
  readonly tileWidth: number;
  /** Screen position of world origin (0, 0, 0). */
  readonly origin: ScreenPoint;
}

export function toScreen(p: WorldPoint, proj: IsoProjection): ScreenPoint {
  const halfW = proj.tileWidth / 2;
  const halfH = proj.tileWidth / 4;
  return {
    x: proj.origin.x + (p.x - p.y) * halfW,
    y: proj.origin.y + (p.x + p.y) * halfH - (p.z ?? 0) * (proj.tileWidth / 2),
  };
}

/** Inverse of {@link toScreen} on the plane z = 0, used for taps on the floor. */
export function toWorld(s: ScreenPoint, proj: IsoProjection): WorldPoint {
  const halfW = proj.tileWidth / 2;
  const halfH = proj.tileWidth / 4;
  const dx = (s.x - proj.origin.x) / halfW;
  const dy = (s.y - proj.origin.y) / halfH;
  return { x: (dx + dy) / 2, y: (dy - dx) / 2, z: 0 };
}

/** Painter's-order key: larger values are nearer the viewer and drawn later. */
export function depthKey(p: WorldPoint): number {
  return p.x + p.y + (p.z ?? 0) * 0.001;
}
