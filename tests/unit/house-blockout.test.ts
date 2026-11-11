import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkHouseLayout, houseLayout } from '../../contracts/houseLayout';
import { toScreen } from '../../src/engine/iso/projection';
import { convexHull, fitToCanvas, project, type Vec3 } from '../../tools/house/iso';
import { CANVAS, draftLayout, focusRect } from '../../tools/house/layout';
import { checkPlan, defaultWalk, floorPlan, type FloorPlan } from '../../tools/house/plan';
import { runBlockout } from '../../tools/house/run';
import { buildFaces, buildOccluders, sortFaces, stepsOf } from '../../tools/house/scene';
import { blockoutSvg, guideSvg } from '../../tools/house/svg';
import { hiddenBy, hiddenFloor } from '../../tools/house/visibility';

/** A made-up two-storey house; the real plan stays in reference/ (AGENTS.md privacy rules). */
function planInput(): Record<string, unknown> {
  return {
    areas: [
      { id: 'ruang-keluarga', storey: 0, rect: [0, 0, 4, 3], walls: ['x0', 'y0'] },
      { id: 'kamar-tidur', storey: 2, rect: [-3.4, -3.4, 3, 3], walls: ['x0', 'y0'] },
      { id: 'kebun', storey: 0, z: -0.2, rect: [4, 0, 2, 3], outdoor: true },
    ],
    doors: [{ area: 'ruang-keluarga', wall: 'x0', at: 1, width: 0.9 }],
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
        at: 0.5,
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
  const faces = buildFaces(p);
  const fit = fitToCanvas(
    faces.flatMap((f) => f.points),
    CANVAS,
    p.marginPx,
  );
  return { faces, fit, draft: draftLayout(p, fit, buildOccluders(p)) };
}

describe('projection', () => {
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

describe('floor plan', () => {
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
    const p = plan({
      areas: [...(input.areas as object[]), { id: 'kebun', storey: 0, rect: [0, 0, 1, 1] }],
      doors: [
        { area: 'garasi', wall: 'x0', at: 0, width: 1 },
        { area: 'ruang-keluarga', wall: 'y0', at: 3.5, width: 1 },
        { area: 'kebun', wall: 'x0', at: 0, width: 0.8, height: 3 },
      ],
      stairs: [
        { id: 'datar', storey: 0, rect: [0, 0, 1, 1], rise: '+x', from: 1, to: 1, steps: 2 },
      ],
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
    const messages = checkPlan(p).map((i) => `${i.path}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'areas: duplicate area kebun',
        'rooms[0].walk: walk leaves area ruang-keluarga',
        'rooms[0].stand: must lie inside the walk',
        'rooms[1].area: unknown area loteng',
        'doors[0].area: unknown area garasi',
        'doors[1]: runs past the end of the y0 wall of ruang-keluarga',
        'doors[2].wall: kebun has no x0 wall',
        'doors[2]: is taller than the x0 wall of kebun',
        'stairs[0]: a flight must climb: from equals to',
        'spots.sticker-wall.room: kamar-tidur is not in rooms',
      ]),
    );
  });

  it('reports duplicate rooms, stairs and shared floors', () => {
    const input = planInput();
    const [living] = input.rooms as object[];
    const flight = {
      id: 'tangga',
      storey: 0,
      rect: [0, 0, 1, 1],
      rise: '+x',
      from: 0,
      to: 1,
      steps: 2,
    };
    const messages = checkPlan(plan({ rooms: [living, living], stairs: [flight, flight] })).map(
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

describe('scene', () => {
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

  it('draws floors, back walls, doors and steps in painter order', () => {
    const flight = {
      id: 'tangga',
      storey: 0,
      rect: [4, 0, 1, 1],
      rise: '+x',
      from: 0,
      to: 1,
      steps: 2,
    };
    const faces = sortFaces(buildFaces(plan({ stairs: [flight] })));
    const kinds = faces.map((f) => `${f.storey}:${f.layer}:${f.kind}`);
    expect(kinds.filter((k) => k.endsWith(':door'))).toEqual(['0:doors:door']);
    expect(kinds.filter((k) => k.includes(':stairs:'))).toHaveLength(6);
    expect(kinds.indexOf('0:walls:wall-x0')).toBeGreaterThan(kinds.lastIndexOf('0:floors:floor'));
    expect(kinds.at(-1)).toMatch(/^2:/);
    // A storey draws back to front.
    const floors = faces.filter((f) => f.storey === 0 && f.kind === 'floor').map((f) => f.owner);
    expect(floors).toEqual(['ruang-keluarga', 'kebun']);
  });
});

describe('visibility', () => {
  const occluders = buildOccluders(
    plan({
      areas: [
        ...(planInput().areas as object[]),
        { id: 'balkon', storey: 2, rect: [3.5, 3.5, 1, 1] },
      ],
    }),
  );

  it('hides floor behind a higher slab along the camera ray', () => {
    // (0.5, 0.5, 0) lands on the same pixel as (3.9, 3.9, 3.4), on the balcony.
    expect(hiddenBy({ x: 0.5, y: 0.5, z: 0 }, occluders)?.owner).toBe('balkon');
    expect(hiddenBy({ x: 2, y: 2, z: 0 }, occluders)).toBeUndefined();
  });

  it('hides what stands behind a back wall, never the wall’s own room', () => {
    // The bedroom's x0 wall stands at x = -3.4, y -3.4 to -0.4, z 3.4 to 5.8.
    expect(hiddenBy({ x: -4, y: -2, z: 3 }, occluders)?.owner).toBe('kamar-tidur');
    expect(hiddenBy({ x: -3.3, y: -2, z: 3.4 }, occluders)).toBeUndefined();
  });

  it('hides floor behind a flight of stairs', () => {
    const flight = {
      id: 'tangga',
      storey: 0,
      rect: [4, 0, 1, 1],
      rise: '+x',
      from: 0,
      to: 1,
      steps: 2,
    };
    const withStairs = buildOccluders(plan({ stairs: [flight] }));
    // (3.8, 0.2, 0) lands on (4.3, 0.7, 0.5): inside the first step, whose tread is at 0.5.
    expect(hiddenBy({ x: 3.8, y: 0.2, z: 0 }, withStairs)?.owner).toBe('tangga');
  });

  it('measures the hidden share of a floor', () => {
    const hidden = hiddenFloor([0, 0, 4, 3], 0, occluders);
    expect(hidden.fraction).toBeGreaterThan(0);
    expect(hidden.fraction).toBeLessThan(0.2);
    expect(hidden.by).toEqual(['balkon']);
    expect(hiddenFloor([2, 2, 1, 1], 0, occluders).points).toEqual([]);
  });
});

describe('draft layout', () => {
  it('passes the house layout contract', () => {
    const { draft } = drafted();
    const parsed = houseLayout.parse(draft.layout);
    expect(checkHouseLayout(parsed)).toEqual([]);
    expect(draft.issues).toEqual([]);
    expect(draft.layout.rooms.map((r) => r.storey)).toEqual([0, 2]);
    expect(draft.layout.occluders).toEqual([]);
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
  });
});

describe('svg', () => {
  it('draws the clean blockout without text, one group per storey and layer', () => {
    const { faces, fit } = drafted();
    const svg = blockoutSvg(faces, fit, CANVAS);
    expect(svg).toContain('width="3840" height="2400"');
    expect(svg).not.toContain('<text');
    for (const id of [
      'lt-dasar',
      'lt-dasar-floors',
      'lt-dasar-walls',
      'lt-dasar-doors',
      'lt-atas',
    ]) {
      expect(svg).toContain(`<g id="${id}">`);
    }
    expect(svg).not.toContain('mezzanine-1');
  });

  it('adds the layout, labels and scale to the guide', () => {
    const { faces, fit, draft } = drafted();
    const svg = guideSvg({
      faces,
      fit,
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
  });
});

describe('runBlockout', () => {
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
    write(planInput());
    const { report, summary } = runBlockout(root, 'plan.json', 'out');
    expect(report.issues).toEqual([]);
    expect(summary?.files).toEqual([
      'out/house-blockout.svg',
      'out/house-blockout-guide.svg',
      'out/layout.json',
    ]);
    expect(summary?.theiaLayoutPx).toBe(Math.round((0.95 * (summary?.pxPerMetre ?? 0)) / 2));
    const layout: unknown = JSON.parse(readFileSync(join(root, 'out', 'layout.json'), 'utf8'));
    expect(checkHouseLayout(houseLayout.parse(layout))).toEqual([]);
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
