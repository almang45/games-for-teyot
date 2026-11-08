import { describe, expect, it } from 'vitest';
import { depthKey, toScreen, toWorld, type IsoProjection } from '../../src/engine/iso/projection';

const proj: IsoProjection = { tileWidth: 180, origin: { x: 960, y: 200 } };

describe('2:1 dimetric projection', () => {
  it('maps world axes to the 2:1 diagonals', () => {
    expect(toScreen({ x: 1, y: 0 }, proj)).toEqual({ x: 1050, y: 245 });
    expect(toScreen({ x: 0, y: 1 }, proj)).toEqual({ x: 870, y: 245 });
  });

  it('lifts points by z without moving them sideways', () => {
    const floor = toScreen({ x: 2, y: 3 }, proj);
    const raised = toScreen({ x: 2, y: 3, z: 1 }, proj);
    expect(raised.x).toBe(floor.x);
    expect(floor.y - raised.y).toBe(90);
  });

  it('inverts on the floor plane', () => {
    const world = toWorld(toScreen({ x: 3.5, y: 1.25 }, proj), proj);
    expect(world.x).toBeCloseTo(3.5);
    expect(world.y).toBeCloseTo(1.25);
  });

  it('orders nearer tiles after farther ones', () => {
    expect(depthKey({ x: 4, y: 4 })).toBeGreaterThan(depthKey({ x: 0, y: 4 }));
    expect(depthKey({ x: 1, y: 1, z: 1 })).toBeGreaterThan(depthKey({ x: 1, y: 1 }));
  });
});
