import { encodePng } from '../../../tools/build/png';

export interface Figure {
  /** Lowest opaque row, in frame coordinates. */
  readonly bottom: number;
  /** Opaque rows from top to bottom. */
  readonly height: number;
}

/**
 * A sheet with an opaque bar standing in each frame. `figures[i]` shapes frame i; frames past
 * the list repeat the last figure, and `undefined` leaves a frame empty.
 */
export function sheetPng(
  width: number,
  height: number,
  frame: readonly [number, number],
  figures: readonly (Figure | undefined)[],
): Buffer {
  const [fw, fh] = frame;
  const perRow = Math.floor(width / fw);
  return encodePng(width, height, (x, y) => {
    const index = Math.floor(y / fh) * perRow + Math.floor(x / fw);
    const figure = index < figures.length ? figures[index] : figures.at(-1);
    const fx = x % fw;
    const fy = y % fh;
    const inside =
      figure !== undefined &&
      fx >= fw / 4 &&
      fx < (fw * 3) / 4 &&
      fy <= figure.bottom &&
      fy > figure.bottom - figure.height;
    return inside ? [200, 120, 80, 255] : [0, 0, 0, 0];
  });
}

/** Theia standing at her contract stance: soles on row 240, 216 px tall. */
export const THEIA_STANDING: Figure = { bottom: 240, height: 216 };
