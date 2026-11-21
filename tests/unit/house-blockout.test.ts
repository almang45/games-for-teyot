import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkHouseLayout, houseLayout } from '../../contracts/houseLayout';
import { pointInPolygon } from '../../contracts/geometry';
import { toScreen } from '../../src/engine/iso/projection';
import { convexHull, fitToCanvas, gridStep, project, type Vec3 } from '../../tools/house/iso';
import { focusRect } from '../../src/engine/camera/focus';
import { CANVAS, draftLayout, percent } from '../../tools/house/layout';
import { checkPlan, defaultWalk, floorPlan, type FloorPlan } from '../../tools/house/plan';
import { runBlockout } from '../../tools/house/run';
import {
  buildSolids,
  drawOrder,
  facesOf,
  gridLinesOf,
  quadZ,
  stepsOf,
  type Solid,
} from '../../tools/house/scene';
import { blockoutSvg, guideSvg } from '../../tools/house/svg';
import type { HouseProp } from '../../contracts/houseLayout';
import { hiddenBy, hiddenQuad } from '../../tools/house/visibility';

/** A made-up two-storey house; the real plan stays in reference/ (AGENTS.md privacy rules). */
function planInput(): Record<string, unknown> {
  return {
    areas: [
      { id: 'ruang-keluarga', storey: 0, rect: [0, 0, 4, 3], walls: ['x0', 'y0'] },
      { id: 'kamar-tidur', storey: 2, rect: [-3.4, -3.4, 3, 3], walls: ['x0', 'y0'] },
      { id: 'kebun', storey: 0, z: -0.2, rect: [4, 0, 2, 3], outdoor: true },
    ],
    doors: [{ area: 'ruang-keluarga', wall: 'x0', at: 1, width: 0.8 }],
    stairs: [],
    rooms: [
      {
        id: 'ruang-keluarga',
        area: 'ruang-keluarga',
        activities: ['coloring'],
        stand: [2, 1.5],
        parking: { bubu: [1.5, 2], ocica: [2.5, 2] },
      },
      {
        id: 'kamar-tidur',
        area: 'kamar-tidur',
        activities: ['tracing'],
        stand: [-1.9, -1.9],
        parking: { bubu: [-2.4, -1.4], ocica: [-1.4, -1.4] },
      },
    ],
    spots: {
      fridge: { room: 'ruang-keluarga', wall: 'y0', at: 1, width: 0.6, bottom: 0.8, height: 0.8 },
      'sticker-wall': {
        room: 'kamar-tidur',
        wall: 'y0',
        at: 0.4,
        width: 1,
        bottom: 0.5,
        height: 0.5,
      },
    },
    waypoints: [
      { id: 'tangga-bawah', at: [3.5, 1.5], storey: 0, stair: true },
      { id: 'tangga-atas', at: [-0.6, -1], storey: 2, stair: true },
    ],
    edges: [
      ['ruang-keluarga', 'tangga-bawah'],
      ['tangga-bawah', 'tangga-atas'],
      ['tangga-atas', 'kamar-tidur'],
    ],
    start: 'ruang-keluarga',
  };
}

const plan = (patch: Record<string, unknown> = {}): FloorPlan =>
  floorPlan.parse({ ...planInput(), ...patch });

function drafted(p: FloorPlan = plan()) {
  const solids = buildSolids(p);
  const fit = fitToCanvas(
    solids.flatMap((s) => facesOf(s).flatMap((f) => f.points)),
    CANVAS,
    p.marginPx,
    gridStep(p.grid),
  );
  return { solids, fit, draft: draftLayout(p, fit, solids) };
}

const flight = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'tangga',
  storey: 0,
  rect: [4, 0, 1, 1],
  rise: '+x',
  from: 0,
  to: 1,
  steps: 2,
  ...patch,
});

/** Draw-order position of the first solid of `owner` and `kind`. */
function rank(order: readonly Solid[], owner: string, kind: Solid['kind']): number {
  const i = order.findIndex((s) => s.owner === owner && s.kind === kind);
  if (i < 0) throw new Error(`no ${kind} of ${owner}`);
  return i;
}

describe('US-REF-02 projection', () => {
  it('matches the engine projection with one metre as the tile', () => {
    const fit = { scale: 150, origin: [1900, 800] as [number, number] };
    for (const p of [
      { x: 0, y: 0, z: 0 },
      { x: 3.2, y: 1.1, z: 0 },
      { x: 0.5, y: 4, z: 2.4 },
      { x: 7, y: 2, z: -0.3 },
    ]) {
      const engine = toScreen(p, { tileWidth: fit.scale * 2, origin: { x: 1900, y: 800 } });
      const [x, y] = project(p, fit);
      expect(x).toBeCloseTo(engine.x, 9);
      expect(y).toBeCloseTo(engine.y, 9);
    }
  });

  it('fits points at a whole scale, centred inside the margin', () => {
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 0, y: 5, z: 0 },
      { x: 10, y: 5, z: 4 },
    ];
    const fit = fitToCanvas(points, [3840, 2400], 160);
    expect(Number.isInteger(fit.scale)).toBe(true);
    const screen = points.map((p) => project(p, fit));
    const xs = screen.map(([x]) => x);
    const ys = screen.map(([, y]) => y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(159);
    expect(Math.max(...xs)).toBeLessThanOrEqual(3840 - 159);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(159);
    expect(Math.max(...ys)).toBeLessThanOrEqual(2400 - 159);
    // Centred: equal slack on both sides, to the rounding of the origin.
    expect(Math.abs(Math.min(...xs) - (3840 - Math.max(...xs)))).toBeLessThanOrEqual(1);
  });

  it('fits at a scale that puts every grid corner on a whole pixel', () => {
    expect([0.2, 0.25, 0.5, 1].map(gridStep)).toEqual([10, 8, 4, 2]);
    expect(() => gridStep(0.1234567)).toThrow(RangeError);
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 5, z: 4 },
    ];
    const free = fitToCanvas(points, [3840, 2400], 160);
    const stepped = fitToCanvas(points, [3840, 2400], 160, 10);
    expect(stepped.scale % 10).toBe(0);
    expect(stepped.scale).toBeLessThanOrEqual(free.scale);
    expect(free.scale - stepped.scale).toBeLessThan(10);
  });

  it('refuses to fit nothing, or into no room', () => {
    expect(() => fitToCanvas([], [100, 100], 0)).toThrow(RangeError);
    expect(() => fitToCanvas([{ x: 0, y: 0, z: 0 }], [100, 100], 50)).toThrow(RangeError);
    expect(() =>
      fitToCanvas(
        [
          { x: 0, y: 0, z: 0 },
          { x: 500, y: 0, z: 0 },
        ],
        [100, 100],
        0,
      ),
    ).toThrow('too large');
  });

  it('builds a convex hull without interior or collinear points', () => {
    const hull = convexHull([
      [0, 0],
      [10, 0],
      [5, 0],
      [10, 10],
      [0, 10],
      [5, 5],
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual([5, 5]);
    expect(convexHull([[1, 1]])).toEqual([[1, 1]]);
  });
});

describe('US-REF-02 floor plan', () => {
  it('fills defaults', () => {
    const p = plan();
    expect(p).toMatchObject({ wallHeight: 2.4, slab: 0.2, walkInset: 0.3, marginPx: 160 });
    expect(p.areas[2]?.walls).toEqual([]);
    expect(p.doors[0]?.height).toBe(2.1);
  });

  it('passes a consistent plan', () => {
    expect(checkPlan(plan())).toEqual([]);
  });

  it('insets the default walk from back walls only', () => {
    const [living] = plan().areas;
    if (!living) throw new Error('fixture has no areas');
    expect(defaultWalk(living, 0.3)).toEqual([0.3, 0.3, 3.7, 2.7]);
    expect(defaultWalk({ ...living, walls: ['y0'] }, 0.3)).toEqual([0, 0.3, 4, 2.7]);
  });

  it('reports what the schema cannot', () => {
    const input = planInput();
    const spots = input.spots as Record<string, object>;
    const p = plan({
      spots: { ...spots, fridge: { ...spots.fridge, offset: 3 } },
      areas: [...(input.areas as object[]), { id: 'kebun', storey: 0, rect: [0, 0, 1, 1] }],
      doors: [
        { area: 'garasi', wall: 'x0', at: 0, width: 1 },
        { area: 'ruang-keluarga', wall: 'y0', at: 3.5, width: 1 },
        { area: 'kebun', wall: 'x0', at: 0, width: 0.8, height: 3 },
      ],
      stairs: [flight({ id: 'datar', from: 1, to: 1 }), flight({ id: 'turun', from: 1, to: 0 })],
      rooms: [
        {
          id: 'ruang-keluarga',
          area: 'ruang-keluarga',
          activities: [],
          stand: [0.1, 0.1],
          parking: { bubu: [1, 1], ocica: [1, 1] },
          walk: [3, 2, 2, 2],
        },
        {
          id: 'kamar-tidur',
          area: 'loteng',
          activities: [],
          stand: [1, 1],
          parking: { bubu: [1, 1], ocica: [1, 1] },
        },
      ],
    });
    p.spots['sticker-wall'] = { ...p.spots['sticker-wall'], room: 'dapur' };
    const messages = checkPlan(p).map((i) => `${i.path}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'areas: duplicate area kebun',
        'rooms[0].walk: walk leaves area ruang-keluarga',
        'rooms[0].stand: must lie at least 5 cm inside the walk',
        'rooms[1].area: unknown area loteng',
        'doors[0].area: unknown area garasi',
        'doors[1]: runs past the end of the y0 wall of ruang-keluarga',
        'doors[2].wall: kebun has no x0 wall',
        'doors[2]: is taller than the x0 wall of kebun',
        'stairs[0]: a flight climbs along rise: from must be below to',
        'stairs[1]: a flight climbs along rise: from must be below to',
        'spots.sticker-wall.room: dapur is not in rooms',
        'spots.fridge.offset: stands outside area ruang-keluarga',
      ]),
    );
  });

  it('keeps stands and parking off the edge of the walk', () => {
    const [living, bedroom] = planInput().rooms as Record<string, unknown>[];
    // The default walk starts 0.3 m from the x0 wall: on its edge is too close.
    const edge = { ...living, stand: [0.3, 1.5], parking: { bubu: [0.36, 1], ocica: [2, 2] } };
    const paths = checkPlan(plan({ rooms: [edge, bedroom] })).map((i) => i.path);
    expect(paths).toEqual(['rooms[0].stand']);
  });

  it('keeps walls, doors, stairs and spots on the grid', () => {
    const input = planInput();
    const spots = input.spots as Record<string, object>;
    const issues = checkPlan(
      plan({
        areas: [...(input.areas as object[]), { id: 'teras', storey: 0, rect: [6, 0, 1.1, 3] }],
        doors: [{ area: 'ruang-keluarga', wall: 'x0', at: 1, width: 0.9 }],
        stairs: [flight({ rect: [4, 0.05, 1, 1] })],
        spots: { ...spots, fridge: { ...spots.fridge, offset: 0.65 } },
      }),
    ).map((i) => `${i.path}: ${i.message}`);
    expect(issues).toEqual([
      'areas[3].rect: x + width 7.1 is off the 20 cm grid; nearest 7',
      'stairs[0].rect: y 0.05 is off the 20 cm grid; nearest 0',
      'stairs[0].rect: y + depth 1.05 is off the 20 cm grid; nearest 1',
      'doors[0]: width 0.9 is off the 20 cm grid; nearest 1',
      'spots.fridge: offset 0.65 is off the 20 cm grid; nearest 0.6',
    ]);
    // A coarser grid only needs a different plan.
    expect(checkPlan(plan({ grid: 0.5 })).map((i) => i.path)).toContain('doors[0]');
  });

  it('reports a room without its area once, not again for its spot', () => {
    const [living, bedroom] = planInput().rooms as Record<string, unknown>[];
    const issues = checkPlan(plan({ rooms: [living, { ...bedroom, area: 'loteng' }] }));
    expect(issues.map((i) => i.path)).toEqual(['rooms[1].area']);
  });

  it('reports duplicate rooms, stairs and shared floors', () => {
    const input = planInput();
    const [living] = input.rooms as object[];
    const stair = flight({ rect: [0, 0, 1, 1] });
    const messages = checkPlan(plan({ rooms: [living, living], stairs: [stair, stair] })).map(
      (i) => i.message,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        'duplicate stair tangga',
        'duplicate room ruang-keluarga',
        'area ruang-keluarga is the floor of more than one room',
      ]),
    );
  });
});

describe('US-REF-02 scene', () => {
  it('splits a flight into steps along its rise', () => {
    const flight = {
      id: 't',
      storey: 0 as const,
      rect: [0, 0, 2, 1] as [number, number, number, number],
      from: 0,
      to: 1,
      steps: 4,
    };
    expect(stepsOf({ ...flight, rise: '+x' })[0]).toEqual({ rect: [0, 0, 0.5, 1], top: 0.25 });
    expect(stepsOf({ ...flight, rise: '-x' })[0]).toEqual({ rect: [1.5, 0, 0.5, 1], top: 0.25 });
    expect(stepsOf({ ...flight, rise: '+y' })[3]).toEqual({ rect: [0, 0.75, 2, 0.25], top: 1 });
    expect(stepsOf({ ...flight, rise: '-y' })[3]).toEqual({ rect: [0, 0, 2, 0.25], top: 1 });
  });

  it('keeps a wall and its doors together, doors last', () => {
    const wall = buildSolids(plan()).find(
      (x) => x.kind === 'wall-x0' && x.owner === 'ruang-keluarga',
    );
    if (!wall) throw new Error('fixture has no living x0 wall');
    expect(facesOf(wall).map((f) => f.kind)).toEqual(['wall-x0', 'door']);
  });

  it('draws a step in front of a back wall after the wall and its door', () => {
    const order = drawOrder(buildSolids(plan({ stairs: [flight({ rect: [0.2, 1, 0.5, 0.5] })] })));
    expect(rank(order, 'tangga', 'step')).toBeGreaterThan(rank(order, 'ruang-keluarga', 'wall-x0'));
  });

  it('orders across storeys: a mezzanine behind a ground-floor wall draws first', () => {
    const areas = [
      ...(planInput().areas as object[]),
      { id: 'mezanin', storey: 1, rect: [-1, 0, 1, 1] },
    ];
    const order = drawOrder(buildSolids(plan({ areas })));
    expect(rank(order, 'mezanin', 'slab')).toBeLessThan(rank(order, 'ruang-keluarga', 'wall-x0'));
  });

  it('draws a wide slab behind before a small one in front, whatever their centres', () => {
    const p = plan();
    const order = drawOrder(
      buildSolids({
        ...p,
        areas: [
          { id: 'teras', storey: 0, rect: [0, 0, 10, 1], walls: [], eyeWalls: [], outdoor: false },
          {
            id: 'ruang-keluarga',
            storey: 0,
            rect: [0, 1, 1, 1],
            walls: [],
            eyeWalls: [],
            outdoor: false,
          },
        ],
        doors: [],
      }),
    );
    // By centre depth the small slab (x + y = 2) would come before the wide one (5.5).
    expect(rank(order, 'teras', 'slab')).toBeLessThan(rank(order, 'ruang-keluarga', 'slab'));
  });

  it('draws grid lines on floors and back walls, whole metres as major lines', () => {
    const solids = buildSolids(plan());
    const lines = (owner: string, kind: Solid['kind']) => {
      const solid = solids.find((x) => x.owner === owner && x.kind === kind);
      if (!solid) throw new Error(`no ${kind} of ${owner}`);
      return gridLinesOf(solid, 0.2);
    };
    // The living room floor is 4 × 3 m: 19 lines across x, 14 across y; 3 + 2 on whole metres.
    const floor = lines('ruang-keluarga', 'slab');
    expect(floor).toHaveLength(19 + 14);
    expect(floor.filter((l) => l.major)).toHaveLength(3 + 2);
    expect(floor.every((l) => l.from.z === 0 && l.to.z === 0)).toBe(true);
    // Its x0 wall is 3 m long and 2.4 m tall: 14 uprights, 11 courses.
    const wall = lines('ruang-keluarga', 'wall-x0');
    expect(wall).toHaveLength(14 + 11);
    expect(wall.every((l) => l.from.x === 0 && l.to.x === 0)).toBe(true);
    expect(lines('kamar-tidur', 'wall-y0').some((l) => l.from.z === 3.4 + 1)).toBe(true);
    const step = buildSolids(plan({ stairs: [flight()] })).find((x) => x.kind === 'step');
    expect(step && gridLinesOf(step, 0.2)).toEqual([]);
  });

  it('still draws everything when boxes interpenetrate', () => {
    const solids = buildSolids(plan({ stairs: [flight({ rect: [-0.5, 0.5, 1, 1], from: -0.5 })] }));
    expect(drawOrder(solids)).toHaveLength(solids.length);
  });

  it('refuses a door whose area is missing', () => {
    const p = plan();
    expect(() =>
      buildSolids({
        ...p,
        doors: [{ area: 'garasi', wall: 'x0', at: 0, width: 1, height: 2, open: false }],
      }),
    ).toThrow('run checkPlan first');
  });
});

describe('US-REF-02 visibility', () => {
  const solids = buildSolids(
    plan({
      areas: [
        ...(planInput().areas as object[]),
        { id: 'balkon', storey: 2, rect: [3.5, 3.5, 1, 1] },
      ],
    }),
  );

  it('hides floor behind a higher slab along the camera ray', () => {
    // (0.5, 0.5, 0) lands on the same pixel as (3.9, 3.9, 3.4), on the balcony.
    expect(hiddenBy({ x: 0.5, y: 0.5, z: 0 }, solids)?.owner).toBe('balkon');
    expect(hiddenBy({ x: 2, y: 2, z: 0 }, solids)).toBeUndefined();
  });

  it('hides what stands behind a back wall, never the wall’s own room', () => {
    // The bedroom's x0 wall stands at x = -3.4, y -3.4 to -0.4, z 3.4 to 5.8.
    expect(hiddenBy({ x: -4, y: -2, z: 3 }, solids)?.owner).toBe('kamar-tidur');
    expect(hiddenBy({ x: -3.3, y: -2, z: 3.4 }, solids)).toBeUndefined();
  });

  it('sees through a door, not past its jamb', () => {
    // The living room's x0 door runs y 1 to 1.9 at x = 0; the ray from x = -0.5 meets it at t = 0.5.
    expect(hiddenBy({ x: -0.5, y: 1, z: 0.5 }, solids)).toBeUndefined();
    expect(hiddenBy({ x: -0.5, y: 0, z: 0.5 }, solids)?.kind).toBe('wall-x0');
  });

  it('hides floor behind a flight of stairs', () => {
    const withStairs = buildSolids(plan({ stairs: [flight()] }));
    // (3.8, 0.2, 0) lands on (4.3, 0.7, 0.5): inside the first step, whose tread is at 0.5.
    expect(hiddenBy({ x: 3.8, y: 0.2, z: 0 }, withStairs)?.owner).toBe('tangga');
  });

  it('measures the hidden share of a quad', () => {
    const hidden = hiddenQuad(quadZ(0, [0, 0, 4, 3]), solids);
    expect(hidden.fraction).toBeGreaterThan(0);
    expect(hidden.fraction).toBeLessThan(0.2);
    expect(hidden.by).toEqual(['balkon']);
    expect(hiddenQuad(quadZ(0, [2, 2, 1, 1]), solids).points).toEqual([]);
    expect(() => hiddenQuad([], solids)).toThrow('four corners');
  });
});

describe('US-REF-02 draft layout', () => {
  it('passes the house layout contract', () => {
    const { draft } = drafted();
    const parsed = houseLayout.parse(draft.layout);
    expect(checkHouseLayout(parsed)).toEqual([]);
    expect(draft.issues).toEqual([]);
    expect(draft.layout.rooms.map((r) => r.storey)).toEqual([0, 2]);
    expect(draft.layout.occluders).toEqual([]);
  });

  it('moves a spot in front of its wall by its offset', () => {
    const spots = planInput().spots as Record<string, object>;
    const atWall = drafted().draft.layout.spots.fridge.rect;
    const inFront = drafted(plan({ spots: { ...spots, fridge: { ...spots.fridge, offset: 0.6 } } }))
      .draft.layout.spots.fridge.rect;
    // Away from a y0 wall is toward the viewer's lower left: smaller x, larger y on screen.
    expect(inFront[0]).toBeLessThan(atWall[0]);
    expect(inFront[1]).toBeGreaterThan(atWall[1]);
    // Same size, to the whole-pixel rounding of the layout.
    expect(Math.abs(inFront[2] - atWall[2])).toBeLessThanOrEqual(1);
    expect(Math.abs(inFront[3] - atWall[3])).toBeLessThanOrEqual(1);
  });

  it('puts the stand where the projection puts it, in half-size space', () => {
    const { fit, draft } = drafted();
    const [x, y] = project({ x: 2, y: 1.5, z: 0 }, fit);
    expect(draft.layout.rooms[0]?.stand).toEqual([Math.round(x / 2), Math.round(y / 2)]);
    expect(draft.stands[1]).toEqual({ x: -1.9, y: -1.9, z: 3.4 });
  });

  it('warns about hidden walk, stands and spots', () => {
    const areas = [
      ...(planInput().areas as object[]),
      { id: 'balkon', storey: 2, rect: [3.5, 3.5, 1, 1] },
    ];
    const { draft } = drafted(plan({ areas }));
    const issues = draft.issues.map((i) => `${i.severity} ${i.path}`);
    expect(issues).toContain('warning rooms[0].walk');
    expect(draft.hidden.map((h) => h.room)).toEqual(['ruang-keluarga']);

    const covered = drafted(
      plan({ areas: [...areas, { id: 'atap', storey: 3, z: 6, rect: [7, 7, 2, 2] }] }),
    );
    // A shelf on the fridge's own storey hides it; a roof above does not: it fades in the zoom.
    const shelf = drafted(
      plan({ areas: [...areas, { id: 'rak', storey: 0, z: 2.2, rect: [1.5, 0.5, 1, 1] }] }),
    );
    expect(shelf.draft.issues).toContainEqual(
      expect.objectContaining({
        path: 'spots.fridge',
        message: expect.stringMatching(/^\d+% hidden behind rak$/) as unknown,
      }),
    );
    const roof = drafted(
      plan({ areas: [...areas, { id: 'atap-kulkas', storey: 3, z: 6, rect: [5, 4, 2, 2] }] }),
    );
    expect(roof.draft.issues.map((i) => i.path)).not.toContain('spots.fridge');

    const paths = covered.draft.issues.map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['rooms[0].stand', 'rooms[0].parking.bubu']));
  });

  it('keeps focus rects at 16:10 and on the frame', () => {
    const [x, y, w, h] = focusRect([
      [10, 10],
      [110, 10],
      [110, 60],
    ]);
    expect(w / h).toBeCloseTo(1.6, 1);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(
      focusRect([
        [0, 0],
        [1900, 0],
        [1900, 1190],
      ]),
    ).toEqual([0, 0, 1920, 1200]);
    const [, , tw, th] = focusRect([
      [0, 0],
      [10, 0],
      [10, 400],
    ]);
    expect(tw / th).toBeCloseTo(1.6, 1);
    // Against the far corner, rounding must not push the rect past the frame.
    for (let tenth = 0; tenth < 10; tenth++) {
      const d = tenth / 10;
      const [ex, ey, ew, eh] = focusRect([
        [1700 + d, 1050 + d],
        [1919.6, 1050 + d],
        [1919.6, 1199.7],
      ]);
      expect(ex + ew).toBeLessThanOrEqual(1920);
      expect(ey + eh).toBeLessThanOrEqual(1200);
    }
  });

  it('puts a waypoint on the floor of the area under it', () => {
    const waypoints = [
      ...(planInput().waypoints as object[]),
      { id: 'kebun', at: [5, 1], storey: 0 },
      { id: 'luar', at: [20, 20], storey: 0 },
    ];
    const { fit, draft } = drafted(plan({ waypoints }));
    const pos = (p: Vec3): [number, number] => {
      const [x, y] = project(p, fit);
      return [Math.round(x / 2), Math.round(y / 2)];
    };
    const byId = new Map(draft.layout.waypoints.map((w) => [w.id, w.pos]));
    expect(byId.get('kebun')).toEqual(pos({ x: 5, y: 1, z: -0.2 }));
    expect(byId.get('luar')).toEqual(pos({ x: 20, y: 20, z: 0 }));
  });

  it.each([
    { walls: ['y0'], open: { x: -0.3, y: 0.3 } },
    { walls: ['x0'], open: { x: 0.3, y: -0.3 } },
  ])('keeps the floor beside a lone $walls wall out of the tap polygon', ({ walls, open }) => {
    const areas = (planInput().areas as Record<string, unknown>[]).map((a) =>
      a.id === 'ruang-keluarga' ? { ...a, walls } : a,
    );
    const { fit, draft } = drafted(plan({ areas, doors: [] }));
    const room = draft.layout.rooms[0];
    if (!room) throw new Error('fixture lost ruang-keluarga');
    const layoutAt = (p: Vec3): [number, number] => {
      const [x, y] = project(p, fit);
      return [Math.round(x / 2), Math.round(y / 2)];
    };
    expect(checkHouseLayout(houseLayout.parse(draft.layout))).toEqual([]);
    // The floor's back corner stays a vertex: a hull would cut past it.
    expect(room.polygon).toContainEqual(layoutAt({ x: 0, y: 0, z: 0 }));
    for (const p of room.walk) expect(pointInPolygon(p, room.polygon)).toBe(true);
    // Floor just past the open side belongs to whatever room sits there, not to this one.
    expect(pointInPolygon(layoutAt({ ...open, z: 0 }), room.polygon)).toBe(false);
  });

  it('never rounds a sliver to 0 % or a near miss to 100 %', () => {
    expect([0, 0.001, 0.5, 0.999, 1].map(percent)).toEqual(['0%', '<1%', '50%', '>99%', '100%']);
  });
});

describe('US-REF-02 svg', () => {
  it('draws the clean blockout without text, one group per solid in draw order', () => {
    const { solids, fit } = drafted();
    const svg = blockoutSvg(solids, fit, CANVAS);
    expect(svg).toContain('width="3840" height="2400"');
    expect(svg).not.toContain('<text');
    expect(svg).toContain('<g id="structure"');
    expect(svg).toMatch(
      /<g data-owner="ruang-keluarga" data-solid="wall-x0" data-storey="lt-dasar">\n\s*<polygon data-kind="wall-x0"[^>]*>\n\s*<polygon data-kind="door"/,
    );
    expect(svg).toContain('data-storey="lt-atas"');
    expect(svg).not.toContain('mezzanine-1');
    expect(svg.match(/<g data-owner=/g)).toHaveLength(solids.length);
  });

  it('draws the grid under doors, only when asked', () => {
    const { solids, fit } = drafted();
    expect(blockoutSvg(solids, fit, CANVAS)).not.toContain('data-kind="grid');
    const svg = blockoutSvg(solids, fit, CANVAS, 0.2);
    expect(svg).toContain('data-kind="grid-major"');
    expect(svg).toMatch(
      /<polygon data-kind="wall-x0"[^>]*>\n\s*<path data-kind="grid"[^>]*>\n\s*<path data-kind="grid-major"[^>]*>\n\s*<polygon data-kind="door"/,
    );
    expect(svg).not.toContain('<text');
  });

  it('adds the layout, labels and scale to the guide', () => {
    const { solids, fit, draft } = drafted();
    const svg = guideSvg({
      solids,
      fit,
      grid: 0.2,
      size: CANVAS,
      layout: draft.layout,
      hidden: [{ room: 'ruang-keluarga', points: [{ x: 1, y: 1, z: 0 }] }],
      stands: draft.stands,
    });
    for (const id of [
      'guide-rooms',
      'guide-hidden',
      'guide-edges',
      'guide-theia',
      'guide-labels',
    ]) {
      expect(svg).toContain(`<g id="${id}"`);
    }
    expect(svg).toContain('>ruang-keluarga</text>');
    expect(svg).toContain(`1 m = ${fit.scale} px`);
    expect(svg).toContain(`20 cm cell = ${0.4 * fit.scale} × ${0.2 * fit.scale} px tile`);
    expect(svg).toContain('data-kind="grid"');
  });
});

describe('US-REF-02 runBlockout', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rct-blockout-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const write = (value: unknown): void => {
    writeFileSync(join(root, 'plan.json'), JSON.stringify(value));
  };

  it('writes the blockout, the guide and a contract-valid draft layout', () => {
    write({ ...planInput(), furniture: FURNITURE });
    const { report, summary } = runBlockout(root, 'plan.json', 'out');
    expect(report.issues).toEqual([]);
    expect(summary?.files).toEqual([
      'out/house-blockout.svg',
      'out/house-blockout-grid.svg',
      'out/house-blockout-props-lt-dasar.svg',
      'out/house-blockout-guide.svg',
      'out/layout.json',
    ]);
    expect(summary?.props).toBe(FURNITURE.length);
    const svg = (name: string): string => readFileSync(join(root, 'out', name), 'utf8');
    // The structure is painted without furniture; the props file adds it.
    expect(svg('house-blockout.svg')).not.toContain('data-solid="prop"');
    expect(svg('house-blockout-grid.svg')).not.toContain('data-solid="prop"');
    const props = svg('house-blockout-props-lt-dasar.svg');
    expect(props.match(/data-solid="prop"/g)).toHaveLength(3);
    expect(props).not.toContain('<text');
    // Zoomed into the ground floor, the bedroom above is faded out.
    expect(props).not.toContain('data-storey="lt-atas"');
    const scale = summary?.pxPerMetre ?? 0;
    expect(scale % 10).toBe(0);
    expect(summary?.cellTilePx).toEqual([0.4 * scale, 0.2 * scale]);
    expect(summary?.theiaLayoutPx).toBe(Math.round((0.95 * (summary?.pxPerMetre ?? 0)) / 2));
    const layout: unknown = JSON.parse(readFileSync(join(root, 'out', 'layout.json'), 'utf8'));
    expect(checkHouseLayout(houseLayout.parse(layout))).toEqual([]);
  });

  it('writes a props file per furnished storey, with the storeys below it', () => {
    const kasur = { id: 'kasur', area: 'kamar-tidur', rect: [-2.4, -3.4, 1.6, 2], height: 0.4 };
    write({ ...planInput(), furniture: [kasur] });
    const { summary } = runBlockout(root, 'plan.json', 'out');
    expect(summary?.files).toContain('out/house-blockout-props-lt-atas.svg');
    expect(summary?.files).not.toContain('out/house-blockout-props-lt-dasar.svg');
    const svg = readFileSync(join(root, 'out', 'house-blockout-props-lt-atas.svg'), 'utf8');
    expect(svg).toContain('data-owner="kamar-tidur.kasur"');
    expect(svg).toContain('data-storey="lt-dasar"');
  });

  it('accepts absolute paths and reports them relative to root', () => {
    write(planInput());
    const { summary } = runBlockout(root, join(root, 'plan.json'), join(root, 'out'));
    expect(summary?.files[0]).toBe('out/house-blockout.svg');
  });

  it('stops on a plan that does not parse or check, writing nothing', () => {
    writeFileSync(join(root, 'plan.json'), '{');
    expect(runBlockout(root, 'plan.json', 'out').report.issues[0]?.message).toMatch(
      /not valid JSON/,
    );
    write({ ...planInput(), start: 'garasi' });
    expect(runBlockout(root, 'plan.json', 'out').report.issues[0]?.path).toBe('start');
    write({ ...planInput(), doors: [{ area: 'garasi', wall: 'x0', at: 0, width: 1 }] });
    const result = runBlockout(root, 'plan.json', 'out');
    expect(result.summary).toBeUndefined();
    expect(result.report.issues[0]).toMatchObject({ severity: 'error', file: 'plan.json' });
    expect(existsSync(join(root, 'out'))).toBe(false);
  });

  it('still writes a draft that breaks the layout contract, and reports it', () => {
    write({ ...planInput(), edges: [['ruang-keluarga', 'tangga-bawah']] });
    const { report, summary } = runBlockout(root, 'plan.json', 'out');
    expect(summary).toBeDefined();
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        file: 'out/layout.json',
        message: 'kamar-tidur is not reachable from ruang-keluarga',
      }),
    );
  });
});

/** A TV rack against the living room's y0 wall, the TV hung above it, and a pot in the garden. */
const FURNITURE = [
  { id: 'rak-tv', area: 'ruang-keluarga', rect: [2.4, 0, 1.2, 0.4], height: 0.8 },
  { id: 'tv', area: 'ruang-keluarga', rect: [2.6, 0, 0.8, 0.2], height: 0.6, lift: 1 },
  { id: 'pot', area: 'kebun', rect: [4.4, 0.4, 0.4, 0.4], height: 0.6 },
];

describe('US-REF-02 furniture', () => {
  const furnished = (): FloorPlan => plan({ furniture: FURNITURE });

  it('passes a consistent plan and defaults to no furniture', () => {
    expect(plan().furniture).toEqual([]);
    expect(furnished().furniture[0]?.lift).toBe(0);
    expect(checkPlan(furnished())).toEqual([]);
  });

  it('reports pieces off the grid, outside their area, too tall, overlapping or doubled', () => {
    const [rak, tv, pot] = FURNITURE;
    const messages = checkPlan(
      plan({
        furniture: [
          rak,
          tv,
          pot,
          { ...rak, id: 'rak-2', rect: [3, 0.2, 0.4, 0.4] },
          { ...pot, rect: [5.8, 0, 0.4, 0.4] },
          { ...tv, id: 'lampu', lift: 2, height: 0.6 },
          { ...pot, id: 'meja', rect: [4.45, 1, 0.4, 0.4] },
          { ...pot, area: 'garasi' },
        ],
      }),
    ).map((i) => `${i.path}: ${i.message}`);
    expect(messages).toEqual([
      'furniture[6].rect: x 4.45 is off the 20 cm grid; nearest 4.4',
      'furniture[6].rect: x + width 4.85 is off the 20 cm grid; nearest 4.8',
      'furniture: duplicate piece kebun.pot',
      'furniture[3]: overlaps ruang-keluarga.rak-tv',
      'furniture[4].rect: leaves area kebun',
      'furniture[5]: is taller than the walls of ruang-keluarga',
      'furniture[7].area: unknown area garasi',
    ]);
  });

  it('builds a box per piece that stands on its floor or hangs at its lift', () => {
    const props = buildSolids(furnished()).filter((s) => s.kind === 'prop');
    expect(props.map((s) => [s.owner, s.storey, s.outdoor])).toEqual([
      ['ruang-keluarga.rak-tv', 0, false],
      ['ruang-keluarga.tv', 0, false],
      ['kebun.pot', 0, true],
    ]);
    expect(props[1]?.box).toMatchObject({ z0: 1, z1: 1.6 });
    // The garden sits 0.2 m low, and its pot with it.
    expect(props[2]?.box.z0).toBeCloseTo(-0.2);
    expect(props[2]?.box.z1).toBeCloseTo(0.4);
    const [piece] = props;
    if (!piece) throw new Error('no props');
    expect(facesOf(piece).map((f) => f.kind)).toEqual(['prop', 'prop-x', 'prop-y']);
    expect(gridLinesOf(piece, 0.2)).toEqual([]);
  });

  it('draws furniture after the floor and wall it stands against', () => {
    const order = drawOrder(buildSolids(furnished()));
    const rak = rank(order, 'ruang-keluarga.rak-tv', 'prop');
    expect(rank(order, 'ruang-keluarga', 'slab')).toBeLessThan(rak);
    expect(rank(order, 'ruang-keluarga', 'wall-y0')).toBeLessThan(rak);
  });

  it('refuses a piece whose area is missing', () => {
    const p = furnished();
    p.furniture.push({ id: 'meja', area: 'garasi', rect: [0, 0, 1, 1], height: 1, lift: 0 });
    expect(() => buildSolids(p)).toThrow('furniture[3]: unknown area garasi');
    const solids = buildSolids(furnished());
    const fit = { scale: 100, origin: [1900, 800] as [number, number] };
    expect(() => draftLayout(p, fit, solids)).toThrow('furniture[3]: unknown area garasi');
  });

  it('drafts a prop per piece: key, storey, room, sprite rect and footprint', () => {
    const { fit, draft } = drafted(furnished());
    expect(checkHouseLayout(houseLayout.parse(draft.layout))).toEqual([]);
    const [rak, tv, pot] = draft.layout.props as [HouseProp, HouseProp, HouseProp];
    expect(rak).toMatchObject({ key: 'house.props.ruang-keluarga.rak-tv', storey: 0 });
    expect(rak.room).toBe('ruang-keluarga');
    // Outside every room: nothing to dim while a room is locked.
    expect(pot.key).toBe('house.props.kebun.pot');
    expect(pot).not.toHaveProperty('room');
    const half = (p: Vec3): [number, number] => {
      const [x, y] = project(p, fit);
      return [Math.round(x / 2), Math.round(y / 2)];
    };
    // Back corner first, then clockwise on screen: right, front, left.
    expect(rak.base).toEqual([
      half({ x: 2.4, y: 0, z: 0 }),
      half({ x: 3.6, y: 0, z: 0 }),
      half({ x: 3.6, y: 0.4, z: 0 }),
      half({ x: 2.4, y: 0.4, z: 0 }),
    ]);
    // The top's back corner is the sprite's top edge; the floor's front corner its bottom.
    expect(rak.rect[1]).toBe(half({ x: 2.4, y: 0, z: 0.8 })[1]);
    expect(rak.rect[1] + rak.rect[3]).toBe(half({ x: 3.6, y: 0.4, z: 0 })[1]);
    // A hung piece's footprint is its underside, so its sprite stays trimmed to the box.
    expect(tv.base[0]).toEqual(half({ x: 2.6, y: 0, z: 1 }));
    expect(tv.rect[1] + tv.rect[3]).toBe(half({ x: 3.4, y: 0.2, z: 1 })[1]);
  });

  it('lets characters stand behind furniture, but not behind the house', () => {
    // A sofa across the walk, between the stand and the camera.
    const sofa = { id: 'sofa', area: 'ruang-keluarga', rect: [0.4, 1.8, 3.6, 1], height: 0.8 };
    const { draft } = drafted(plan({ furniture: [sofa] }));
    const paths = draft.issues.map((i) => i.path);
    expect(paths).not.toContain('rooms[0].walk');
    expect(draft.issues).toContainEqual(
      expect.objectContaining({
        path: 'rooms[0].stand',
        message: 'hidden behind ruang-keluarga.sofa',
      }),
    );
  });

  it('warns when a sprite would pass the manifest size limit', () => {
    const lemari = { id: 'lemari', area: 'ruang-keluarga', rect: [0, 0, 2.4, 0.6], height: 1.2 };
    const p = plan({ furniture: [lemari] });
    const solids = buildSolids(p);
    const sized = (scale: number) =>
      draftLayout(p, { scale, origin: [1900, 800] }, solids).issues.filter(
        (i) => i.path === 'furniture.ruang-keluarga.lemari',
      );
    // 3 m of x + y across, 1.5 m of floor diagonal plus 1.2 m tall: 1200 × 1080 px at 400 px/m.
    expect(sized(400)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: 'the sprite would be 1200 × 1080 px, over the 1024 px limit: split it',
      }),
    ]);
    expect(sized(300)).toEqual([]);
  });

  it('outlines each footprint and names each piece in the guide', () => {
    const { solids, fit, draft } = drafted(furnished());
    const svg = guideSvg({
      solids,
      fit,
      grid: 0.2,
      size: CANVAS,
      layout: draft.layout,
      hidden: [],
      stands: draft.stands,
    });
    expect(svg).toContain('<g id="guide-props"');
    expect(svg.match(/stroke="#6d4c2f"/g)).toHaveLength(3);
    for (const name of ['ruang-keluarga.rak-tv', 'ruang-keluarga.tv', 'kebun.pot']) {
      expect(svg).toContain(`>${name}</text>`);
    }
    expect(blockoutSvg(solids, fit, CANVAS)).toContain('data-kind="prop-x"');
  });
});

describe('US-REF-02 closed understairs', () => {
  it('lets a flight reach down to the floor and a landing slab fill the space under it', () => {
    const input = planInput();
    const landing = { id: 'bordes', storey: 0, z: 0.6, slab: 0.6, rect: [6, 0, 1, 1] };
    const p = plan({
      areas: [...(input.areas as object[]), landing],
      stairs: [flight({ from: 0.6, to: 1.2, base: 0 })],
    });
    expect(checkPlan(p)).toEqual([]);
    const solids = buildSolids(p);
    expect(solids.filter((s) => s.kind === 'step').map((s) => s.box.z0)).toEqual([0, 0]);
    expect(solids.find((s) => s.owner === 'bordes')?.box).toMatchObject({ z0: 0, z1: 0.6 });
    // Without a base, the flight's mass starts at its lower end.
    const floating = buildSolids(plan({ stairs: [flight({ from: 0.6, to: 1.2 })] }));
    expect(floating.filter((s) => s.kind === 'step').map((s) => s.box.z0)).toEqual([0.6, 0.6]);
  });

  it('refuses a base above the flight', () => {
    const messages = checkPlan(plan({ stairs: [flight({ base: 0.4 })] })).map(
      (i) => `${i.path}: ${i.message}`,
    );
    expect(messages).toEqual(['stairs[0].base: the mass under a flight starts at or below from']);
  });
});
