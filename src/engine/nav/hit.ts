import type { Point } from '../../../contracts/common.ts';
import { paintOrder, type HouseLayout, type HouseRoom } from '../../../contracts/houseLayout.ts';
import { pointInPolygon } from '../../../contracts/geometry.ts';

/**
 * The room a tap in layout space lands on, or undefined outside every room (PRD US-HOUSE-01).
 * `shown` leaves out rooms the camera has faded away, so a tap reaches the room the child sees.
 * `checkHouseLayout` applies the same rule to keep each floor's taps on its own room.
 */
export function roomAt(
  layout: HouseLayout,
  p: Point,
  shown: (room: HouseRoom) => boolean = () => true,
): HouseRoom | undefined {
  let hit: HouseRoom | undefined;
  for (const room of layout.rooms) {
    if (!shown(room) || !pointInPolygon(p, room.polygon)) continue;
    if (!hit || paintOrder(room, hit) > 0) hit = room;
  }
  return hit;
}
