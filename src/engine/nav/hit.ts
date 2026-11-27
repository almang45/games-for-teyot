import type { Point } from '../../../contracts/common.ts';
import { topRoom, type HouseLayout, type HouseRoom } from '../../../contracts/houseLayout.ts';
import { pointInPolygon } from '../../../contracts/geometry.ts';

/**
 * The room a tap in layout space lands on, or undefined outside every room (PRD US-HOUSE-01).
 * `shown` leaves out rooms the camera has faded away, so a tap reaches the room the child sees.
 * `checkHouseLayout` checks each floor's taps with the same rule (`topRoom`).
 */
export function roomAt(
  layout: HouseLayout,
  p: Point,
  shown: (room: HouseRoom) => boolean = () => true,
): HouseRoom | undefined {
  return topRoom(layout.rooms, (room) => shown(room) && pointInPolygon(p, room.polygon));
}
