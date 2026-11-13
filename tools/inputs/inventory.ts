import { readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { error, warning } from '../../contracts/common.ts';
import { ROOM_IDS } from '../../contracts/rooms.ts';
import type { FileIssue, Report } from '../validate/lane.ts';

/*
 * PRD US-REF-01: what the parents still need to provide, against ASSETS.md §1.2. Only counts
 * files by folder and extension; it never opens a photo or video.
 */

/** The gitignored link to the Google Drive mirror (ASSETS.md §1.1). */
export const REFERENCE_DIR = 'reference';
export const LANE = 'reference';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.3gp', '.webm', '.mkv']);

/** Storey prefixes of room folders, `rumah/<lantai>-<room-id>` (ASSETS.md §1.1). */
export const LANTAI = ['bawah', 'mezzanine-1', 'atas', 'mezzanine-2'] as const;

export type MediaKind = 'image' | 'video';

/** A photo or a video by its extension, any case; anything else is not reference media. */
export function kindOf(name: string): MediaKind | undefined {
  const ext = extname(name).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return undefined;
}

/** One line of ASSETS.md §1.2, made countable. */
export interface Need {
  /** Where to add the files, as reported. */
  readonly where: string;
  /** Folders under reference/ whose files count toward it. */
  readonly folders: readonly string[];
  readonly kind: MediaKind;
  readonly min: number;
  /** What to provide. */
  readonly what: string;
  /** What the agents make from it. */
  readonly use: string;
  /** Recommended, not required: a missing one is a warning. */
  readonly optional: boolean;
}

const need = (
  where: string,
  min: number,
  what: string,
  use: string,
  more: Partial<Pick<Need, 'folders' | 'kind' | 'optional'>> = {},
): Need => ({ where, folders: [where], kind: 'image', optional: false, min, what, use, ...more });

const CHARACTER = 'character reference sheet';
const PARENTS = 'parents reference sheet';
const COMPANION = 'companion reference sheet';

const parent = (who: string): Need[] => [
  need(`${who}/front`, 1, `a photo of ${who}'s face`, PARENTS),
  need(`${who}/full-body`, 1, `a full-body photo of ${who}`, PARENTS),
];

const doll = (who: string): Need[] => [
  need(`${who}/front`, 1, `${who} from the front`, COMPANION),
  need(`${who}/side`, 1, `${who} from the side`, COMPANION),
  need(`${who}/back`, 1, `${who} from the back`, COMPANION),
  need(`${who}/video`, 1, `a 360° turn video of ${who}`, COMPANION, {
    kind: 'video',
    optional: true,
  }),
];

export const NEEDS: readonly Need[] = [
  need('theia/front', 1, 'her face from the front', CHARACTER),
  need('theia/side', 1, 'her face from the side', CHARACTER),
  need('theia/full-body', 1, 'her full body, typical hairstyle and favourite clothes', CHARACTER),
  need('theia', 3, '3–6 photos of her in all', CHARACTER, {
    folders: ['theia/front', 'theia/side', 'theia/back', 'theia/full-body'],
  }),
  ...parent('mama'),
  ...parent('papa'),
  need(
    'rumah/denah',
    1,
    'a floor plan sketch: room names and positions, stairs, doors',
    'house layout',
  ),
  // "A few photos per room": two at least, in whichever storey folder the room is on.
  ...ROOM_IDS.map((id) =>
    need(`rumah/<lantai>-${id}`, 2, `photos of ${id}: key furniture and colours`, 'room art', {
      folders: LANTAI.map((l) => `rumah/${l}-${id}`),
    }),
  ),
  ...doll('bubu'),
  ...doll('ocica'),
];

/** Media files under a folder, recursively; hidden files and links are skipped. */
function countMedia(dir: string): Record<MediaKind, number> {
  const counts: Record<MediaKind, number> = { image: 0, video: 0 };
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return counts;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      const inner = countMedia(join(dir, entry.name));
      counts.image += inner.image;
      counts.video += inner.video;
    } else if (entry.isFile()) {
      const kind = kindOf(entry.name);
      if (kind) counts[kind] += 1;
    }
  }
  return counts;
}

/** Lists every §1.2 item that is short of files; an empty report means nothing is missing. */
export function checkReference(root: string, dir = REFERENCE_DIR): Report {
  const base = join(root, dir);
  if (!statSync(base, { throwIfNoEntry: false })?.isDirectory()) {
    const message = `${dir}/ is missing: link it to the Google Drive mirror (ASSETS.md §1.1)`;
    return { lane: LANE, files: 0, issues: [{ ...error('', message), file: dir }] };
  }
  const counted = new Map<string, Record<MediaKind, number>>();
  const countOf = (folder: string): Record<MediaKind, number> => {
    let counts = counted.get(folder);
    if (!counts) {
      counts = countMedia(join(base, folder));
      counted.set(folder, counts);
    }
    return counts;
  };
  const issues: FileIssue[] = [];
  for (const n of NEEDS) {
    const have = n.folders.reduce((sum, f) => sum + countOf(f)[n.kind], 0);
    if (have >= n.min) continue;
    const noun = n.kind === 'image' ? 'photo' : 'video';
    const message = `${have} of ${n.min} ${noun}${n.min > 1 ? 's' : ''}: ${n.what} (${n.use})`;
    const issue = n.optional ? warning(n.where, message) : error(n.where, message);
    issues.push({ ...issue, file: `${dir}/${n.where}` });
  }
  const files = [...counted.values()].reduce((sum, c) => sum + c.image + c.video, 0);
  return { lane: LANE, files, issues };
}
