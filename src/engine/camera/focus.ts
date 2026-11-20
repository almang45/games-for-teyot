import type { Point, Rect } from '../../../contracts/common.ts';
import { HOUSE_SIZE } from '../../../contracts/houseLayout.ts';

/** The focus rect keeps this share of the room's size as a border, then grows to 16:10. */
const FOCUS_PAD = 0.1;
const FRAME_ASPECT = HOUSE_SIZE[0] / HOUSE_SIZE[1];

/** The axis-aligned bounds of `points`, at least 1 px each way. */
export function boundsOf(points: readonly Point[]): Rect {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return [x, y, Math.max(1, Math.max(...xs) - x), Math.max(1, Math.max(...ys) - y)];
}

/**
 * A room's camera focus (layout.json `focus`): its bounds padded and grown to the frame's aspect,
 * kept on the frame. Shared by the blockout tool and the placeholder house so both zoom alike.
 */
export function focusRect(polygon: readonly Point[]): Rect {
  const [bx, by, bw, bh] = boundsOf(polygon);
  const pad = FOCUS_PAD * Math.max(bw, bh);
  let w = bw + 2 * pad;
  let h = bh + 2 * pad;
  if (w / h < FRAME_ASPECT) w = h * FRAME_ASPECT;
  else h = w / FRAME_ASPECT;
  // Round the size before placing it, so the rounded rect can't poke 1 px past the frame.
  w = Math.round(w);
  h = Math.round(h);
  if (w > HOUSE_SIZE[0] || h > HOUSE_SIZE[1]) return [0, 0, HOUSE_SIZE[0], HOUSE_SIZE[1]];
  const place = (centre: number, size: number, max: number): number =>
    Math.min(Math.max(Math.round(centre - size / 2), 0), max - size);
  return [place(bx + bw / 2, w, HOUSE_SIZE[0]), place(by + bh / 2, h, HOUSE_SIZE[1]), w, h];
}
