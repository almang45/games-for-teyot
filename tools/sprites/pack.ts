import { CONTRACT_VERSION, error, warning, type Issue } from '../../contracts/common.ts';
import {
  checkImageSize,
  checkManifest,
  familyOf,
  type AnimationSpec,
  type KeyFamily,
  type Manifest,
  type ManifestEntry,
  type Stance,
} from '../../contracts/manifest.ts';
import { checkSheetPixels } from '../validate/sprites.ts';
import { dropSpecks, removeBackground } from './key.ts';
import { splitPanels } from './panels.ts';
import {
  alphaAt,
  blank,
  blit,
  boxHeight,
  boxWidth,
  crop,
  opaqueBox,
  resize,
  type Box,
  type Raster,
} from './raster.ts';

type SheetEntry = Extract<ManifestEntry, { type: 'spritesheet' }>;
type Animations = SheetEntry['animations'];

/** Widest sheet the packer lays out; mobile GPUs all take 2048 px textures. */
export const MAX_SHEET_WIDTH = 2048;
/** Frame rate for animations whose rate the contract leaves to the art. */
export const DEFAULT_FPS = 6;
/** Portraits keep this much clear space inside the frame, in frame px. */
export const PORTRAIT_PAD = 4;
/** The head is this top share of a figure; frames centre on it so the head holds still. */
const HEAD_SHARE = 0.35;
/** A pose this much taller or shorter than its strip's reference was likely drawn at another scale. */
const HEIGHT_DRIFT = 0.3;

export interface PackOptions {
  /** Rates for animations whose rate the contract leaves open, by name (`idle.fr`) or base (`idle`). */
  readonly fps?: Readonly<Record<string, number>>;
  /** Bundle for a new manifest entry; an existing entry keeps its own. */
  readonly room?: SheetEntry['room'];
}

export interface Packed {
  readonly sheet: Raster;
  readonly entry: SheetEntry;
  readonly issues: readonly Issue[];
}

/** Manifest names of a family's animations in contract order, `fr` before `br`. */
export function animationNames(family: KeyFamily): [string, AnimationSpec][] {
  return Object.entries(family.animations ?? {}).flatMap(([name, spec]) => {
    const facings = { both: ['fr', 'br'], fr: ['fr'], none: [null] }[spec.facings];
    return facings.map((f): [string, AnimationSpec] => [f ? `${name}.${f}` : name, spec]);
  });
}

/** Where a key's sheet lives under assets/: dots become folders. */
export const sheetPath = (key: string): string => `${key.replaceAll('.', '/')}.png`;

interface Frame {
  readonly art: Raster;
  /** Opaque bounds of `art`. */
  readonly box: Box;
}

/** Each pose cropped to its own pixels, keeping a margin for soft edges. */
function figures(panels: readonly Raster[], margin: number): Frame[] {
  return panels.map((panel, i) => {
    const box = opaqueBox(panel);
    if (!box) throw new Error(`pose ${i} is empty`);
    const art = crop(panel, {
      left: box.left - margin,
      top: box.top - margin,
      right: box.right + margin,
      bottom: box.bottom + margin,
    });
    const at = opaqueBox(art);
    if (!at) throw new Error(`pose ${i} is empty`);
    return { art, box: at };
  });
}

function scaled(frame: Frame, scale: number): Frame {
  const art = resize(
    frame.art,
    Math.max(1, Math.round(frame.art.width * scale)),
    Math.max(1, Math.round(frame.art.height * scale)),
  );
  const box = opaqueBox(art) ?? opaqueBox(art, 1);
  if (!box) throw new Error('a pose vanished when scaled down');
  return { art, box };
}

/** Mean x of the opaque pixels in the top of the figure. */
function headCentre({ art, box }: Frame): number {
  const bottom = box.top + Math.max(0, Math.round(boxHeight(box) * HEAD_SHARE) - 1);
  let sum = 0;
  let count = 0;
  for (let y = box.top; y <= bottom; y++) {
    for (let x = box.left; x <= box.right; x++) {
      if (alphaAt(art, x, y) < 128) continue;
      sum += x;
      count++;
    }
  }
  return count > 0 ? sum / count : (box.left + box.right) / 2;
}

interface Placed {
  readonly tile: Raster;
  readonly clipped: number;
}

function placeStanding(frame: Frame, size: readonly [number, number], stance: Stance): Placed {
  const tile = blank(size[0], size[1]);
  const x = Math.round(size[0] / 2 - headCentre(frame));
  const y = stance.baseline - frame.box.bottom;
  return { tile, clipped: blit(tile, frame.art, x, y) };
}

function placeCentred(frame: Frame, size: readonly [number, number]): Placed {
  const tile = blank(size[0], size[1]);
  const x = Math.round(size[0] / 2 - (frame.box.left + frame.box.right + 1) / 2);
  const y = Math.round(size[1] / 2 - (frame.box.top + frame.box.bottom + 1) / 2);
  return { tile, clipped: blit(tile, frame.art, x, y) };
}

/** How much to shrink a strip so its reference pose meets the contract. */
function scaleFor(reference: Box, size: readonly [number, number], stance?: Stance): number {
  if (stance) return stance.standHeight / boxHeight(reference);
  return Math.min(
    (size[0] - 2 * PORTRAIT_PAD) / boxWidth(reference),
    (size[1] - 2 * PORTRAIT_PAD) / boxHeight(reference),
  );
}

interface Strip {
  readonly tiles: Raster[];
  readonly issues: Issue[];
}

/**
 * One animation's frames from its strip: pose 0 is the standing reference that sets the scale
 * (it is not packed), poses 1…n are the frames.
 */
function packStrip(
  name: string,
  strip: Raster,
  spec: AnimationSpec,
  family: KeyFamily & { frame: readonly [number, number] },
): Strip {
  const at = `strips.${name}`;
  const issues: Issue[] = [];
  const cleaned = dropSpecks(removeBackground(strip).raster);
  const split = splitPanels(cleaned.raster, spec.frames + 1);
  if (split.merged > 0) {
    issues.push(
      warning(at, `joined ${split.merged} detached parts to their pose; check the frames`),
    );
  }
  const [reference, ...poses] = figures(split.panels, 2);
  if (!reference) throw new Error(`${at}: no reference pose`);
  const scale = scaleFor(reference.box, family.frame, family.stance);
  if (scale > 1) {
    const need = family.stance
      ? `${family.stance.standHeight} px tall`
      : `${family.frame[0] - 2 * PORTRAIT_PAD} px across`;
    issues.push(
      error(
        at,
        `the reference pose is ${boxWidth(reference.box)} × ${boxHeight(reference.box)} px; draw it at least ${need}, since upscaling blurs the art`,
      ),
    );
    return { tiles: [], issues };
  }
  const tiles = poses.map((pose, i) => {
    const drift = boxHeight(pose.box) / boxHeight(reference.box) - 1;
    if (Math.abs(drift) > HEIGHT_DRIFT) {
      issues.push(
        warning(
          at,
          `pose ${i + 1} is ${Math.round(drift * 100)}% the height of the reference; was it drawn at another scale?`,
        ),
      );
    }
    const small = scaled(pose, scale);
    const placed = family.stance
      ? placeStanding(small, family.frame, family.stance)
      : placeCentred(small, family.frame);
    if (placed.clipped > 0) {
      issues.push(
        error(
          at,
          `frame ${i} loses ${placed.clipped} px outside the ${family.frame[0]} × ${family.frame[1]} frame; draw the pose more compact`,
        ),
      );
    }
    return placed.tile;
  });
  return { tiles, issues };
}

function layout(tiles: readonly Raster[], size: readonly [number, number]): Raster {
  const columns = Math.max(1, Math.min(tiles.length, Math.floor(MAX_SHEET_WIDTH / size[0])));
  const rows = Math.max(1, Math.ceil(tiles.length / columns));
  const sheet = blank(columns * size[0], rows * size[1]);
  tiles.forEach((tile, i) => {
    blit(sheet, tile, (i % columns) * size[0], Math.floor(i / columns) * size[1]);
  });
  return sheet;
}

function rateFor(name: string, spec: AnimationSpec, fps: PackOptions['fps']): number {
  return spec.fps ?? fps?.[name] ?? fps?.[name.split('.')[0] ?? name] ?? DEFAULT_FPS;
}

/**
 * Packs pose strips, one per animation by manifest name, into a sheet for `key` that meets
 * contracts/manifest.ts: frame size, frame counts and order, stance and scale. The result is
 * checked with the same rules as validate:assets.
 */
export function packSheet(
  key: string,
  strips: ReadonlyMap<string, Raster>,
  options: PackOptions = {},
): Packed {
  const family = familyOf(key);
  if (family?.type !== 'spritesheet' || !family.frame) {
    throw new Error(`${key} is not a spritesheet key (ASSETS.md §3)`);
  }
  const sized = { ...family, frame: family.frame };
  const names = animationNames(family);
  const issues: Issue[] = [];
  for (const name of strips.keys()) {
    if (!names.some(([n]) => n === name)) {
      issues.push(
        error(
          `strips.${name}`,
          `not an animation of ${family.id}: use ${names.map(([n]) => n).join(', ')}`,
        ),
      );
    }
  }
  const tiles: Raster[] = [];
  const animations: Animations = {};
  const missing: string[] = [];
  for (const [name, spec] of names) {
    const strip = strips.get(name);
    if (!strip) {
      missing.push(name);
      continue;
    }
    let packed: Strip;
    try {
      packed = packStrip(name, strip, spec, sized);
    } catch (err) {
      issues.push(error(`strips.${name}`, err instanceof Error ? err.message : String(err)));
      continue;
    }
    issues.push(...packed.issues);
    if (packed.tiles.length === 0) continue;
    animations[name] = {
      frames: [tiles.length, tiles.length + packed.tiles.length - 1],
      fps: rateFor(name, spec, options.fps),
      loop: spec.loop ?? false,
    };
    tiles.push(...packed.tiles);
  }
  if (missing.length > 0) issues.push(warning('strips', `no strip yet for ${missing.join(', ')}`));

  const sheet = layout(tiles, family.frame);
  const entry: SheetEntry = {
    key,
    type: 'spritesheet',
    path: sheetPath(key),
    frame: [family.frame[0], family.frame[1]],
    animations,
    room: options.room ?? 'global',
  };
  if (tiles.length === 0) {
    return { sheet, entry, issues: [...issues, error('strips', `nothing to pack for ${key}`)] };
  }
  const contract = [
    ...checkManifest({ version: CONTRACT_VERSION, assets: [entry] }),
    ...checkImageSize(entry, [sheet.width, sheet.height], 'assets[0]'),
    ...checkSheetPixels(entry, sheet, 'assets[0]'),
  ].filter((i) => i.severity === 'error');
  return { sheet, entry, issues: [...issues, ...contract] };
}

/** The manifest with `entry` in place of the one with its key, or appended; the old room stays. */
export function upsertEntry(m: Manifest, entry: SheetEntry): Manifest {
  const at = m.assets.findIndex((a) => a.key === entry.key);
  if (at < 0) return { ...m, assets: [...m.assets, entry] };
  const old = m.assets[at];
  const assets = [...m.assets];
  assets[at] = { ...entry, room: old?.room ?? entry.room };
  return { ...m, assets };
}
