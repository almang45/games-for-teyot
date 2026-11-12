import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  cameraOf,
  castRay,
  eyeFile,
  eyeLabels,
  eyeSvg,
  faceKindOf,
  lineAt,
  projectTo,
  rayAt,
  renderEye,
  shade,
  type Hit,
  type V3,
} from '../../tools/house/eye';
import { checkPlan, floorPlan, type FloorPlan, type PlanView } from '../../tools/house/plan';
import { encodePng } from '../../tools/house/png';
import { runBlockout } from '../../tools/house/run';
import { buildSolids, type Solid } from '../../tools/house/scene';

/** One made-up room with a door, a TV rack and a TV on the wall above it. */
function planInput(): Record<string, unknown> {
  return {
    areas: [
      { id: 'ruang', storey: 0, rect: [0, 0, 4, 3], walls: ['x0', 'y0'] },
      { id: 'kebun', storey: 0, z: -0.2, rect: [4, 0, 2, 3], outdoor: true },
    ],
    doors: [{ area: 'ruang', wall: 'x0', at: 1, width: 0.8 }],
    rooms: [
      {
        id: 'ruang-keluarga',
        area: 'ruang',
        activities: ['coloring'],
        stand: [2, 1.5],
        parking: { bubu: [1.5, 2], ocica: [2.5, 2] },
      },
    ],
    spots: {
      fridge: { room: 'ruang-keluarga', wall: 'y0', at: 0.4, width: 0.6, bottom: 0.8, height: 0.8 },
      'sticker-wall': {
        room: 'ruang-keluarga',
        wall: 'x0',
        at: 2,
        width: 0.6,
        bottom: 0.4,
        height: 0.6,
      },
    },
    furniture: [
      { id: 'rak-tv', area: 'ruang', rect: [2.4, 0, 1.2, 0.4], height: 0.8 },
      { id: 'tv', area: 'ruang', rect: [2.6, 0, 0.8, 0.2], height: 0.6, lift: 1 },
    ],
    start: 'ruang-keluarga',
  };
}

const SOFA: PlanView = {
  id: 'sofa',
  area: 'ruang',
  eye: [3, 2.6, 1.1],
  look: [3, 0, 1.1],
  fov: 70,
  size: [64, 40],
};

const plan = (patch: Record<string, unknown> = {}): FloorPlan =>
  floorPlan.parse({ ...planInput(), views: [SOFA], ...patch });

const hitOf = (p: FloorPlan, o: V3, d: V3): Hit => {
  const h = castRay(buildSolids(p), o, d);
  if (!h) throw new Error('expected a hit');
  return h;
};

const prop = (owner: string, [x0, y0, z0]: V3, [x1, y1, z1]: V3): Solid => ({
  kind: 'prop',
  owner,
  storey: 0,
  outdoor: false,
  box: { x0, x1, y0, y1, z0, z1 },
  openings: [],
});

describe('US-REF-02 eye views: plan checks', () => {
  it('accepts a view and fills its defaults', () => {
    const p = floorPlan.parse({
      ...planInput(),
      views: [{ id: 'sofa', area: 'ruang', eye: [3, 2.6, 1.1], look: [3, 0, 1] }],
    });
    expect(checkPlan(p)).toEqual([]);
    expect(p.views[0]).toMatchObject({ fov: 70, size: [1600, 1000] });
  });

  it('refuses views it cannot place', () => {
    const view = (patch: Partial<PlanView>): PlanView => ({ ...SOFA, ...patch });
    const messages = checkPlan(
      plan({
        views: [
          SOFA,
          view({ area: 'loteng' }),
          view({ id: 'luar', eye: [5, 1, 1.1] }),
          view({ id: 'atas', look: [3, 2.6, 3] }),
          view({ id: 'rak', eye: [3, 0.2, 0.5] }),
          SOFA,
        ],
      }),
    ).map((i) => `${i.path}: ${i.message}`);
    expect(messages).toEqual([
      'views: duplicate view sofa',
      'views[1].area: unknown area loteng',
      'views[2].eye: stands outside area ruang',
      'views[3].look: looks straight up or down: move it away from the eye',
      'views[4].eye: is inside ruang.rak-tv',
    ]);
  });

  it('refuses a field of view or image size out of range', () => {
    const parse = (patch: Partial<PlanView>) =>
      floorPlan.safeParse({ ...planInput(), views: [{ ...SOFA, ...patch }] }).success;
    expect(parse({ fov: 10 })).toBe(false);
    expect(parse({ fov: 150 })).toBe(false);
    expect(parse({ size: [8, 8] })).toBe(false);
    expect(parse({ size: [5000, 1000] })).toBe(false);
    expect(parse({ eye: [3, 2.6, 0] })).toBe(false);
  });
});

describe('US-REF-02 eye views: ray casting', () => {
  const p = plan();

  it('finds the first face ahead and the colour it shows', () => {
    const wall = hitOf(p, [1, 2, 1.5], [0, -1, 0]);
    expect(wall).toMatchObject({ t: 2, axis: 1, side: 1 });
    expect(wall.solid.owner).toBe('ruang');
    expect(faceKindOf(wall)).toBe('wall-y0');
    expect(faceKindOf(hitOf(p, [2, 1.4, 1], [-1, 0, 0]))).toBe('door');
    expect(faceKindOf(hitOf(p, [1, 2, 1], [0, 0, -1]))).toBe('floor');
    expect(faceKindOf(hitOf(p, [5, 1, -0.1], [-1, 0, 0]))).toBe('slab-x');
    expect(faceKindOf(hitOf(p, [1, 3.5, -0.1], [0, -1, 0]))).toBe('slab-y');
    // A slab seen from below is a ceiling.
    expect(faceKindOf(hitOf(p, [1, 1, -1], [0, 0, 1]))).toBe('wall-y0');
  });

  it('shows furniture by its faces', () => {
    const rack = hitOf(p, [3, 2, 0.4], [0, -1, 0]);
    expect(rack.solid.owner).toBe('ruang.rak-tv');
    expect(faceKindOf(rack)).toBe('prop-y');
    expect(faceKindOf(hitOf(p, [3, 0.1, 2], [0, 0, -1]))).toBe('prop');
    expect(faceKindOf(hitOf(p, [2, 0.2, 0.4], [1, 0, 0]))).toBe('prop-x');
  });

  it('misses open sky and never sees a box around its own origin', () => {
    expect(castRay(buildSolids(p), [1, 2, 1], [0, 0, 1])).toBeUndefined();
    // From inside the rack, looking out through the open front.
    expect(castRay(buildSolids(p), [3, 0.3, 0.4], [0, 1, 0])).toBeUndefined();
  });

  it('draws box edges, door jambs and grid lines, but no grid on furniture or doors', () => {
    const w = 0.02;
    const line = (o: V3, d: V3): string | undefined => {
      const h = hitOf(p, o, d);
      return lineAt(h, faceKindOf(h), w, p.grid);
    };
    expect(line([1, 1.5, 1], [0, 0, -1])).toBe('major');
    expect(line([1.2, 1.5, 1], [0, 0, -1])).toBe('minor');
    expect(line([1.1, 1.5, 1], [0, 0, -1])).toBeUndefined();
    expect(line([0.01, 1.5, 1], [0, 0, -1])).toBe('edge');
    expect(line([1, 1.0, 1.1], [-1, 0, 0])).toBe('edge');
    expect(line([1, 1.5, 2.1], [-1, 0, 0])).toBe('edge');
    expect(line([1, 1.5, 1.1], [-1, 0, 0])).toBeUndefined();
    expect(line([3.1, 2, 0.5], [0, -1, 0])).toBeUndefined();
  });
});

describe('US-REF-02 eye views: camera and image', () => {
  const p = plan();
  const cam = cameraOf(p, SOFA);

  it('aims from the eye, above the floor of its area, at the look point', () => {
    expect(cam.eye).toEqual([3, 2.6, 1.1]);
    expect(cam.forward[1]).toBeCloseTo(-1);
    const [cx, cy, cz] = rayAt(cam, 31.5, 19.5);
    expect([cx, cy, cz].map((c) => Math.round(c * 1e6) / 1e6)).toEqual(
      cam.forward.map((c) => Math.round(c * 1e6) / 1e6),
    );
    const [x, y] = projectTo(cam, [3, 0, 1.1]) ?? [NaN, NaN];
    expect(x).toBeCloseTo(32);
    expect(y).toBeCloseTo(20);
    expect(projectTo(cam, [3, 2.9, 1.1])).toBeUndefined();
    expect(() => cameraOf(p, { ...SOFA, area: 'loteng' })).toThrow(/run checkPlan first/);
  });

  it('shades a wall in its blockout colour and empty space white', () => {
    const solids = buildSolids(plan({ furniture: [] }));
    expect(
      shade(
        solids,
        cameraOf(p, { ...SOFA, eye: [2.1, 2.6, 1.1], look: [2.1, 0, 1.1] }),
        0.2,
        31.5,
        19.5,
      ),
    ).toEqual([0xd2, 0xcb, 0xbf]);
    const out = cameraOf(p, { ...SOFA, eye: [2.1, 0.5, 1.1], look: [2.1, 3, 1.1] });
    expect(shade(solids, out, 0.2, 31.5, 19.5)).toEqual([255, 255, 255]);
    expect(renderEye(solids, out, 0.2)).toHaveLength(64 * 40 * 3);
  });

  it('labels the furniture the eye can see, by its id', () => {
    expect(eyeLabels(buildSolids(p), cam).map((l) => l.text)).toEqual(['rak-tv', 'tv']);
    const solids = [
      prop('a.depan', [1.5, 1, 0], [2.5, 1.4, 2]),
      prop('a.belakang', [1.8, 0.2, 0], [2.2, 0.6, 1]),
      prop('a.samping', [2.8, 1, 0], [3.2, 1.4, 0.5]),
      prop('a.di-punggung', [1.8, 2.9, 0], [2.2, 3, 1]),
    ];
    const from = cameraOf(p, { ...SOFA, eye: [2, 2.8, 1], look: [2, 0, 1] });
    const labels = eyeLabels(solids, from);
    expect(labels.map((l) => l.text)).toEqual(['depan', 'samping']);
    labels.forEach(({ at: [x, y] }) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(40);
    });
  });

  it('writes the render as an embedded PNG with SVG labels', () => {
    const svg = eyeSvg(buildSolids(p), p, SOFA);
    expect(svg).toContain('width="64" height="40" viewBox="0 0 64 40"');
    expect(svg.match(/<text /g)).toHaveLength(2);
    const data = /href="data:image\/png;base64,([^"]+)"/.exec(svg)?.[1] ?? '';
    const png = Buffer.from(data, 'base64');
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 40]);
    expect(eyeFile('sofa')).toBe('house-eye-sofa.svg');
  });
});

describe('US-REF-02 eye views: PNG encoder', () => {
  it('stores each row unfiltered and refuses the wrong byte count', () => {
    const rgb = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]);
    const png = encodePng(2, 2, rgb);
    const idatLength = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString('ascii')).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    expect([...raw]).toEqual([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 9, 9, 9]);
    expect(png.subarray(-8, -4).toString('ascii')).toBe('IEND');
    expect(() => encodePng(2, 2, rgb.subarray(3))).toThrow('png: 2 × 2 needs 12 bytes, got 9');
  });
});

describe('US-REF-02 eye views: runBlockout', () => {
  it('writes one house-eye file per view', () => {
    const root = mkdtempSync(join(tmpdir(), 'rct-eye-'));
    try {
      writeFileSync(join(root, 'plan.json'), JSON.stringify({ ...planInput(), views: [SOFA] }));
      const { report, summary } = runBlockout(root, 'plan.json', 'out');
      expect(report.issues).toEqual([]);
      expect(summary?.files.at(-1)).toBe('out/house-eye-sofa.svg');
      expect(readFileSync(join(root, 'out', 'house-eye-sofa.svg'), 'utf8')).toContain('>tv</text>');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
