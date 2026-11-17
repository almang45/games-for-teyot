import type { Point } from '../../../contracts/common.ts';
import type { HouseLayout, HouseRoom } from '../../../contracts/houseLayout.ts';
import { pointInPolygon } from '../../../contracts/geometry.ts';

/**
 * Paint order of rooms: negative when `a` is drawn before (under) `b`. Higher storeys sit on top,
 * then the room nearer the viewer. The hub draws with it and taps resolve with it, so a tap always
 * lands on the room the child sees.
 */
export function paintOrder(a: HouseRoom, b: HouseRoom): number {
  return a.storey - b.storey || a.stand[1] - b.stand[1];
}

/** The room a tap in layout space lands on, or undefined outside every room (PRD US-HOUSE-01). */
export function roomAt(layout: HouseLayout, p: Point): HouseRoom | undefined {
  let hit: HouseRoom | undefined;
  for (const room of layout.rooms) {
    if (pointInPolygon(p, room.polygon) && (!hit || paintOrder(room, hit) > 0)) hit = room;
  }
  return hit;
}
