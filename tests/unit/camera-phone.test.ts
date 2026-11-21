import { describe, expect, it } from 'vitest';
import type { Point, Polygon, Rect } from '../../contracts/common';
import { HOUSE_SIZE } from '../../contracts/houseLayout';
import { minHitFramePx } from '../../contracts/screenLayout';
import { isPhone, tapSize } from '../../src/engine/camera/device';
import {
  clampView,
  fitView,
  HouseCamera,
  type FocusTarget,
  type Screen,
} from '../../src/engine/camera/houseCamera';
import { buildPlaceholderHouse } from '../../src/placeholder/house';

const OVERVIEW: Rect = [0, 0, HOUSE_SIZE[0], HOUSE_SIZE[1]];
const linear = (t: number): number => t;
/** Theia's phone (2400 × 1080 at 2.625 dppx) in game px: EXPAND keeps the frame's 1200 height. */
const PHONE: Screen = { width: Math.round((1200 * 2400) / 1080), height: 1200 };
const TABLET: Screen = { width: 1920, height: 1200 };

const kitchen: FocusTarget = { id: 'dapur', focus: [0, 500, 800, 500], storey: 0 };
const office: FocusTarget = { id: 'kantor-papa', focus: [900, 100, 800, 500], storey: 1 };
/** In the middle of the house, so a pinch about it never meets an edge. */
const middle: FocusTarget = { id: 'ruang-keluarga', focus: [560, 350, 800, 500], storey: 0 };

function phoneCamera(): HouseCamera {
  const camera = new HouseCamera(OVERVIEW, 800);
  camera.resize(PHONE);
  return camera;
}

/** Runs 16 ms frames until the glide stops; fails after `maxMs`. */
function glideOut(camera: HouseCamera, maxMs = 10_000): number {
  for (let ms = 0; ms <= maxMs; ms += 16) {
    camera.advance(16);
    if (!camera.gliding) return ms;
  }
  throw new Error(`still gliding after ${maxMs} ms`);
}

/** Where the screen's centre shows, in layout px. */
function centreOf(camera: HouseCamera): Point {
  const [x, y, w, h] = camera.shot.view;
  return [x + w / 2, y + h / 2];
}

describe('isPhone', () => {
  it('takes a screen with a short side under 600 dp for a phone, either way up', () => {
    expect(isPhone(914, 411)).toBe(true);
    expect(isPhone(411, 914)).toBe(true);
    expect(isPhone(1280, 800)).toBe(false);
    expect(isPhone(1440, 900)).toBe(false);
  });
});

describe('tapSize', () => {
  // pointInPolygon lets a corner sit up to 0.5 px outside an edge, so a side can come out 1 px long.
  const within1px = (actual: number, expected: number): void => {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
  };

  it('measures the largest square round the spot inside a convex room', () => {
    const square: Polygon = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    within1px(tapSize(square, [50, 50]), 100);
    within1px(tapSize(square, [25, 50]), 50);
    expect(tapSize(square, [150, 50])).toBe(0);
  });

  it('fits a third of a 2:1 diamond floor', () => {
    const diamond: Polygon = [
      [360, 0],
      [720, 180],
      [360, 360],
      [0, 180],
    ];
    within1px(tapSize(diamond, [360, 180]), 240);
  });

  it('stops at a notch whose corner pokes into the square', () => {
    // A 100 px square with a 40 px bite out of its top right: the bite's corner is at (60, 40).
    const notched: Polygon = [
      [0, 0],
      [60, 0],
      [60, 40],
      [100, 40],
      [100, 100],
      [0, 100],
    ];
    within1px(tapSize(notched, [50, 50]), 20);
  });

  it('keeps every placeholder room at least 72 dp on the phone with the whole house shown', () => {
    const { layout } = buildPlaceholderHouse();
    // The house is drawn on the 1920 × 1200 frame, so layout px are frame px.
    const minSide = minHitFramePx('phone', 'secondary');
    for (const room of layout.rooms) {
      expect(tapSize(room.polygon, room.stand), room.id).toBeGreaterThanOrEqual(minSide);
    }
  });
});

describe('clampView', () => {
  it('leaves a 16:10 view on the frame as it is on a 16:10 screen', () => {
    expect(clampView(office.focus, OVERVIEW, TABLET)).toEqual(office.focus);
  });

  it('moves a view in from the edge so the wider phone screen stays on the house', () => {
    const [x, y, w, h] = clampView(kitchen.focus, OVERVIEW, PHONE);
    const { scale } = fitView(kitchen.focus, PHONE.width, PHONE.height);
    // The screen shows wider than the view; its left edge lands on the frame's.
    expect(x + w / 2 - PHONE.width / scale / 2).toBeCloseTo(0);
    expect([y, w, h]).toEqual([500, 800, 500]);
  });

  it('centres an axis the screen shows more of than the house', () => {
    expect(clampView([300, 0, 1920, 1200], OVERVIEW, PHONE)).toEqual(OVERVIEW);
  });
});

describe('HouseCamera on the phone', () => {
  it('frames a room at once with every storey shown, and settles silently', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    expect(camera.shot.alpha).toEqual([1, 1, 1, 1]);
    expect(camera.room).toBeUndefined();
    expect(camera.moving).toBe(false);
    expect(camera.advance(16)).toBeUndefined();
    expect(centreOf(camera)).toEqual([1300, 350]);
  });

  it('frames a tapped room over a move and reports it on settling', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    camera.frame(kitchen, 600, linear);
    expect(camera.advance(600)).toEqual({ on: 'framed', room: 'dapur' });
    expect(camera.shot.alpha).toEqual([1, 1, 1, 1]);
  });

  it('shows the whole house at once on a screen that fits it', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    camera.overviewNow();
    expect(camera.shot.view).toEqual(OVERVIEW);
    expect(camera.advance(16)).toBeUndefined();
  });

  it('pans so the house follows the finger, and stops at its edge', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    const { scale } = fitView(camera.shot.view, PHONE.width, PHONE.height);
    const [x0, y0] = camera.shot.view;
    camera.hold(0);
    camera.drag(100, 0, 16);
    expect(camera.shot.view[0]).toBeCloseTo(x0 - 100 / scale);
    camera.drag(0, -10_000, 32);
    // Dragged far up, the house's bottom edge meets the screen's.
    const [, y, , h] = camera.shot.view;
    expect(y + h).toBeCloseTo(HOUSE_SIZE[1]);
    expect(y).toBeGreaterThan(y0);
  });

  it('keeps a thrown pan gliding after release, slowing to a stop', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    camera.hold(0);
    for (let t = 16; t <= 96; t += 16) camera.drag(30, 0, t);
    const released = centreOf(camera)[0];
    expect(camera.release(100)).toBe(true);
    expect(camera.moving).toBe(true);
    const stoppedAfter = glideOut(camera);
    expect(stoppedAfter).toBeGreaterThan(200);
    expect(camera.moving).toBe(false);
    // The finger threw the house right, so the view went on to the left.
    expect(centreOf(camera)[0]).toBeLessThan(released);
  });

  it('does not glide after the finger paused before letting go', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    camera.hold(0);
    camera.drag(60, 0, 16);
    expect(camera.release(400)).toBe(false);
    expect(camera.gliding).toBe(false);
  });

  it('stops a glide at the edge of the house', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    camera.hold(0);
    for (let t = 16; t <= 96; t += 16) camera.drag(-400, 0, t);
    camera.release(100);
    glideOut(camera);
    const [x, , w] = camera.shot.view;
    const { scale } = fitView(camera.shot.view, PHONE.width, PHONE.height);
    expect(x + w / 2 + PHONE.width / scale / 2).toBeCloseTo(HOUSE_SIZE[0]);
  });

  it('stops a glide when a finger goes down again', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    camera.hold(0);
    for (let t = 16; t <= 96; t += 16) camera.drag(30, 0, t);
    camera.release(100);
    camera.hold(150);
    expect(camera.gliding).toBe(false);
  });

  it('pinches out to the whole house and no further, and back in to the closest framing', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    for (let i = 0; i < 5; i++) camera.pinch(0.5, [PHONE.width / 2, PHONE.height / 2]);
    expect(camera.shot.view).toEqual(OVERVIEW);
    for (let i = 0; i < 5; i++) camera.pinch(2, [PHONE.width / 2, PHONE.height / 2]);
    expect(camera.shot.view[2]).toBeCloseTo(800);
  });

  it('keeps the spot under the fingers where it is while pinching', () => {
    const camera = phoneCamera();
    camera.frameNow(middle);
    const at: Point = [PHONE.width * 0.6, PHONE.height * 0.4];
    const under = (): Point => {
      const { scale, x, y } = fitView(camera.shot.view, PHONE.width, PHONE.height);
      return [(at[0] - x) / scale, (at[1] - y) / scale];
    };
    const before = under();
    camera.pinch(0.8, at);
    const after = under();
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it('moves the spot under two fingers along with their midpoint as one moves and the other stays', () => {
    const camera = phoneCamera();
    camera.frameNow(middle);
    const still: Point = [PHONE.width * 0.4, PHONE.height * 0.5];
    const from: Point = [PHONE.width * 0.6, PHONE.height * 0.5];
    const to: Point = [PHONE.width * 0.56, PHONE.height * 0.45];
    const under = ([gx, gy]: Point): Point => {
      const { scale, x, y } = fitView(camera.shot.view, PHONE.width, PHONE.height);
      return [(gx - x) / scale, (gy - y) / scale];
    };
    const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const before = under(mid(from, still));
    const [, , w] = camera.shot.view;
    camera.hold(0);
    camera.twoFingers([from, still], [to, still], 16);
    expect(camera.shot.view[2]).toBeGreaterThan(w);
    const after = under(mid(to, still));
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it('only pans when two touch points meet, as a zero spread has no scale', () => {
    const camera = phoneCamera();
    camera.frameNow(middle);
    const [, , w, h] = camera.shot.view;
    const other: Point = [PHONE.width * 0.5, PHONE.height * 0.5];
    camera.hold(0);
    expect(() => {
      camera.twoFingers([[PHONE.width * 0.6, PHONE.height * 0.5], other], [other, other], 16);
      camera.twoFingers([other, other], [[PHONE.width * 0.4, PHONE.height * 0.5], other], 32);
    }).not.toThrow();
    expect(camera.shot.view[2]).toBeCloseTo(w);
    expect(camera.shot.view[3]).toBeCloseTo(h);
  });

  it('lets a drag take the view during a zoom while the fade still finishes', () => {
    const camera = phoneCamera();
    camera.frameNow(office);
    camera.focusOn(office, 600, linear);
    camera.advance(300);
    camera.hold(300);
    camera.drag(50, 0, 316);
    const view = camera.shot.view;
    expect(camera.advance(300)).toEqual({ on: 'room', room: 'kantor-papa' });
    expect(camera.shot.view).toEqual(view);
    expect(camera.shot.alpha).toEqual([1, 1, 0, 0]);
  });

  it('refuses a gesture before it knows the screen, and a pinch with no spread', () => {
    const camera = new HouseCamera(OVERVIEW);
    expect(() => {
      camera.drag(10, 0, 0);
    }).toThrow(/no screen/);
    camera.resize(PHONE);
    expect(() => {
      camera.pinch(0, [0, 0]);
    }).toThrow(RangeError);
  });
});
