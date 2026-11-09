import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { error, warning } from '../../contracts/common.ts';
import { checkHouseLayout, houseLayout, type HouseLayout } from '../../contracts/houseLayout.ts';
import {
  checkImageSize,
  checkManifest,
  manifest,
  type Manifest,
  type ManifestEntry,
} from '../../contracts/manifest.ts';
import { decodePng, readPngHeader } from '../build/png.ts';
import { checkColoringPage } from './coloring.ts';
import {
  inFile,
  laneFiles,
  parseJsonFile,
  symlinkIssue,
  type FileIssue,
  type Parsed,
  type Report,
} from './lane.ts';

export const ASSETS_LANE = 'assets';
export const MANIFEST_FILE = `${ASSETS_LANE}/manifest.json`;

/** Reference sheets (ASSETS.md §3) are review material: committed, never registered or shipped. */
const UNREGISTERED_PREFIXES = [`${ASSETS_LANE}/style/`];

/** The manifest, if `assets/` has one. Shared with validate:design for its cross-lane checks. */
export function loadManifest(root: string): Parsed<Manifest> | undefined {
  if (!existsSync(join(root, MANIFEST_FILE))) return undefined;
  return parseJsonFile(root, MANIFEST_FILE, manifest);
}

const WOFF2_MAGIC = 'wOF2';

function checkLayout(root: string, file: string, m: Manifest): FileIssue[] {
  const parsed = parseJsonFile<HouseLayout>(root, file, houseLayout);
  if (!parsed.ok) return parsed.issues;
  const layout = parsed.value;
  const keys = new Set(m.assets.map((a) => a.key));
  const issues = checkHouseLayout(layout).map(inFile(file));
  layout.occluders.forEach((o, i) => {
    if (!keys.has(o.key))
      issues.push({ ...error(`occluders[${i}].key`, `${o.key} is not in the manifest`), file });
  });
  for (const room of layout.rooms) {
    if (!keys.has(`house.rooms.${room.id}`)) {
      issues.push({ ...warning('rooms', `house.rooms.${room.id} is not delivered yet`), file });
    }
  }
  return issues;
}

function checkEntryFile(root: string, entry: ManifestEntry, at: string, m: Manifest): FileIssue[] {
  const file = `${ASSETS_LANE}/${entry.path}`;
  const full = join(root, file);
  if (!existsSync(full))
    return [{ ...error(`${at}.path`, `${file} does not exist`), file: MANIFEST_FILE }];
  // Already reported by the lane listing; never read through the link.
  if (lstatSync(full).isSymbolicLink()) return [];
  try {
    switch (entry.type) {
      case 'layout':
        return checkLayout(root, file, m);
      case 'font':
        return readFileSync(full).toString('ascii', 0, 4) === WOFF2_MAGIC
          ? []
          : [{ ...error('', 'not a WOFF2 font'), file }];
      case 'coloring': {
        const png = decodePng(readFileSync(full));
        const sized = checkImageSize(entry, [png.width, png.height], at).map(inFile(MANIFEST_FILE));
        return [...sized, ...checkColoringPage(png, '').issues.map(inFile(file))];
      }
      default: {
        const { width, height } = readPngHeader(readFileSync(full));
        return checkImageSize(entry, [width, height], at).map(inFile(MANIFEST_FILE));
      }
    }
  } catch (err) {
    // A broken file is a finding about that file, not a crash of the whole run.
    return [{ ...error('', err instanceof Error ? err.message : String(err)), file }];
  }
}

/** validate:assets: the manifest, every registered file, and nothing unregistered. */
export function validateAssets(root: string): Report {
  const files = laneFiles(root, ASSETS_LANE);
  const report = (issues: FileIssue[]): Report => ({
    lane: ASSETS_LANE,
    files: files.length,
    issues,
  });
  if (files.length === 0) return report([]);

  const issues: FileIssue[] = files.filter((f) => f.symlink).map(symlinkIssue);
  const parsed = loadManifest(root);
  if (!parsed)
    return report([
      ...issues,
      { ...error('', 'assets/ needs a manifest.json'), file: MANIFEST_FILE },
    ]);
  if (!parsed.ok) return report([...issues, ...parsed.issues]);

  const m = parsed.value;
  issues.push(...checkManifest(m).map(inFile(MANIFEST_FILE)));
  m.assets.forEach((entry, i) => issues.push(...checkEntryFile(root, entry, `assets[${i}]`, m)));

  const registered = new Set([MANIFEST_FILE, ...m.assets.map((a) => `${ASSETS_LANE}/${a.path}`)]);
  for (const f of files) {
    const reference = UNREGISTERED_PREFIXES.some((p) => f.path.startsWith(p));
    if (!f.symlink && !reference && !registered.has(f.path)) {
      issues.push({ ...error('', 'not registered in assets/manifest.json'), file: f.path });
    }
  }
  return report(issues);
}
