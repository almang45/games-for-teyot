import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
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

export const ffmpegTools: FrameTools = {
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
    const longSide = `if(gte(iw,ih),min(${maxSide},iw),-2)':'if(gte(iw,ih),-2,min(${maxSide},ih))`;
    run('ffmpeg', [
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
    ]);
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

interface Stamp {
  readonly source: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly count: number;
  readonly maxSide: number;
}

function readStamp(dir: string): Stamp | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, STAMP), 'utf8')) as Stamp;
  } catch {
    // No stamp, or a broken one: either way the frames are re-extracted.
    return undefined;
  }
}

const frameName = (i: number): string => `frame-${String(i + 1).padStart(2, '0')}.jpg`;

/** Extracts key frames from every video under reference/. One failing video doesn't stop the rest. */
export function extractFrames(
  root: string,
  { dir = REFERENCE_DIR, count = 12, maxSide = 1600, force = false }: FramesOptions = {},
  tools: FrameTools = ffmpegTools,
): FramesResult[] {
  const base = join(root, dir);
  if (!statSync(base, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${dir}/ is missing: link it to the Google Drive mirror (ASSETS.md §1.1)`);
  }
  return findVideos(base).map((video): FramesResult => {
    const out = framesDirOf(video.rel);
    const target = join(base, out);
    const stamp: Stamp = {
      source: video.rel,
      size: video.size,
      mtimeMs: video.mtimeMs,
      count,
      maxSide,
    };
    const old = readStamp(target);
    const have = statSync(target, { throwIfNoEntry: false })
      ? readdirSync(target).filter((n) => FRAME.test(n)).length
      : 0;
    const fresh =
      old !== undefined &&
      (Object.keys(stamp) as (keyof Stamp)[]).every((k) => old[k] === stamp[k]) &&
      have === count;
    if (fresh && !force) return { source: video.rel, out, status: 'fresh', frames: count };
    try {
      mkdirSync(target, { recursive: true });
      for (const name of readdirSync(target)) {
        if (FRAME.test(name) || name === STAMP) rmSync(join(target, name));
      }
      const file = join(base, video.rel);
      const times = frameTimes(tools.probe(file), count);
      times.forEach((at, i) => {
        tools.grab(file, at, join(target, frameName(i)), maxSide);
      });
      writeFileSync(join(target, STAMP), `${JSON.stringify(stamp, null, 2)}\n`);
      return { source: video.rel, out, status: 'written', frames: times.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { source: video.rel, out, status: 'failed', frames: 0, message };
    }
  });
}
