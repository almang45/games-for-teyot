/**
 * Placeholder floor plan until `house:blockout` produces design/layouts/house.json from the real
 * floor plan (PRD US-REF-02). Room ids are provisional; the layout contract will own them.
 */
export interface PlaceholderRoom {
  readonly id: string;
  /** Floor footprint in tiles: [x, y] of the back corner, then width and depth. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
}

export const placeholderRooms: readonly PlaceholderRoom[] = [
  { id: 'kamar-theia', x: 0, y: 0, w: 4, d: 4 },
  { id: 'ruang-belajar', x: 4, y: 0, w: 4, d: 4 },
  { id: 'dapur', x: 0, y: 4, w: 4, d: 4 },
  { id: 'ruang-tamu', x: 4, y: 4, w: 4, d: 4 },
];

export const PLACEHOLDER_WALL_HEIGHT = 1.2;
