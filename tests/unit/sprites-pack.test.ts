import { describe, expect, it } from 'vitest';
import { familyOf, type Manifest } from '../../contracts/manifest';
import { dropSpecks, removeBackground } from '../../tools/sprites/key';
import { animationNames, packSheet, sheetPath, upsertEntry } from '../../tools/sprites/pack';
import { splitPanels } from '../../tools/sprites/panels';
import {
  blank,
  blit,
  boxHeight,
  crop,
  opaqueBox,
  resize,
  type Raster,
} from '../../tools/sprites/raster';
import { frameExtent } from '../../tools/validate/sprites';
import { manifestFixture } from './fixtures/contracts';
import { KEY_BLUE, OUTLINE, pixel, SKIN, strip, type Pose } from './fixtures/strips';

const solid = (width: number, height: number, rgba: readonly number[]): Raster => {
  const r = blank(width, height);
  for (let i = 0; i < width * height; i++) r.rgba.set(rgba, i * 4);
  return r;
};

const messages = (issues: readonly { severity: string; path: string; message: string }[]) =>
  issues.map((i) => `${i.severity} ${i.path}: ${i.message}`);

describe('raster', () => {
  it('finds opaque bounds, ignoring soft pixels', () => {
    const r = blank(10, 10);
    r.rgba.set([0, 0, 0, 255], (3 * 10 + 2) * 4);
    r.rgba.set([0, 0, 0, 255], (7 * 10 + 6) * 4);
    r.rgba.set([0, 0, 0, 60], (9 * 10 + 9) * 4);
    expect(opaqueBox(r)).toEqual({ left: 2, top: 3, right: 6, bottom: 7 });
    expect(opaqueBox(r, 1)).toEqual({ left: 2, top: 3, right: 9, bottom: 9 });
    expect(opaqueBox(blank(4, 4))).toBeUndefined();
  });

  it('crops within the raster', () => {
    const c = crop(solid(8, 8, [1, 2, 3, 255]), { left: -2, top: 6, right: 3, bottom: 12 });
    expect([c.width, c.height]).toEqual([4, 2]);
    expect(pixel(c, 3, 1)).toEqual([1, 2, 3, 255]);
  });

  it('averages in premultiplied alpha, so transparent pixels never darken an edge', () => {
    const r = blank(2, 1);
    r.rgba.set([200, 40, 20, 255], 0);
    expect(pixel(resize(r, 1, 1), 0, 0)).toEqual([200, 40, 20, 128]);
  });

  it('keeps a flat colour flat at fractional scales', () => {
    const out = resize(solid(10, 7, [90, 160, 30, 255]), 3, 2);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 3; x++) expect(pixel(out, x, y)).toEqual([90, 160, 30, 255]);
    }
  });

  it('counts the opaque pixels a blit clips', () => {
    const dst = blank(4, 4);
    expect(blit(dst, solid(2, 2, [9, 9, 9, 255]), 3, 3)).toBe(3);
    expect(pixel(dst, 3, 3)).toEqual([9, 9, 9, 255]);
    expect(blit(dst, solid(2, 2, [9, 9, 9, 100]), -1, -1)).toBe(0);
  });
});

describe('removeBackground', () => {
  const poses: Pose[] = [{ height: 80, width: 30 }];

  it('passes a transparent strip through', () => {
    const r = strip(poses);
    const keyed = removeBackground(r);
    expect(keyed.key).toBeUndefined();
    expect(keyed.raster.rgba).toEqual(r.rgba);
  });

  it('removes a flat background and keeps the figure solid', () => {
    const r = strip(poses, { background: KEY_BLUE, noise: 6 });
    const { raster, key } = removeBackground(r);
    expect(key?.map(Math.round)).toEqual([...KEY_BLUE].map((c) => expect.closeTo(c, 0) as number));
    expect(pixel(raster, 2, 2)[3]).toBe(0);
    // Body interior and outline at the figure's middle row.
    expect(pixel(raster, 55, 100)).toEqual([...SKIN, 255]);
    expect(pixel(raster, 40, 100)).toEqual([...OUTLINE, 255]);
  });

  it('unmixes the key out of a soft edge', () => {
    const r = strip(poses, { background: KEY_BLUE });
    // Half outline, half key, just left of the body's outline.
    const mix = OUTLINE.map((c, i) => Math.round((c + (KEY_BLUE[i] ?? 0)) / 2));
    r.rgba.set([...mix, 255], (100 * r.width + 39) * 4);
    const [red, green, blue, a] = pixel(removeBackground(r).raster, 39, 100);
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(160);
    expect(blue).toBeLessThan(80);
    expect(Math.abs((red ?? 0) - OUTLINE[0])).toBeLessThan(15);
    expect(Math.abs((green ?? 0) - OUTLINE[1])).toBeLessThan(15);
  });

  it('refuses a background that is not one flat colour', () => {
    expect(() => removeBackground(strip(poses, { background: KEY_BLUE, noise: 60 }))).toThrow(
      /not one flat colour/,
    );
    const r = strip(poses, { background: KEY_BLUE });
    for (let y = 0; y < 20; y++) {
      for (let x = r.width - 20; x < r.width; x++)
        r.rgba.set([250, 250, 250, 255], (y * r.width + x) * 4);
    }
    expect(() => removeBackground(r)).toThrow(/corners/);
  });
});

describe('dropSpecks', () => {
  it('drops tiny islands and faint noise, keeping soft edges next to the figure', () => {
    const r = strip([{ height: 80, width: 30 }]);
    r.rgba.set([0, 0, 0, 255], (5 * r.width + 5) * 4);
    r.rgba.set([0, 0, 0, 40], (5 * r.width + 90) * 4);
    r.rgba.set([0, 0, 0, 40], (100 * r.width + 39) * 4);
    const { raster, specks } = dropSpecks(r);
    expect(specks).toBe(1);
    expect(pixel(raster, 5, 5)[3]).toBe(0);
    expect(pixel(raster, 90, 5)[3]).toBe(0);
    expect(pixel(raster, 39, 100)[3]).toBe(40);
    expect(pixel(raster, 55, 100)[3]).toBe(255);
  });
});

describe('splitPanels', () => {
  it('cuts one panel per pose, halfway across each gap', () => {
    const r = strip([
      { height: 80, width: 30 },
      { height: 60, width: 20 },
      { height: 70, width: 26 },
    ]);
    const { panels, merged } = splitPanels(r, 3);
    expect(merged).toBe(0);
    expect(panels.map((p) => p.width)).toEqual([90, 60, 86]);
    expect(
      panels.map(
        (p) => opaqueBox(p) && boxHeight(opaqueBox(p) ?? { left: 0, top: 0, right: 0, bottom: 0 }),
      ),
    ).toEqual([80, 60, 70]);
  });

  it('joins a detached part to its pose', () => {
    const r = strip([
      { height: 80, width: 30, hand: [4, 6] },
      { height: 80, width: 30 },
    ]);
    const { panels, merged } = splitPanels(r, 2);
    expect(merged).toBe(1);
    expect(opaqueBox(panels[0] ?? blank(1, 1))?.right).toBeGreaterThan(70);
  });

  it('asks for clear space when poses touch', () => {
    const r = strip(
      [
        { height: 80, width: 30 },
        { height: 80, width: 30 },
      ],
      { gap: 0 },
    );
    expect(() => splitPanels(r, 3)).toThrow('found 1 figures, expected 4'.replace('4', '3'));
  });
});

/** A strip for one animation: the reference pose, then `frames` poses. */
const poses = (frames: number, pose: Pose = { height: 432, width: 120 }): Pose[] =>
  Array.from({ length: frames + 1 }, () => pose);

const theiaStrips = (names: readonly string[], pose?: Pose): Map<string, Raster> => {
  const family = familyOf('character.theia.default');
  if (!family) throw new Error('no Theia family');
  const specs = new Map(animationNames(family));
  return new Map(
    names.map((n) => [n, strip(poses(specs.get(n)?.frames ?? 1, pose), { background: KEY_BLUE })]),
  );
};

describe('packSheet', () => {
  it('names a family’s animations in contract order, fr before br', () => {
    const family = familyOf('companion.bubu.default');
    expect(family && animationNames(family).map(([n]) => n)).toEqual([
      'idle.fr',
      'idle.br',
      'walk.fr',
      'walk.br',
      'point.fr',
      'demo.fr',
      'celebrate.fr',
      'sleep.fr',
    ]);
    expect(sheetPath('parent.mama.portrait')).toBe('parent/mama/portrait.png');
  });

  it('packs strips into a sheet that meets the contract', () => {
    const packed = packSheet('character.theia.default', theiaStrips(['walk.fr', 'idle.fr']), {
      fps: new Map([['idle', 5]]),
    });
    expect(messages(packed.issues)).toEqual([
      expect.stringMatching(/^warning strips: no strip yet for idle\.br, walk\.br/) as string,
    ]);
    expect(packed.entry).toEqual({
      key: 'character.theia.default',
      type: 'spritesheet',
      path: 'character/theia/default.png',
      frame: [256, 256],
      animations: {
        'idle.fr': { frames: [0, 1], fps: 5, loop: false },
        'walk.fr': { frames: [2, 5], fps: 8, loop: true },
      },
      room: 'global',
    });
    expect([packed.sheet.width, packed.sheet.height]).toEqual([1536, 256]);
    for (let f = 0; f < 6; f++) {
      expect(frameExtent(packed.sheet, f, [256, 256])).toEqual({ top: 25, bottom: 240 });
    }
  });

  it('wraps the grid at 2048 px', () => {
    const all = theiaStrips(['idle.fr', 'idle.br', 'walk.fr', 'walk.br', 'stairs.fr']);
    const packed = packSheet('character.theia.default', all);
    expect([packed.sheet.width, packed.sheet.height]).toEqual([2048, 512]);
    expect(packed.entry.animations['stairs.fr']?.frames).toEqual([12, 15]);
  });

  it('centres each frame on the head, so it holds still while the body moves', () => {
    const strips = new Map([
      [
        'idle.fr',
        strip(
          [
            { height: 432, width: 120 },
            { height: 432, width: 120 },
            { height: 432, width: 120, headShift: 20 },
          ],
          { background: KEY_BLUE },
        ),
      ],
    ]);
    const { sheet } = packSheet('character.theia.default', strips);
    const headMiddle = (frame: number): number => {
      const row = 40;
      const xs: number[] = [];
      for (let x = 0; x < 256; x++) {
        if ((sheet.rgba[(row * sheet.width + frame * 256 + x) * 4 + 3] ?? 0) >= 128) xs.push(x);
      }
      return ((xs[0] ?? 0) + (xs.at(-1) ?? 0)) / 2;
    };
    expect(Math.abs(headMiddle(0) - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(headMiddle(1) - 128)).toBeLessThanOrEqual(1);
  });

  it('fits portraits inside their frame, centred', () => {
    const strips = new Map([
      ['idle', strip(poses(2, { height: 400, width: 400 }), { background: KEY_BLUE })],
    ]);
    const packed = packSheet('parent.mama.portrait', strips);
    expect(packed.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(frameExtent(packed.sheet, 0, [384, 384])).toEqual({ top: 4, bottom: 379 });
  });

  it('refuses to upscale, to clip a pose, or to take an unknown strip', () => {
    const small = packSheet(
      'character.theia.default',
      theiaStrips(['idle.fr'], { height: 100, width: 40 }),
    );
    expect(messages(small.issues)).toContainEqual(
      expect.stringMatching(
        /^error strips\.idle\.fr: the reference pose is 40 × 100 px; draw it at least 216 px tall/,
      ) as string,
    );
    const wide = new Map([
      [
        'idle.fr',
        strip(
          [
            { height: 432, width: 120 },
            { height: 432, width: 700 },
            { height: 280, width: 120 },
          ],
          {
            background: KEY_BLUE,
          },
        ),
      ],
      ['wave.fr', strip(poses(1), { background: KEY_BLUE })],
    ]);
    expect(messages(packSheet('character.theia.default', wide).issues)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^error strips\.idle\.fr: frame 0 loses \d+ px outside the 256 × 256 frame/,
        ) as string,
        expect.stringMatching(
          /^error strips\.wave\.fr: not an animation of character: use idle\.fr/,
        ) as string,
        expect.stringMatching(/^warning strips\.idle\.fr: pose 2 is -?\d+% the height/) as string,
      ]),
    );
  });

  it('reports a strip with the wrong number of poses and rejects non-sheet keys', () => {
    const strips = new Map([
      ['idle.fr', strip(poses(4), { background: KEY_BLUE })],
      ['walk.fr', strip(poses(4), { background: KEY_BLUE })],
    ]);
    expect(messages(packSheet('character.theia.default', strips).issues)).toContainEqual(
      expect.stringMatching(/^error strips\.idle\.fr: found 5 figures, expected 3/) as string,
    );
    expect(() => packSheet('house.layout', strips)).toThrow(/not a spritesheet key/);
    expect(messages(packSheet('character.theia.default', new Map()).issues)).toContain(
      'error strips: nothing to pack for character.theia.default',
    );
  });
});

describe('upsertEntry', () => {
  it('replaces an entry by key, keeping its room, or appends a new one', () => {
    const m: Manifest = manifestFixture();
    const packed = packSheet('character.theia.default', theiaStrips(['idle.fr']));
    const replaced = upsertEntry(m, { ...packed.entry, room: 'dapur' });
    expect(replaced.assets).toHaveLength(m.assets.length);
    expect(replaced.assets[0]).toEqual({ ...packed.entry, room: 'global' });
    const bubu = {
      ...packed.entry,
      key: 'companion.bubu.default',
      path: 'companion/bubu/default.png',
    };
    expect(upsertEntry(m, bubu).assets.at(-1)).toEqual(bubu);
  });
});
