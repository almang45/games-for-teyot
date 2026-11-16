import type { Point } from '../../../contracts/common.ts';
import type { HouseLayout, HouseRoom } from '../../../contracts/houseLayout.ts';
import { pointInPolygon } from '../../../contracts/geometry.ts';

/**
 * The room a tap in layout space lands on, or undefined outside every room (PRD US-HOUSE-01).
 * Tap polygons overlap where an upper storey sits in front of a lower one on screen; the one drawn
 * on top wins: the higher storey, then the room nearer the viewer.
 */
export function roomAt(layout: HouseLayout, p: Point): HouseRoom | undefined {
  let hit: HouseRoom | undefined;
  for (const room of layout.rooms) {
    if (!pointInPolygon(p, room.polygon)) continue;
    const onTop =
      !hit ||
      room.storey > hit.storey ||
      (room.storey === hit.storey && room.stand[1] > hit.stand[1]);
    if (onTop) hit = room;
  }
  return hit;
}
