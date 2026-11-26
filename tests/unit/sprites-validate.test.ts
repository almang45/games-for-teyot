import { describe, expect, it } from 'vitest';
import type { ManifestEntry } from '../../contracts/manifest';
import { decodePng } from '../../tools/build/png';
import { checkSheetPixels, frameExtent } from '../../tools/validate/sprites';
import { sheetPng, THEIA_STANDING, type Figure } from './fixtures/sprites';

type SheetEntry = Extract<ManifestEntry, { type: 'spritesheet' }>;

const theia = (animations: SheetEntry['animations']): SheetEntry => ({
  key: 'character.theia.default',
  type: 'spritesheet',
  path: 'character/theia/default.png',
  frame: [256, 256],
  animations,
  room: 'global',
});

const decode = (figures: readonly (Figure | undefined)[], width = 1024, height = 256) =>
  decodePng(sheetPng(width, height, [256, 256], figures));

const messages = (entry: SheetEntry, figures: readonly (Figure | undefined)[]): string[] =>
  checkSheetPixels(entry, decode(figures), 'assets[0]').map((i) => `${i.path}: ${i.message}`);

describe('frameExtent', () => {
  it('finds the opaque rows of a frame anywhere in the grid', () => {
    const png = decode([THEIA_STANDING, { bottom: 200, height: 50 }, undefined], 512, 512);
    expect(frameExtent(png, 0, [256, 256])).toEqual({ top: 25, bottom: 240 });
    expect(frameExtent(png, 1, [256, 256])).toEqual({ top: 151, bottom: 200 });
    expect(frameExtent(png, 2, [256, 256])).toBeUndefined();
  });

  it('ignores soft edges below the opacity threshold', () => {
    const png = decode([THEIA_STANDING], 256, 256);
    // A faint shadow under the feet must not move the baseline.
    for (let x = 0; x < 256; x++) png.rgba[(248 * 256 + x) * 4 + 3] = 60;
    expect(frameExtent(png, 0, [256, 256])).toEqual({ top: 25, bottom: 240 });
  });
});

describe('checkSheetPixels', () => {
  const entry = theia({
    'idle.fr': { frames: [0, 1], fps: 6, loop: false },
    'walk.fr': { frames: [2, 3], fps: 8, loop: true },
  });

  it('accepts figures on the baseline with the rest pose at stand height', () => {
    // Only the rest pose is held to the stand height; a walk frame may crouch.
    expect(messages(entry, [THEIA_STANDING, THEIA_STANDING, { bottom: 241, height: 180 }])).toEqual(
      [],
    );
  });

  it('flags empty frames, floating feet and a rest pose at the wrong scale', () => {
    expect(
      messages(entry, [
        { bottom: 240, height: 160 },
        { bottom: 236, height: 216 },
        undefined,
        THEIA_STANDING,
      ]),
    ).toEqual([
      'assets[0].animations.idle.fr: the rest pose (frame 0) is 160 px tall, not 216 ± 4%',
      'assets[0].animations.idle.fr: frame 1 stands on row 236, not the baseline 240',
      'assets[0].animations.walk.fr: frame 2 is empty',
    ]);
  });

  it('checks a frame shared by two animations once', () => {
    const shared = theia({
      'idle.fr': { frames: [0, 1], fps: 6, loop: false },
      'think.fr': { frames: [1, 1], fps: 6, loop: false },
    });
    expect(messages(shared, [THEIA_STANDING, undefined])).toEqual([
      'assets[0].animations.idle.fr: frame 1 is empty',
    ]);
  });

  it('skips frames past the sheet, which checkImageSize reports', () => {
    const long = theia({ 'idle.fr': { frames: [0, 9], fps: 6, loop: false } });
    expect(messages(long, [THEIA_STANDING])).toEqual([]);
  });

  it('only checks for empty frames in families without a stance', () => {
    const portrait: SheetEntry = {
      key: 'parent.mama.portrait',
      type: 'spritesheet',
      path: 'parent/mama/portrait.png',
      frame: [256, 256],
      animations: { idle: { frames: [0, 1], fps: 6, loop: false } },
      room: 'global',
    };
    expect(messages(portrait, [{ bottom: 100, height: 40 }, undefined])).toEqual([
      'assets[0].animations.idle: frame 1 is empty',
    ]);
  });
});
