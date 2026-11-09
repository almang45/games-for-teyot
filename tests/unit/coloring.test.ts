import { describe, expect, it } from 'vitest';
import {
  closeGaps,
  dilate,
  erode,
  labelRegions,
  lineMask,
  regionsHoldingSquare,
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

  it('matches brute-force disc morphology exactly', () => {
    // Deterministic noise, so a failure reproduces.
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const [width, height] = [37, 23];
    const m: Mask = {
      width,
      height,
      data: Uint8Array.from({ length: width * height }, () => (rand() < 0.2 ? 1 : 0)),
    };
    const brute = (radius: number, grow: boolean): number[] =>
      Array.from({ length: width * height }, (_, i) => {
        const [x, y] = [i % width, Math.floor(i / width)];
        let hit = false;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > radius * radius) continue;
            const [nx, ny] = [x + dx, y + dy];
            const v =
              nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : (m.data[ny * width + nx] ?? 0);
            if (v === (grow ? 1 : 0)) hit = true;
          }
        }
        return hit === grow ? 1 : 0;
      });
    for (const gap of [1, 2, 4, 8]) {
      // The runtime closing paints spans instead of a distance field; same pixels.
      expect([...closeGaps(m, gap).data], `closeGaps ${gap}`).toEqual(
        brute(Math.ceil(gap / 2), true),
      );
    }
    for (const r of [0, 1, 2, 3, 5]) {
      expect([...dilate(m, r).data], `dilate ${r}`).toEqual(brute(r, true));
      expect([...erode(m, r).data], `erode ${r}`).toEqual(brute(r, false));
    }
  });

  it('finds the regions a square fits in', () => {
    const m = mask([
      '......#.......',
      '......#.......',
      '......#.......',
      '##############',
      '..............',
    ]);
    const labels = labelRegions(m);
    // Left 6 × 3 holds 3 × 3, right 7 × 3 too; the bottom strip is 1 px tall.
    expect([...regionsHoldingSquare(labels, m.width, 3)].sort()).toEqual([1, 2]);
    expect([...regionsHoldingSquare(labels, m.width, 4)]).toEqual([]);
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
      { id: 1, first: 6, area: 3, bounds: [1, 1, 2, 2], touchesBorder: false },
      { id: 2, first: 20, area: 4, bounds: [0, 4, 4, 1], touchesBorder: true },
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
    // 9 cells, plus the background: its 40 px side margins hold the square.
    expect(report.regions).toBe(10);
  });

  it('counts a region whose paper is exactly 40 × 40 px, and not one px less', () => {
    // A 6 × 1 row of square cells with 8 px walls; the 2 px closing must not eat the margin.
    const cells = (inner: number): number =>
      checkColoringPage(
        gridPage({
          width: 6 * inner + 7 * 8 + 2,
          height: inner + 16 + 2,
          cols: 6,
          rows: 1,
          inset: 1,
        }),
        'p',
      ).regions;
    expect(cells(40)).toBe(6);
    expect(cells(39)).toBe(0);
  });

  it('catches a leak out of a small region next to a big one', () => {
    // A 44 × 44 pocket in a big cell's corner, its wall opened 5 px: both still hold the square.
    const wall = (x: number, y: number): Rgba | undefined => {
      const onWall =
        (x >= 92 && x < 100 && y >= 38 && y < 90) || (y >= 82 && y < 90 && x >= 48 && x < 100);
      if (!onWall) return undefined;
      return x >= 92 && y >= 60 && y < 65 ? WHITE : BLACK;
    };
    const leaky = checkColoringPage(gridPage({ cols: 3, rows: 3, extra: wall }), 'p');
    expect(leaky.issues.map((i) => i.message)).toEqual([
      expect.stringMatching(
        /^2 areas in \[\d+, \d+, \d+, \d+\] join through an opening of 3–8 px:/,
      ) as string,
    ]);
  });

  it('closes 2 px gaps but catches a leak', () => {
    const base = { height: 400, cols: 2, rows: 5 } as const;
    expect(checkColoringPage(gridPage(base), 'p').regions).toBe(11);
    // The first divider runs at y = 96..103; a 2 px slit through it is closed when the page loads.
    expect(
      checkColoringPage(gridPage({ ...base, gap: { x: 200, y: 96, size: 2 } }), 'p').issues,
    ).toEqual([]);
    const leaky = checkColoringPage(gridPage({ ...base, gap: { x: 200, y: 96, size: 8 } }), 'p');
    // Two cells merge, which leaves 10 regions: inside 6–15, so only the leak probe catches it.
    expect(leaky.regions).toBe(10);
    expect(leaky.issues.map((i) => i.message)).toEqual([
      '2 areas in [49, 39, 186, 123] join through an opening of 3–8 px: close the gap, or widen a deliberate passage past 8 px',
    ]);
  });

  it('catches a leak into the background even when the count still passes', () => {
    // 9 cells; a 4 px opening in the left frame line merges the top-left cell with the margin.
    const hole = (x: number, y: number): Rgba | undefined =>
      x >= 40 && x < 48 && y >= 60 && y < 64 ? WHITE : undefined;
    const leaky = checkColoringPage(gridPage({ cols: 3, rows: 3, extra: hole }), 'p');
    expect(leaky.regions).toBe(9);
    expect(leaky.issues.map((i) => i.message)).toEqual([
      expect.stringMatching(
        /^2 areas in \[0, 0, 480, 300\] join through an opening of 3–8 px, leaking into the background/,
      ) as string,
    ]);
  });

  it('accepts a deliberate passage wider than the leak probe', () => {
    const open = checkColoringPage(
      gridPage({ cols: 3, rows: 3, gap: { x: 36, y: 60, size: 30 } }),
      'p',
    );
    expect(open.issues).toEqual([]);
  });

  it('does not count slivers as fillable', () => {
    // Concentric frames 12 px apart: big bounding boxes, nothing a 40 px finger fits in.
    const rings = page(480, 300, (x, y) => {
      const edge = Math.min(x, y, 479 - x, 299 - y);
      return edge >= 40 && edge < 100 && (edge - 40) % 20 < 8 ? BLACK : WHITE;
    });
    expect(checkColoringPage(rings, 'p').regions).toBe(2);
  });

  it('ignores pockets smaller than 40 × 40 px', () => {
    const report = checkColoringPage(gridPage({ width: 480, height: 300, cols: 12, rows: 1 }), 'p');
    // 12 columns of ~27 px are too narrow to fill; only the background's 40 px sides count.
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
