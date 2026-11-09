import { z } from 'zod';
import {
  assetKey,
  duplicates,
  error,
  point,
  rect,
  schemaRef,
  size,
  version,
  warning,
  type Issue,
  type Point,
  type Size,
} from './common.ts';
import { ROOM_IDS, roomId } from './rooms.ts';

/** Relative to `assets/`: kebab-case folders and names (ASSETS.md §7), no `..`, no leading `/`. */
const pathFor = (ext: string) =>
  z
    .string()
    .regex(
      new RegExp(String.raw`^(?:[a-z0-9]+(?:-[a-z0-9]+)*/)*[a-z0-9]+(?:-[a-z0-9]+)*\.${ext}$`),
      `must be a kebab-case path relative to assets/, ending in .${ext}`,
    );

const bundle = z.union([z.literal('global'), roomId]);

const FACINGS = ['fr', 'br'] as const;
type Facing = (typeof FACINGS)[number];

/** `idle.fr` for facing sprites, `talk` for the facing-less portraits. */
const animationKey = z
  .string()
  .regex(/^[a-z]+(?:-[a-z]+)*(?:\.(?:fr|br))?$/, 'must be <animation> or <animation>.<fr|br>');

const frameIndex = z.number().int().min(0);

export const animation = z.strictObject({
  /** First and last frame index, inclusive, in reading order across the sheet. */
  frames: z.tuple([frameIndex, frameIndex]),
  fps: z.number().int().min(1).max(30),
  loop: z.boolean(),
});

const base = { key: assetKey, room: bundle };

export const imageEntry = z.strictObject({
  ...base,
  type: z.literal('image'),
  path: pathFor('png'),
  /** Where a dragged item lands, in image px (containers and the toy box). */
  dropZone: rect.optional(),
  /** The click point of a cursor image, in image px. */
  hotspot: point.optional(),
});

export const spritesheetEntry = z.strictObject({
  ...base,
  type: z.literal('spritesheet'),
  path: pathFor('png'),
  frame: size,
  animations: z.record(animationKey, animation),
});

export const coloringEntry = z.strictObject({
  ...base,
  type: z.literal('coloring'),
  path: pathFor('png'),
});

export const layoutEntry = z.strictObject({
  ...base,
  type: z.literal('layout'),
  path: pathFor('json'),
});

export const fontEntry = z.strictObject({
  ...base,
  type: z.literal('font'),
  path: pathFor('woff2'),
});

export const manifestEntry = z.discriminatedUnion('type', [
  imageEntry,
  spritesheetEntry,
  coloringEntry,
  layoutEntry,
  fontEntry,
]);
export type ManifestEntry = z.infer<typeof manifestEntry>;
export type AssetType = ManifestEntry['type'];

export const manifest = z.strictObject({
  $schema: schemaRef,
  version,
  assets: z.array(manifestEntry),
});
export type Manifest = z.infer<typeof manifest>;

// ---------------------------------------------------------------------------------------------
// Key families: what each key prefix must be (ASSETS.md §3–§6). Unknown keys are rejected, so new
// kinds of art start with a contract change instead of a silent guess.

/** `null` loop: the game picks frames itself (portrait `talk` follows the clip's loudness). */
export interface AnimationSpec {
  readonly frames: number;
  readonly loop: boolean | null;
  /** `both`: `fr` + `br`. `fr`: front-right only. `none`: no facing suffix (portraits). */
  readonly facings: 'both' | 'fr' | 'none';
}

type AnimationSet = Readonly<Record<string, AnimationSpec>>;

const both = (frames: number, loop: boolean): AnimationSpec => ({ frames, loop, facings: 'both' });
const fr = (frames: number, loop: boolean): AnimationSpec => ({ frames, loop, facings: 'fr' });
const plain = (frames: number, loop: boolean | null): AnimationSpec => ({
  frames,
  loop,
  facings: 'none',
});

/** ASSETS.md §3.2. */
export const THEIA_ANIMATIONS: AnimationSet = {
  idle: both(4, true),
  walk: both(8, true),
  stairs: both(8, true),
  celebrate: fr(6, false),
  point: fr(4, false),
  think: fr(4, true),
  sleep: fr(4, true),
};

/** ASSETS.md §3.3. */
export const BUBU_ANIMATIONS: AnimationSet = {
  idle: both(4, true),
  walk: both(8, true),
  point: fr(4, false),
  demo: fr(6, true),
  celebrate: fr(6, false),
  sleep: fr(4, true),
};

export const OCICA_ANIMATIONS: AnimationSet = {
  idle: both(4, true),
  walk: both(8, true),
  comfort: fr(6, false),
  celebrate: fr(6, false),
  eat: fr(4, false),
  sleep: fr(4, true),
};

/** ASSETS.md §3.4. */
export const PORTRAIT_ANIMATIONS: AnimationSet = {
  idle: plain(4, true),
  talk: plain(3, null),
  smile: plain(2, false),
  encourage: plain(4, false),
};

export const BODY_ANIMATIONS: AnimationSet = {
  idle: fr(4, true),
  wave: fr(6, false),
  clap: fr(6, false),
  'tuck-in': fr(8, false),
};

export type SizeRule = { readonly exact: Size } | { readonly min: Size; readonly max: Size };

export interface KeyFamily {
  readonly id: string;
  readonly pattern: RegExp;
  readonly type: AssetType;
  /** Image size for images and coloring pages. */
  readonly size?: SizeRule;
  /** Frame size and animation set for spritesheets. */
  readonly frame?: Size;
  readonly animations?: AnimationSet;
  readonly dropZone?: 'required';
  readonly hotspot?: 'required';
}

const ID = '[a-z0-9]+(?:-[a-z0-9]+)*';
const ROOM = `(?:${ROOM_IDS.join('|')})`;
const key = (source: string) => new RegExp(`^${source}$`);

/** The full 3840 × 2400 source canvas: the camera zooms into rooms (ASSETS.md §4.1). */
export const HOUSE_SOURCE: Size = [3840, 2400];
/** The 1920 × 1200 game export, also the layout.json coordinate space. */
export const HOUSE_EXPORT: Size = [1920, 1200];
export const SCREEN: Size = [1920, 1200];

const exact = (w: number, h: number): SizeRule => ({ exact: [w, h] });

/** Matched in order; the first match wins, so specific patterns come first. */
export const KEY_FAMILIES: readonly KeyFamily[] = [
  {
    id: 'character',
    pattern: key(`character\\.theia\\.${ID}`),
    type: 'spritesheet',
    frame: [256, 256],
    animations: THEIA_ANIMATIONS,
  },
  {
    id: 'companion.bubu',
    pattern: key(`companion\\.bubu\\.${ID}`),
    type: 'spritesheet',
    frame: [192, 160],
    animations: BUBU_ANIMATIONS,
  },
  {
    id: 'companion.ocica',
    pattern: key(`companion\\.ocica\\.${ID}`),
    type: 'spritesheet',
    frame: [192, 160],
    animations: OCICA_ANIMATIONS,
  },
  {
    id: 'parent.portrait',
    pattern: key('parent\\.(?:mama|papa)\\.portrait'),
    type: 'spritesheet',
    frame: [384, 384],
    animations: PORTRAIT_ANIMATIONS,
  },
  {
    id: 'parent.body',
    pattern: key('parent\\.(?:mama|papa)\\.body'),
    type: 'spritesheet',
    frame: [320, 320],
    animations: BODY_ANIMATIONS,
  },
  { id: 'house.layout', pattern: key('house\\.layout'), type: 'layout' },
  {
    id: 'house.backdrop',
    pattern: key('house\\.(?:bg|sky\\.(?:morning|noon|afternoon|dusk))'),
    type: 'image',
    size: { exact: HOUSE_EXPORT },
  },
  {
    id: 'house.layer',
    pattern: key(
      `house\\.(?:structure|lights|rooms\\.${ROOM}(?:\\.dim)?|mess\\.${ROOM}|occluders\\.${ID})`,
    ),
    type: 'image',
    size: { exact: HOUSE_SOURCE },
  },
  {
    id: 'house.prop',
    pattern: key('house\\.(?:fridge|sticker-wall)'),
    type: 'image',
    size: { min: [64, 64], max: [1024, 1024] },
  },
  {
    id: 'tracing',
    pattern: key(`tracing\\.(?:surface|theme\\.${ID})`),
    type: 'image',
    size: { exact: SCREEN },
  },
  {
    id: 'counting.object',
    pattern: key(`counting\\.objects\\.${ID}`),
    type: 'image',
    size: exact(192, 192),
  },
  {
    id: 'counting.container',
    pattern: key(`counting\\.containers\\.${ID}`),
    type: 'image',
    size: exact(512, 384),
    dropZone: 'required',
  },
  {
    id: 'counting.dots',
    pattern: key('counting\\.dots\\.(?:[1-9]|10)'),
    type: 'image',
    size: exact(256, 256),
  },
  { id: 'coloring', pattern: key(`coloring\\.${ID}`), type: 'coloring', size: { exact: SCREEN } },
  { id: 'tidy.toy', pattern: key(`tidy\\.toys\\.${ID}`), type: 'image', size: exact(192, 192) },
  {
    id: 'tidy.toybox',
    pattern: key('tidy\\.toybox'),
    type: 'image',
    size: exact(512, 384),
    dropZone: 'required',
  },
  {
    id: 'sticker',
    pattern: key(`rewards\\.stickers\\.${ID}`),
    type: 'image',
    size: exact(256, 256),
  },
  { id: 'bedtime.room', pattern: key('bedtime\\.room'), type: 'image', size: { exact: SCREEN } },
  {
    id: 'bedtime.prop',
    pattern: key(`bedtime\\.${ID}`),
    type: 'image',
    size: { min: [64, 64], max: SCREEN },
  },
  {
    id: 'ui.cursor',
    pattern: key('ui\\.cursor\\.(?:normal|pressed)'),
    type: 'image',
    size: exact(64, 64),
    hotspot: 'required',
  },
  {
    id: 'ui',
    pattern: key(`ui(?:\\.${ID})+`),
    type: 'image',
    size: { min: [144, 144], max: [1024, 1024] },
  },
  { id: 'icon.192', pattern: key('icons\\.app\\.192'), type: 'image', size: exact(192, 192) },
  {
    id: 'icon.512',
    pattern: key('icons\\.app\\.(?:512|maskable-512)'),
    type: 'image',
    size: exact(512, 512),
  },
  {
    id: 'icon.apple',
    pattern: key('icons\\.app\\.apple-touch-180'),
    type: 'image',
    size: exact(180, 180),
  },
  { id: 'font', pattern: key(`font\\.${ID}`), type: 'font' },
];

export function familyOf(assetKeyValue: string): KeyFamily | undefined {
  return KEY_FAMILIES.find((f) => f.pattern.test(assetKeyValue));
}

/** Whether an image of this size satisfies the rule. */
export function sizeMatches(rule: SizeRule, [w, h]: Size): boolean {
  if ('exact' in rule) return w === rule.exact[0] && h === rule.exact[1];
  return w >= rule.min[0] && h >= rule.min[1] && w <= rule.max[0] && h <= rule.max[1];
}

export function describeSize(rule: SizeRule): string {
  if ('exact' in rule) return `${rule.exact[0]} × ${rule.exact[1]}`;
  return `${rule.min[0]} × ${rule.min[1]} to ${rule.max[0]} × ${rule.max[1]}`;
}

const facingsOf = (spec: AnimationSpec): readonly (Facing | null)[] => {
  if (spec.facings === 'none') return [null];
  return spec.facings === 'both' ? FACINGS : ['fr'];
};

function checkAnimations(
  entry: z.infer<typeof spritesheetEntry>,
  family: KeyFamily,
  path: string,
): Issue[] {
  const set = family.animations ?? {};
  const issues: Issue[] = [];
  const allowed = new Map<string, AnimationSpec>();
  for (const [name, spec] of Object.entries(set)) {
    for (const facing of facingsOf(spec)) allowed.set(facing ? `${name}.${facing}` : name, spec);
  }
  for (const [name, anim] of Object.entries(entry.animations)) {
    const at = `${path}.animations.${name}`;
    const spec = allowed.get(name);
    if (!spec) {
      issues.push(
        error(at, `not an animation of ${family.id}: use ${[...allowed.keys()].join(', ')}`),
      );
      continue;
    }
    const [first, last] = anim.frames;
    if (last < first) issues.push(error(`${at}.frames`, 'last frame comes before the first'));
    else if (last - first + 1 !== spec.frames) {
      issues.push(
        error(`${at}.frames`, `${name} has ${spec.frames} frames, got ${last - first + 1}`),
      );
    }
    if (spec.loop !== null && anim.loop !== spec.loop) {
      issues.push(error(`${at}.loop`, `${name} must ${spec.loop ? '' : 'not '}loop`));
    }
  }
  const missing = [...allowed.keys()].filter((name) => !(name in entry.animations));
  if (missing.length > 0) {
    // Art arrives in stages (ASSETS.md §9); the placeholder covers what isn't drawn yet.
    issues.push(warning(`${path}.animations`, `not delivered yet: ${missing.join(', ')}`));
  }
  return issues;
}

function checkEntry(entry: ManifestEntry, i: number): Issue[] {
  const path = `assets[${i}]`;
  const family = familyOf(entry.key);
  if (!family) {
    return [
      error(
        `${path}.key`,
        `${entry.key} matches no key family (ASSETS.md); propose a contract change`,
      ),
    ];
  }
  if (entry.type !== family.type) {
    return [error(`${path}.type`, `${entry.key} must be a ${family.type}`)];
  }
  const issues: Issue[] = [];
  if (entry.type === 'spritesheet') {
    const [fw, fh] = family.frame ?? entry.frame;
    if (entry.frame[0] !== fw || entry.frame[1] !== fh) {
      issues.push(error(`${path}.frame`, `${family.id} frames are ${fw} × ${fh}`));
    }
    issues.push(...checkAnimations(entry, family, path));
  }
  if (entry.type === 'image') {
    if (family.dropZone === 'required' && !entry.dropZone) {
      issues.push(error(`${path}.dropZone`, `${family.id} needs a dropZone`));
    }
    if (family.dropZone === undefined && entry.dropZone) {
      issues.push(error(`${path}.dropZone`, `${family.id} has no drop zone`));
    }
    if (family.hotspot === 'required' && !entry.hotspot) {
      issues.push(error(`${path}.hotspot`, 'cursors need a hotspot'));
    }
    if (family.hotspot === undefined && entry.hotspot) {
      issues.push(error(`${path}.hotspot`, 'only cursors have a hotspot'));
    }
  }
  return issues;
}

/** ASSETS.md rules the schema can't express. Image sizes need the files: see validate:assets. */
export function checkManifest(m: Manifest): Issue[] {
  const issues: Issue[] = [];
  for (const dupe of duplicates(m.assets.map((a) => a.key))) {
    issues.push(error('assets', `duplicate key ${dupe}`));
  }
  for (const dupe of duplicates(m.assets.map((a) => a.path))) {
    issues.push(error('assets', `${dupe} is registered twice`));
  }
  m.assets.forEach((entry, i) => issues.push(...checkEntry(entry, i)));
  return issues;
}

/** Checks that need the image's real size: the size rule, the sheet grid, the zones. */
export function checkImageSize(entry: ManifestEntry, actual: Size, path: string): Issue[] {
  const family = familyOf(entry.key);
  const issues: Issue[] = [];
  const [w, h] = actual;
  if (family?.size && !sizeMatches(family.size, actual)) {
    issues.push(
      error(path, `${entry.key} must be ${describeSize(family.size)} px, got ${w} × ${h}`),
    );
  }
  if (entry.type === 'spritesheet') {
    const [fw, fh] = entry.frame;
    if (w % fw !== 0 || h % fh !== 0) {
      issues.push(error(path, `${w} × ${h} is not a whole grid of ${fw} × ${fh} frames`));
    } else {
      const count = (w / fw) * (h / fh);
      for (const [name, anim] of Object.entries(entry.animations)) {
        if (anim.frames[1] >= count) {
          issues.push(
            error(
              `${path}.animations.${name}`,
              `frame ${anim.frames[1]} is past the sheet's ${count} frames`,
            ),
          );
        }
      }
    }
  }
  if (entry.type === 'image') {
    const inside = ([x, y]: Point) => x >= 0 && y >= 0 && x <= w && y <= h;
    const zone = entry.dropZone;
    if (zone && !(inside([zone[0], zone[1]]) && inside([zone[0] + zone[2], zone[1] + zone[3]]))) {
      issues.push(error(`${path}.dropZone`, 'drop zone leaves the image'));
    }
    if (entry.hotspot && !inside(entry.hotspot)) {
      issues.push(error(`${path}.hotspot`, 'hotspot is outside the image'));
    }
  }
  return issues;
}
