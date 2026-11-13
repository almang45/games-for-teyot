import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { kindOf, REFERENCE_DIR } from './inventory.ts';

/*
 * PRD US-REF-01: key frames from the parents' videos, so agents work from stills (ASSETS.md §1.1).
 * Frames are spread evenly through each video, which suits a 360° turn of a doll as well as a walk
 * through a room. They go to reference/frames/, which is gitignored like the rest of reference/.
 */

export const FRAMES_DIR = 'frames';

export interface Video {
  /** reference-relative, '/'-separated. */
  readonly rel: string;
  readonly size: number;
  readonly mtimeMs: number;
}

/** Every video under `base`, minus the generated frames; hidden files and links are skipped. */
export function findVideos(base: string, prefix = ''): Video[] {
  const videos: Video[] = [];
  for (const entry of readdirSync(join(base, prefix), { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.name.startsWith('.') || rel === FRAMES_DIR) continue;
    if (entry.isDirectory()) videos.push(...findVideos(base, rel));
    else if (entry.isFile() && kindOf(entry.name) === 'video') {
      const { size, mtimeMs } = statSync(join(base, rel));
      videos.push({ rel, size, mtimeMs });
    }
  }
  return videos.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * `bubu/video/turn.mp4` → `frames/bubu/turn`, `rumah/atas-kamar-tidur/x.mp4` →
 * `frames/rumah/atas-kamar-tidur/x`: the subject path without its `video` folder, then the clip.
 */
export function framesDirOf(rel: string): string {
  const parts = rel.split('/');
  const file = parts.pop() ?? rel;
  const folders = parts.at(-1) === 'video' ? parts.slice(0, -1) : parts;
  return [FRAMES_DIR, ...folders, file.slice(0, file.length - extname(file).length)].join('/');
}

/** `count` times spread evenly, each in the middle of its slice, so none falls on the last frame. */
export const frameTimes = (duration: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => (duration * (i + 0.5)) / count);

/** The ffmpeg calls, behind a seam so the planning logic is tested without ffmpeg. */
export interface FrameTools {
  /** Throws when the tools are missing; called once, before the first video is touched. */
  check(): void;
  /** Duration in seconds. */
  probe(file: string): number;
  /** Writes the frame at `at` seconds as a JPEG, its long side at most `maxSide` px. */
  grab(file: string, at: number, out: string, maxSide: number): void;
}

function run(cmd: string, args: readonly string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${cmd} not found: install ffmpeg (brew install ffmpeg)`, { cause: err });
    }
    const stderr = (err as { stderr?: string }).stderr?.trim();
    throw new Error(`${cmd} failed${stderr ? `: ${stderr}` : ''}`, { cause: err });
  }
}

/** The ffmpeg arguments for one still. */
export function grabArgs(file: string, at: number, out: string, maxSide: number): string[] {
  const longSide = `if(gte(iw,ih),min(${maxSide},iw),-2)':'if(gte(iw,ih),-2,min(${maxSide},ih))`;
  return [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-ss',
    at.toFixed(3),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    `scale='${longSide}'`,
    // Phone videos carry GPS and device tags; the stills don't need them.
    '-map_metadata',
    '-1',
    '-q:v',
    '3',
    out,
  ];
}

export const ffmpegTools: FrameTools = {
  check() {
    run('ffprobe', ['-version']);
    run('ffmpeg', ['-version']);
  },
  probe(file) {
    const out = run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    const duration = Number(out.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`ffprobe: no duration for ${file}`);
    }
    return duration;
  },
  grab(file, at, out, maxSide) {
    run('ffmpeg', grabArgs(file, at, out, maxSide));
  },
};

export interface FramesOptions {
  readonly dir?: string;
  readonly count?: number;
  readonly maxSide?: number;
  /** Re-extract even when the frames match the video. */
  readonly force?: boolean;
}

export interface FramesResult {
  readonly source: string;
  /** reference-relative. */
  readonly out: string;
  readonly status: 'written' | 'fresh' | 'failed';
  readonly frames: number;
  readonly message?: string;
}

/** Written next to the frames: re-running skips a video whose stamp still matches. */
const STAMP = 'source.json';
const FRAME = /^frame-\d+\.jpg$/;
/** New frames are made in `.<clip>.partial` first, so a failed run keeps the old ones. */
const STAGING = '.partial';

interface Stamp {
  readonly source: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly count: number;
  readonly maxSide: number;
}

/** The parsed stamp, or undefined when there is none or it isn't JSON. Other errors are thrown. */
function readStamp(dir: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, STAMP), 'utf8')) as unknown;
  } catch (err) {
    if (err instanceof SyntaxError || (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

function isFresh(target: string, stamp: Stamp): boolean {
  if (!statSync(target, { throwIfNoEntry: false })) return false;
  const old = readStamp(target);
  if (typeof old !== 'object' || old === null) return false;
  const same = (Object.keys(stamp) as (keyof Stamp)[]).every(
    (k) => (old as Record<string, unknown>)[k] === stamp[k],
  );
  return same && readdirSync(target).filter((n) => FRAME.test(n)).length === stamp.count;
}

const frameName = (i: number): string => `frame-${String(i + 1).padStart(2, '0')}.jpg`;

/** Grabs every frame into a staging folder, then swaps it in for the old frames and stamp. */
function writeFrames(file: string, target: string, stamp: Stamp, tools: FrameTools): number {
  const times = frameTimes(tools.probe(file), stamp.count);
  // Hidden, so no clip's own frames folder can share its name.
  const staging = join(dirname(target), `.${basename(target)}${STAGING}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    times.forEach((at, i) => {
      const out = join(staging, frameName(i));
      tools.grab(file, at, out, stamp.maxSide);
      // ffmpeg can exit 0 without a frame, e.g. when `at` is past the last decodable picture.
      if (!statSync(out, { throwIfNoEntry: false })?.size) {
        throw new Error(`ffmpeg wrote no frame at ${at.toFixed(3)} s`);
      }
    });
    mkdirSync(target, { recursive: true });
    for (const name of readdirSync(target)) {
      if (FRAME.test(name) || name === STAMP) rmSync(join(target, name));
    }
    for (const name of readdirSync(staging)) renameSync(join(staging, name), join(target, name));
    writeFileSync(join(target, STAMP), `${JSON.stringify(stamp, null, 2)}\n`);
    return times.length;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Extracts key frames from every video under reference/. One failing video doesn't stop the rest;
 * a missing ffmpeg stops the run before any frames are touched.
 */
export function extractFrames(
  root: string,
  { dir = REFERENCE_DIR, count = 12, maxSide = 1600, force = false }: FramesOptions = {},
  tools: FrameTools = ffmpegTools,
): FramesResult[] {
  const base = join(root, dir);
  if (!statSync(base, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${dir}/ is missing: link it to the Google Drive mirror (ASSETS.md §1.1)`);
  }
  const videos = findVideos(base);
  // Case-folded: the Drive mirror sits on a case-insensitive file system.
  const sharing = new Map<string, string[]>();
  for (const v of videos) {
    const key = framesDirOf(v.rel).toLowerCase();
    sharing.set(key, [...(sharing.get(key) ?? []), v.rel]);
  }
  let checked = false;
  return videos.map((video): FramesResult => {
    const out = framesDirOf(video.rel);
    const failed = (message: string): FramesResult => ({
      source: video.rel,
      out,
      status: 'failed',
      frames: 0,
      message,
    });
    const others = (sharing.get(out.toLowerCase()) ?? []).filter((rel) => rel !== video.rel);
    if (others.length > 0) {
      return failed(`${out}/ would also hold ${others.join(', ')}: rename one of the videos`);
    }
    const target = join(base, out);
    const stamp: Stamp = {
      source: video.rel,
      size: video.size,
      mtimeMs: video.mtimeMs,
      count,
      maxSide,
    };
    try {
      if (!force && isFresh(target, stamp)) {
        return { source: video.rel, out, status: 'fresh', frames: count };
      }
    } catch (err) {
      return failed(messageOf(err));
    }
    if (!checked) {
      tools.check();
      checked = true;
    }
    try {
      return {
        source: video.rel,
        out,
        status: 'written',
        frames: writeFrames(join(base, video.rel), target, stamp, tools),
      };
    } catch (err) {
      return failed(messageOf(err));
    }
  });
}
