import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../../contracts/common';
import { HOUSE_SIZE } from '../../contracts/houseLayout';
import { fitView, HouseCamera, type FocusTarget } from '../../src/engine/camera/houseCamera';
import { roomAt } from '../../src/engine/nav/hit';
import { buildPlaceholderHouse } from '../../src/placeholder/house';
import { placeholderMotion } from '../../src/placeholder/motion';

const OVERVIEW: Rect = [0, 0, HOUSE_SIZE[0], HOUSE_SIZE[1]];
const linear = (t: number): number => t;
const { layout } = buildPlaceholderHouse();

const dapur: FocusTarget = { id: 'dapur', focus: [100, 500, 800, 500], storey: 0 };
const office: FocusTarget = { id: 'kantor-papa', focus: [1000, 100, 800, 500], storey: 1 };

/** Advances in 16 ms frames until the camera settles; fails after `maxMs`. */
function settle(camera: HouseCamera, maxMs = 5000): ReturnType<HouseCamera['advance']> {
  for (let ms = 0; ms <= maxMs; ms += 16) {
    const settled = camera.advance(16);
    if (settled) return settled;
  }
  throw new Error(`camera still moving after ${maxMs} ms`);
}

describe('fitView', () => {
  it('fits the whole frame into a 16:10 tablet exactly', () => {
    expect(fitView(OVERVIEW, 1920, 1200)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('centres a rect on a wider screen, filling its height', () => {
    const { scale, x, y } = fitView([100, 200, 800, 500], 2400, 1080);
    expect(scale).toBeCloseTo(1080 / 500);
    // The rect's centre lands on the screen's centre.
    const centre: Point = [x + 500 * scale, y + 450 * scale];
    expect(centre[0]).toBeCloseTo(1200);
    expect(centre[1]).toBeCloseTo(540);
  });
});

describe('HouseCamera', () => {
  it('starts settled on the overview with every storey shown', () => {
    const camera = new HouseCamera(OVERVIEW);
    expect(camera.shot).toEqual({ view: OVERVIEW, alpha: [1, 1, 1, 1] });
    expect(camera.room).toBeUndefined();
    expect(camera.moving).toBe(false);
    expect(camera.advance(16)).toBeUndefined();
  });

  it('zooms into a room within the move time and fades only the storeys above it', () => {
    const camera = new HouseCamera(OVERVIEW);
    camera.focusOn(office, 600, linear);
    expect(camera.room).toBe('kantor-papa');
    camera.advance(300);
    expect(camera.shot.alpha).toEqual([1, 1, 0.5, 0.5]);
    expect(camera.shot.view).toEqual([500, 50, 1360, 850]);
    expect(camera.advance(300)).toEqual({ on: 'room', room: 'kantor-papa' });
    expect(camera.shot).toEqual({ view: office.focus, alpha: [1, 1, 0, 0] });
    expect(camera.moving).toBe(false);
    expect(camera.advance(16)).toBeUndefined();
  });

  it('zooms back out and fades the storeys back in', () => {
    const camera = new HouseCamera(OVERVIEW);
    camera.focusOn(dapur, 600, linear);
    settle(camera);
    camera.zoomOut(600, linear);
    expect(camera.room).toBeUndefined();
    expect(settle(camera)).toEqual({ on: 'overview' });
    expect(camera.shot).toEqual({ view: OVERVIEW, alpha: [1, 1, 1, 1] });
  });

  it('turns a zoom out cut short into the next zoom in without a jump', () => {
    const camera = new HouseCamera(OVERVIEW);
    camera.focusOn(dapur, 600, linear);
    settle(camera);
    camera.zoomOut(600, linear);
    camera.advance(200);
    const midway = camera.shot;
    camera.focusOn(office, 600, linear);
    expect(camera.shot).toEqual(midway);
    camera.advance(16);
    const [x0, y0] = midway.view;
    const [x1, y1] = camera.shot.view;
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(40);
    expect(settle(camera)).toEqual({ on: 'room', room: 'kantor-papa' });
    expect(camera.shot.alpha).toEqual([1, 1, 0, 0]);
  });

  it('follows the given easing', () => {
    const camera = new HouseCamera(OVERVIEW);
    camera.focusOn(dapur, 600, (t) => t * t);
    camera.advance(300);
    expect(camera.shot.alpha[1]).toBeCloseTo(0.75);
  });

  it('lets only storeys shown at least half catch a tap', () => {
    const camera = new HouseCamera(OVERVIEW);
    camera.focusOn(dapur, 600, linear);
    camera.advance(200);
    expect(camera.shows(1)).toBe(true);
    camera.advance(200);
    expect(camera.shows(0)).toBe(true);
    expect(camera.shows(1)).toBe(false);
  });

  it('refuses a move with no duration and ignores negative frame times', () => {
    const camera = new HouseCamera(OVERVIEW);
    expect(() => {
      camera.focusOn(dapur, 0, linear);
    }).toThrow(RangeError);
    camera.focusOn(dapur, 600, linear);
    camera.advance(-100);
    expect(camera.shot.view).toEqual(OVERVIEW);
  });
});

describe('the hub zoom on the placeholder house', () => {
  it('stays within the transition cap of the motion contract', () => {
    expect(placeholderMotion['house.room-zoom'].duration).toBeLessThanOrEqual(600);
  });

  it('gives every room a 16:10 focus on the frame that holds its whole floor', () => {
    for (const room of layout.rooms) {
      const [x, y, w, h] = room.focus;
      expect(w / h, room.id).toBeCloseTo(HOUSE_SIZE[0] / HOUSE_SIZE[1], 2);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(HOUSE_SIZE[0]);
      expect(y + h).toBeLessThanOrEqual(HOUSE_SIZE[1]);
      for (const [px, py] of room.walk) {
        expect(px >= x && px <= x + w && py >= y && py <= y + h, room.id).toBe(true);
      }
    }
  });

  it('lets a tap fall through a faded storey to the room below it', () => {
    const upstairs = layout.rooms.find((r) => r.storey === 2);
    if (!upstairs) throw new Error('fixture has no upstairs room');
    const { stand } = upstairs;
    expect(roomAt(layout, stand)?.id).toBe(upstairs.id);
    expect(roomAt(layout, stand, (r) => r.storey <= 0)?.id).not.toBe(upstairs.id);
  });
});
