import { describe, expect, it } from 'vitest';
import {
  checkImageSize,
  checkManifest,
  describeSize,
  familyOf,
  KEY_FAMILIES,
  manifest,
  sizeMatches,
  type Manifest,
  type ManifestEntry,
} from '../../contracts/manifest';
import { manifestFixture } from './fixtures/contracts';

const messages = (issues: { severity: string; path: string; message: string }[]): string[] =>
  issues.map((i) => `${i.severity} ${i.path}: ${i.message}`);

const entry = (m: Manifest, key: string): ManifestEntry => {
  const e = m.assets.find((a) => a.key === key);
  if (!e) throw new Error(`fixture lacks ${key}`);
  return e;
};

describe('key families', () => {
  it.each([
    ['character.theia.default', 'character'],
    ['companion.bubu.default', 'companion.bubu'],
    ['companion.ocica.piyama', 'companion.ocica'],
    ['parent.mama.portrait', 'parent.portrait'],
    ['parent.papa.body', 'parent.body'],
    ['house.layout', 'house.layout'],
    ['house.sky.dusk', 'house.backdrop'],
    ['house.lights', 'house.layer'],
    ['house.rooms.kamar-anak.dim', 'house.layer'],
    ['house.mess.ruang-keluarga', 'house.layer'],
    ['house.occluders.railing-tangga', 'house.layer'],
    ['house.fridge', 'house.prop'],
    ['tracing.theme.zigzag', 'tracing'],
    ['counting.dots.10', 'counting.dots'],
    ['coloring.ayam', 'coloring'],
    ['tidy.toybox', 'tidy.toybox'],
    ['rewards.stickers.apel', 'sticker'],
    ['bedtime.room', 'bedtime.room'],
    ['bedtime.moon', 'bedtime.prop'],
    ['ui.cursor.pressed', 'ui.cursor'],
    ['ui.hud.home', 'ui'],
    ['icons.app.maskable-512', 'icon.512'],
    ['icons.app.apple-touch-180', 'icon.apple'],
    ['font.andika', 'font'],
  ])('%s is %s', (key, family) => {
    expect(familyOf(key)?.id).toBe(family);
  });

  it.each(['house.rooms.ruang-tamu', 'counting.dots.11', 'companion.kiki.default', 'misc.thing'])(
    '%s matches no family',
    (key) => {
      expect(familyOf(key)).toBeUndefined();
    },
  );

  it('gives every image family a size rule and every sheet a frame', () => {
    for (const f of KEY_FAMILIES) {
      if (f.type === 'image' || f.type === 'coloring') expect(f.size, f.id).toBeDefined();
      if (f.type === 'spritesheet') expect(f.frame && f.animations, f.id).toBeTruthy();
    }
  });

  it('matches and describes size rules', () => {
    expect(sizeMatches({ exact: [192, 192] }, [192, 192])).toBe(true);
    expect(sizeMatches({ exact: [192, 192] }, [192, 191])).toBe(false);
    expect(sizeMatches({ min: [144, 144], max: [1024, 1024] }, [144, 1024])).toBe(true);
    expect(sizeMatches({ min: [144, 144], max: [1024, 1024] }, [143, 500])).toBe(false);
    expect(describeSize({ exact: [1, 2] })).toBe('1 × 2');
    expect(describeSize({ min: [1, 2], max: [3, 4] })).toBe('1 × 2 to 3 × 4');
  });
});

describe('manifest schema', () => {
  it('accepts the fixture', () => {
    expect(manifest.parse(manifestFixture())).toBeTruthy();
  });

  it.each([
    ['an absolute path', { path: '/etc/passwd.png' }],
    ['a parent path', { path: '../reference/theia.png' }],
    ['an underscore', { path: 'house/rooms/dapur_dim.png' }],
    ['a wrong extension', { path: 'counting/objects/apel.jpg' }],
    ['an unknown room', { room: 'ruang-tamu' }],
    ['a single-segment key', { key: 'apel' }],
  ])('rejects %s', (_, patch) => {
    const m = manifestFixture();
    Object.assign(entry(m, 'counting.objects.apel'), patch);
    expect(manifest.safeParse(m).success).toBe(false);
  });
});

describe('checkManifest', () => {
  it('accepts the fixture, warning about animations not drawn yet', () => {
    const issues = checkManifest(manifestFixture());
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    expect(messages(issues)).toEqual([
      'warning assets[0].animations: not delivered yet: idle.br, walk.fr, walk.br, stairs.fr, stairs.br, celebrate.fr, point.fr, think.fr, sleep.fr',
    ]);
  });

  it('flags duplicate keys and paths, unknown families, and wrong types', () => {
    const m = manifestFixture();
    m.assets.push({ ...entry(m, 'ui.home') });
    m.assets.push({ key: 'misc.thing', type: 'image', path: 'misc/thing.png', room: 'global' });
    m.assets.push({
      key: 'coloring.ayam',
      type: 'image',
      path: 'coloring/ayam.png',
      room: 'global',
    });
    expect(messages(checkManifest(m)).filter((s) => s.startsWith('error'))).toEqual([
      'error assets: duplicate key ui.home',
      'error assets: ui/home.png is registered twice',
      'error assets[7].key: misc.thing matches no key family (ASSETS.md); propose a contract change',
      'error assets[8].type: coloring.ayam must be a coloring',
    ]);
  });

  it('checks frames, animation names, frame counts, order, rate and looping', () => {
    const m = manifestFixture();
    const sheet = entry(m, 'character.theia.default');
    if (sheet.type !== 'spritesheet') throw new Error('fixture sheet');
    sheet.frame = [192, 160];
    sheet.animations = {
      'idle.fr': { frames: [0, 2], fps: 6, loop: true },
      'idle.br': { frames: [8, 4], fps: 6, loop: true },
      'walk.fr': { frames: [10, 17], fps: 30, loop: true },
      'celebrate.fr': { frames: [4, 9], fps: 12, loop: true },
      'celebrate.br': { frames: [4, 9], fps: 12, loop: false },
      wave: { frames: [0, 5], fps: 8, loop: false },
    };
    expect(messages(checkManifest(m)).filter((s) => s.startsWith('error'))).toEqual([
      'error assets[0].frame: character frames are 256 × 256',
      'error assets[0].animations.idle.fr.frames: idle.fr has 4 frames, got 3',
      'error assets[0].animations.idle.br.frames: last frame comes before the first',
      'error assets[0].animations.walk.fr.fps: walk.fr plays at 12 fps, got 30',
      'error assets[0].animations.celebrate.fr.loop: celebrate.fr must not loop',
      expect.stringMatching(
        /^error assets\[0\]\.animations\.celebrate\.br: not an animation of character: use idle\.fr, idle\.br/,
      ) as string,
      expect.stringMatching(
        /^error assets\[0\]\.animations\.wave: not an animation of character/,
      ) as string,
    ]);
  });

  it('lets portrait talk frames run either way, without facings', () => {
    const m: Manifest = {
      version: 1,
      assets: [
        {
          key: 'parent.mama.portrait',
          type: 'spritesheet',
          path: 'parent/mama/portrait.png',
          frame: [384, 384],
          animations: {
            idle: { frames: [0, 3], fps: 6, loop: true },
            talk: { frames: [4, 6], fps: 12, loop: true },
            smile: { frames: [7, 8], fps: 6, loop: false },
            encourage: { frames: [9, 12], fps: 6, loop: false },
          },
          room: 'global',
        },
      ],
    };
    expect(checkManifest(m)).toEqual([]);
  });

  it('requires drop zones and hotspots where they belong, and only there', () => {
    const m = manifestFixture();
    const bowl = entry(m, 'counting.containers.mangkuk');
    if (bowl.type !== 'image') throw new Error('fixture image');
    delete bowl.dropZone;
    const apel = entry(m, 'counting.objects.apel');
    if (apel.type !== 'image') throw new Error('fixture image');
    apel.dropZone = [0, 0, 10, 10];
    apel.hotspot = [1, 1];
    m.assets.push({
      key: 'ui.cursor.normal',
      type: 'image',
      path: 'ui/cursor.png',
      room: 'global',
    });
    expect(messages(checkManifest(m)).filter((s) => s.startsWith('error'))).toEqual([
      'error assets[1].dropZone: counting.object has no drop zone',
      'error assets[1].hotspot: only cursors have a hotspot',
      'error assets[2].dropZone: counting.container needs a dropZone',
      'error assets[6].hotspot: cursors need a hotspot',
    ]);
  });
});

describe('checkImageSize', () => {
  it('checks the family size', () => {
    const m = manifestFixture();
    const apel = entry(m, 'counting.objects.apel');
    expect(checkImageSize(apel, [192, 192], 'a')).toEqual([]);
    expect(messages(checkImageSize(apel, [200, 192], 'a'))).toEqual([
      'error a: counting.objects.apel must be 192 × 192 px, got 200 × 192',
    ]);
  });

  it('wants garden and sky wide enough for a 20:9 phone', () => {
    const bg: ManifestEntry = {
      key: 'house.bg',
      type: 'image',
      path: 'house/bg.png',
      room: 'global',
    };
    expect(checkImageSize(bg, [2688, 1200], 'a')).toEqual([]);
    expect(messages(checkImageSize(bg, [1920, 1200], 'a'))).toEqual([
      'error a: house.bg must be 2688 × 1200 px, got 1920 × 1200',
    ]);
  });

  it('checks the sheet grid and the frames it holds', () => {
    const sheet = entry(manifestFixture(), 'character.theia.default');
    expect(checkImageSize(sheet, [1024, 256], 'a')).toEqual([]);
    expect(messages(checkImageSize(sheet, [1000, 256], 'a'))).toEqual([
      'error a: 1000 × 256 is not a whole grid of 256 × 256 frames',
    ]);
    expect(messages(checkImageSize(sheet, [768, 256], 'a'))).toEqual([
      "error a.animations.idle.fr: frame 3 is past the sheet's 3 frames",
    ]);
  });

  it('keeps drop zones and hotspots inside the image', () => {
    const bowl = entry(manifestFixture(), 'counting.containers.mangkuk');
    expect(checkImageSize(bowl, [512, 384], 'a')).toEqual([]);
    if (bowl.type !== 'image') throw new Error('fixture image');
    bowl.dropZone = [400, 300, 200, 100];
    expect(messages(checkImageSize(bowl, [512, 384], 'a'))).toEqual([
      'error a.dropZone: drop zone leaves the image',
    ]);
    const cursor: ManifestEntry = {
      key: 'ui.cursor.normal',
      type: 'image',
      path: 'ui/cursor.png',
      hotspot: [70, 2],
      room: 'global',
    };
    expect(messages(checkImageSize(cursor, [64, 64], 'a'))).toEqual([
      'error a.hotspot: hotspot is outside the image',
    ]);
  });

  it('has no size rule for layouts and fonts', () => {
    expect(checkImageSize(entry(manifestFixture(), 'font.andika'), [1, 1], 'a')).toEqual([]);
  });
});
