import type { RoomId } from '../../contracts/rooms.ts';

/**
 * Placeholder floor plan until `house:blockout` drafts assets/house/layout.json from the real
 * floor plan (PRD US-REF-02). Room ids come from the layout contract; the grid is a stand-in.
 */
export interface PlaceholderRoom {
  readonly id: RoomId;
  /** Floor footprint in tiles: [x, y] of the back corner, then width and depth. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
}

export const placeholderRooms: readonly PlaceholderRoom[] = [
  { id: 'kamar-tidur', x: 0, y: 0, w: 4, d: 4 },
  { id: 'kantor-papa', x: 4, y: 0, w: 4, d: 4 },
  { id: 'dapur', x: 0, y: 4, w: 4, d: 4 },
  { id: 'ruang-keluarga', x: 4, y: 4, w: 4, d: 4 },
];

export const PLACEHOLDER_WALL_HEIGHT = 1.2;
