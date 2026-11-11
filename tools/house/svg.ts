import type { Point } from '../../contracts/common.ts';
import type { HouseLayout } from '../../contracts/houseLayout.ts';
import { STOREYS } from '../../contracts/rooms.ts';
import { project, type Fit, type Vec3 } from './iso.ts';
import type { HiddenFloor } from './layout.ts';
import { LAYERS, sortFaces, type Face, type FaceKind } from './scene.ts';

/** Neutral greys, lighter facing up and toward +x: Antigravity paints over them (ASSETS.md §4.1). */
const FILL: Record<FaceKind, readonly [indoor: string, outdoor: string]> = {
  floor: ['#ddd6ca', '#cdd5c0'],
  'slab-x': ['#b9b1a4', '#a9b29c'],
  'slab-y': ['#a69e91', '#97a08b'],
  'wall-x0': ['#e8e2d8', '#e8e2d8'],
  'wall-y0': ['#d2cbbf', '#d2cbbf'],
  door: ['#6f685d', '#6f685d'],
  step: ['#efe9df', '#efe9df'],
  'step-x': ['#c7bfb2', '#c7bfb2'],
  'step-y': ['#b3ab9e', '#b3ab9e'],
};
const STROKE = '#4b463e';

/** A 3-year-old is about this tall; the guide draws her at each stand to judge sprite scale. */
export const THEIA_HEIGHT_M = 0.95;

const num = (v: number): string => String(Math.round(v * 10) / 10);
const pts = (points: readonly Point[]): string =>
  points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
const esc = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function faceElement(f: Face, fit: Fit): string {
  const fill = FILL[f.kind][f.outdoor ? 1 : 0];
  const points = pts(f.points.map((p) => project(p, fit)));
  return `<polygon data-owner="${esc(f.owner)}" data-kind="${f.kind}" points="${points}" fill="${fill}"/>`;
}

/** The faces in painter's order, one group per storey and one sub-group per layer. */
function structure(faces: readonly Face[], fit: Fit): string[] {
  const sorted = sortFaces(faces);
  return STOREYS.flatMap((s) => {
    const own = sorted.filter((f) => f.storey === s.id);
    if (own.length === 0) return [];
    const layers = LAYERS.flatMap((layer) => {
      const items = own.filter((f) => f.layer === layer);
      if (items.length === 0) return [];
      return [
        `<g id="${s.name}-${layer}">`,
        ...items.map((f) => `  ${faceElement(f, fit)}`),
        '</g>',
      ];
    });
    return [`<g id="${s.name}">`, ...layers.map((l) => `  ${l}`), '</g>'];
  });
}

const open = (size: readonly [number, number]): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}" ` +
  `viewBox="0 0 ${size[0]} ${size[1]}">`;

const groupAttrs =
  `stroke="${STROKE}" stroke-width="2" stroke-linejoin="round" ` + 'fill-rule="nonzero"';

/** The clean blockout: geometry only, no text (AGENTS.md: no text in images). */
export function blockoutSvg(
  faces: readonly Face[],
  fit: Fit,
  size: readonly [number, number],
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    open(size),
    `<g id="structure" ${groupAttrs}>`,
    ...structure(faces, fit),
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

const canvas = ([x, y]: Point): Point => [x * 2, y * 2];

function label(text: string, [x, y]: Point, size: number, anchor = 'middle'): string {
  return (
    `<text x="${num(x)}" y="${num(y)}" font-size="${size}" text-anchor="${anchor}" ` +
    `stroke="#ffffff" stroke-width="${size / 6}" paint-order="stroke">${esc(text)}</text>`
  );
}

/** A 1 m bar along the screen x axis: one plan metre along x or y spans `scale` px across. */
function scaleBar(fit: Fit): string[] {
  const [x, y] = [80, 80];
  const text = `1 m = ${fit.scale} px (layout ${fit.scale / 2} px)`;
  return [
    `<line x1="${x}" y1="${y}" x2="${x + fit.scale}" y2="${y}" stroke="#1b1b1b" stroke-width="6"/>`,
    label(text, [x, y + 50], 36, 'start'),
  ];
}

export interface GuideInput {
  readonly faces: readonly Face[];
  readonly fit: Fit;
  readonly size: readonly [number, number];
  readonly layout: HouseLayout;
  readonly hidden: readonly HiddenFloor[];
  /** Plan positions of each room's stand, for Theia's height marker. */
  readonly stands: readonly Vec3[];
}

/** The blockout plus what layout.json says: tap areas, walk floors, the graph, labels. Never shipped. */
export function guideSvg(g: GuideInput): string {
  const { layout, fit } = g;
  const nodes = new Map<string, Point>([
    ...layout.rooms.map((r): [string, Point] => [r.id, r.stand]),
    ...layout.waypoints.map((w): [string, Point] => [w.id, w.pos]),
  ]);
  const rooms = layout.rooms.flatMap((r) => {
    const [fx, fy, fw, fh] = r.focus;
    return [
      `<polygon points="${pts(r.polygon.map(canvas))}" fill="none" stroke="#e07a1f" stroke-width="4" stroke-dasharray="16 10"/>`,
      `<polygon points="${pts(r.walk.map(canvas))}" fill="#2f6fd6" fill-opacity="0.18" stroke="#2f6fd6" stroke-width="4"/>`,
      `<rect x="${fx * 2}" y="${fy * 2}" width="${fw * 2}" height="${fh * 2}" fill="none" stroke="#2a9d58" stroke-width="3" stroke-dasharray="6 8"/>`,
      `<circle cx="${r.parking.bubu[0] * 2}" cy="${r.parking.bubu[1] * 2}" r="12" fill="#f2a900"/>`,
      `<circle cx="${r.parking.ocica[0] * 2}" cy="${r.parking.ocica[1] * 2}" r="12" fill="#7cb342"/>`,
    ];
  });
  const theia = g.stands.map((p) => {
    const [x1, y1] = project(p, fit);
    const [, y2] = project({ ...p, z: p.z + THEIA_HEIGHT_M }, fit);
    return `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x1)}" y2="${num(y2)}" stroke="#2f6fd6" stroke-width="10" stroke-linecap="round"/>`;
  });
  const hidden = g.hidden.flatMap((h) =>
    h.points.map((p) => {
      const [x, y] = project(p, fit);
      return `<rect x="${num(x - 3)}" y="${num(y - 3)}" width="6" height="6" fill="#d62f2f"/>`;
    }),
  );
  const edges = layout.edges.flatMap(([a, b]) => {
    const pa = nodes.get(a);
    const pb = nodes.get(b);
    if (!pa || !pb) return [];
    const [x1, y1] = canvas(pa);
    const [x2, y2] = canvas(pb);
    return [
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c2185b" stroke-width="4"/>`,
    ];
  });
  const spots = Object.values(layout.spots).map(
    ({ rect: [x, y, w, h] }) =>
      `<rect x="${x * 2}" y="${y * 2}" width="${w * 2}" height="${h * 2}" fill="#8e44ad" fill-opacity="0.3" stroke="#8e44ad" stroke-width="4"/>`,
  );
  const labels = [
    ...layout.rooms.map((r) => label(r.id, canvas([r.stand[0], r.stand[1] + 30]), 40)),
    ...layout.waypoints.map((w) => {
      const [x, y] = canvas(w.pos);
      return `<circle cx="${x}" cy="${y}" r="9" fill="#c2185b"/>\n${label(w.id, [x, y - 18], 24)}`;
    }),
  ];
  const group = (id: string, items: readonly string[]): string[] => [
    `<g id="${id}">`,
    ...items.map((i) => `  ${i}`),
    '</g>',
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    open(g.size),
    `<g id="structure" ${groupAttrs}>`,
    ...structure(g.faces, fit),
    '</g>',
    ...group('guide-rooms', rooms),
    ...group('guide-hidden', hidden),
    ...group('guide-spots', spots),
    ...group('guide-edges', edges),
    ...group('guide-theia', theia),
    `<g id="guide-labels" font-family="sans-serif" fill="#1b1b1b">`,
    ...[...labels, ...scaleBar(fit)].map((l) => `  ${l}`),
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}
