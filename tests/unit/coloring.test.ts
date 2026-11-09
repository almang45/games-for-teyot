import { describe, expect, it } from 'vitest';
import {
  closeGaps,
  dilate,
  disc,
  erode,
  labelRegions,
  lineMask,
  type Mask,
} from '../../src/engine/fill/regions';
import type { Rgba } from '../../tools/build/png';
import { checkColoringPage } from '../../tools/validate/coloring';
import { BLACK, WHITE, gridPage, page } from './fixtures/pages';

/** Builds a mask from rows of '#' (line) and '.' (paper). */
function mask(rows: string[]): Mask {
  const width = rows[0]?.length ?? 0;
  const data = Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0));
  return { width, height: rows.length, data };
}

const render = (m: Mask): string[] =>
  Array.from({ length: m.height }, (_, y) =>
    [...m.data.subarray(y * m.width, (y + 1) * m.width)].map((v) => (v ? '#' : '.')).join(''),
  );

describe('fill regions', () => {
  it('treats dark opaque pixels as line', () => {
    const rgba = Uint8Array.from([
      0, 0, 0, 255, 127, 127, 127, 255, 128, 128, 128, 255, 0, 0, 0, 0,
    ]);
    expect([...lineMask(rgba, 4, 1).data]).toEqual([1, 1, 0, 0]);
  });

  it('builds round structuring elements', () => {
    expect(disc(0)).toHaveLength(1);
    expect(disc(1)).toHaveLength(5);
    expect(disc(2)).toHaveLength(13);
  });

  it('dilates and erodes, treating outside the page as paper', () => {
    const dot = mask(['.....', '.....', '..#..', '.....', '.....']);
    expect(render(dilate(dot, 1))).toEqual(['.....', '..#..', '.###.', '..#..', '.....']);
    const block = mask(['###..', '###..', '###..', '.....']);
    expect(render(erode(block, 1))).toEqual(['.....', '.#...', '.....', '.....']);
  });

  it('closes gaps up to 2 px and leaves wider ones open', () => {
    const narrow = mask(['#..#', '#..#']);
    expect(render(closeGaps(narrow))).toEqual(['####', '####']);
    const wide = mask(['#....#']);
    expect(render(closeGaps(wide))).toEqual(['##..##']);
  });

  it('labels 4-connected regions with bounds and a border flag', () => {
    const m = mask(['#####', '#..##', '##.##', '#####', '....#']);
    const { ids, regions } = labelRegions(m);
    expect(regions).toEqual([
      { id: 1, area: 3, bounds: [1, 1, 2, 2], touchesBorder: false },
      { id: 2, area: 4, bounds: [0, 4, 4, 1], touchesBorder: true },
    ]);
    expect(ids[0]).toBe(0);
    // A diagonal pinch does not connect regions.
    const pinch = mask(['.#', '#.']);
    expect(labelRegions(pinch).regions).toHaveLength(2);
  });
});

describe('checkColoringPage', () => {
  it('accepts a closed page with 6–15 regions', () => {
    const report = checkColoringPage(gridPage({ cols: 3, rows: 3 }), 'p');
    expect(report.issues).toEqual([]);
    expect(report.regions).toBe(10);
  });

  it('closes 2 px gaps but catches a leak', () => {
    const base = { height: 400, cols: 1, rows: 5 } as const;
    expect(checkColoringPage(gridPage(base), 'p').regions).toBe(6);
    // The first divider runs at y = 96..103; a 2 px slit through it is closed when the page loads.
    expect(
      checkColoringPage(gridPage({ ...base, gap: { x: 200, y: 96, size: 2 } }), 'p').issues,
    ).toEqual([]);
    const leaky = checkColoringPage(gridPage({ ...base, gap: { x: 200, y: 96, size: 8 } }), 'p');
    expect(leaky.regions).toBe(5);
    expect(leaky.issues.map((i) => i.message)).toEqual([
      expect.stringContaining('5 fillable regions') as string,
    ]);
  });

  it('ignores pockets smaller than 40 × 40 px', () => {
    const report = checkColoringPage(gridPage({ width: 480, height: 300, cols: 12, rows: 1 }), 'p');
    // 12 columns of ~27 px are too narrow to fill: only the background counts.
    expect(report.regions).toBe(1);
  });

  it('rejects thin lines', () => {
    const report = checkColoringPage(gridPage({ cols: 3, rows: 3, line: 3 }), 'p');
    expect(report.issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/of the line art is thinner than 6 px$/) as string,
    ]);
  });

  it('rejects colour, grey patches and transparency', () => {
    const patch = (x: number, y: number, colour: Rgba): Rgba | undefined =>
      x >= 60 && x < 100 && y >= 45 && y < 70 ? colour : undefined;
    const coloured = gridPage({
      cols: 3,
      rows: 3,
      extra: (x, y) => patch(x, y, [220, 40, 40, 255]),
    });
    expect(checkColoringPage(coloured, 'p').issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/^pages are black lines on white, but/) as string,
    ]);
    const grey = gridPage({ cols: 3, rows: 3, extra: (x, y) => patch(x, y, [160, 160, 160, 255]) });
    expect(checkColoringPage(grey, 'p').issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/grey away from any line: no grey patches$/) as string,
    ]);
    const clear = gridPage({
      cols: 3,
      rows: 3,
      extra: (x, y) => (x === 1 && y === 1 ? [255, 255, 255, 0] : undefined),
    });
    expect(checkColoringPage(clear, 'p').issues.map((i) => i.message)).toEqual([
      'page must be opaque: 1 transparent pixels',
    ]);
  });

  it('rejects an empty page', () => {
    const blank = page(100, 100, () => WHITE);
    expect(checkColoringPage(blank, 'p').issues.map((i) => i.message)).toEqual([
      'page has no line art',
      expect.stringContaining('1 fillable regions') as string,
    ]);
    expect(BLACK).toEqual([0, 0, 0, 255]);
  });
});
