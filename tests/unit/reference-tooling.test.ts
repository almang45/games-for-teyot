import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkReference, kindOf, NEEDS } from '../../tools/inputs/inventory';
import {
  extractFrames,
  ffmpegTools,
  findVideos,
  frameTimes,
  framesDirOf,
  type FrameTools,
} from '../../tools/inputs/keyframes';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rct-ref-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Empty stand-ins: the tools only look at names, never at contents. */
function touch(...rels: string[]): void {
  for (const rel of rels) {
    const file = join(root, 'reference', rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'x');
  }
}

/** Everything ASSETS.md §1.2 asks for, the minimum of each. */
function complete(): void {
  touch(
    'theia/front/1.jpg',
    'theia/side/1.JPG',
    'theia/full-body/1.jpeg',
    'mama/front/1.jpg',
    'mama/full-body/1.png',
    'papa/front/1.heic',
    'papa/full-body/1.jpg',
    'rumah/denah/sketsa.png',
    'rumah/atas-kamar-tidur/1.jpg',
    'rumah/atas-kamar-tidur/2.jpg',
    'rumah/bawah-dapur/1.jpg',
    'rumah/bawah-dapur/2.jpg',
    'rumah/bawah-ruang-keluarga/1.jpg',
    'rumah/bawah-ruang-keluarga/2.jpg',
    'rumah/mezzanine-1-kantor-papa/1.jpg',
    'rumah/mezzanine-1-kantor-papa/2.jpg',
    'rumah/mezzanine-2-kamar-anak/1.jpg',
    'rumah/mezzanine-2-kamar-anak/2.jpg',
    ...['bubu', 'ocica'].flatMap((d) => [
      `${d}/front/1.jpg`,
      `${d}/side/1.jpg`,
      `${d}/back/1.jpg`,
      `${d}/video/turn.mp4`,
    ]),
  );
}

const lines = (r: ReturnType<typeof checkReference>): string[] =>
  r.issues.map((i) => `${i.severity} ${i.path}: ${i.message}`);

describe('US-REF-01 reference:check', () => {
  it('tells photos and videos apart by extension, in any case', () => {
    expect(['a.JPG', 'b.heic', 'c.MOV', 'd.mp4', 'e.json', 'f'].map(kindOf)).toEqual([
      'image',
      'image',
      'video',
      'video',
      undefined,
      undefined,
    ]);
  });

  it('reports nothing when every item of ASSETS.md §1.2 is there', () => {
    complete();
    const report = checkReference(root);
    expect(lines(report)).toEqual([]);
    expect(report.files).toBe(26);
  });

  it('lists what is missing, with what it is for', () => {
    complete();
    rmSync(join(root, 'reference/theia/side'), { recursive: true });
    rmSync(join(root, 'reference/rumah/bawah-dapur/2.jpg'));
    rmSync(join(root, 'reference/bubu/video'), { recursive: true });
    // Not media: a note and a Finder file don't count.
    touch('mama/front/.DS_Store', 'rumah/denah/floorplan.json');
    rmSync(join(root, 'reference/mama/front/1.jpg'));
    expect(lines(checkReference(root))).toEqual([
      'error theia/side: 0 of 1 photo: her face from the side (character reference sheet)',
      'error theia: 2 of 3 photos: 3–6 photos of her in all (character reference sheet)',
      "error mama/front: 0 of 1 photo: a photo of mama's face (parents reference sheet)",
      'error rumah/<lantai>-dapur: 1 of 2 photos: photos of dapur: key furniture and colours (room art)',
      'warning bubu/video: 0 of 1 video: a 360° turn video of bubu (companion reference sheet)',
    ]);
  });

  it('finds a room on any storey, and counts photos in subfolders', () => {
    complete();
    rmSync(join(root, 'reference/rumah/bawah-dapur'), { recursive: true });
    touch('rumah/atas-dapur/pagi/1.jpg', 'rumah/atas-dapur/malam/1.jpg');
    expect(lines(checkReference(root))).toEqual([]);
  });

  it('skips links inside the folder', () => {
    complete();
    rmSync(join(root, 'reference/rumah/denah/sketsa.png'));
    symlinkSync(
      join(root, 'reference/theia/front/1.jpg'),
      join(root, 'reference/rumah/denah/l.jpg'),
    );
    expect(lines(checkReference(root))[0]).toMatch(/^error rumah\/denah: 0 of 1 photo/);
  });

  it('fails when reference/ is not linked', () => {
    expect(lines(checkReference(root))).toEqual([
      'error : reference/ is missing: link it to the Google Drive mirror (ASSETS.md §1.1)',
    ]);
  });

  it('covers every room in the contract', () => {
    expect(NEEDS.filter((n) => n.use === 'room art').map((n) => n.where)).toEqual([
      'rumah/<lantai>-kamar-tidur',
      'rumah/<lantai>-dapur',
      'rumah/<lantai>-ruang-keluarga',
      'rumah/<lantai>-kantor-papa',
      'rumah/<lantai>-kamar-anak',
    ]);
  });
});

/** Writes a placeholder frame and records each call. */
function fakeTools(durations: Record<string, number> = {}): FrameTools & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    probe(file) {
      const name = file.slice(file.lastIndexOf('/') + 1);
      const d = durations[name] ?? 10;
      if (d <= 0) throw new Error(`ffprobe: no duration for ${name}`);
      return d;
    },
    grab(file, at, out, maxSide) {
      calls.push(`${file.slice(file.indexOf('reference/'))}@${at.toFixed(2)}:${maxSide}`);
      writeFileSync(out, 'jpg');
    },
  };
}

describe('US-REF-01 reference:frames', () => {
  it('finds every video but the generated frames, hidden files and links', () => {
    touch(
      'bubu/video/turn.MP4',
      'rumah/atas-kamar-tidur/kamar.mov',
      'rumah/atas-kamar-tidur/1.jpg',
      'frames/bubu/turn/old.mp4',
      'theia/video/.trashed-1.mp4',
    );
    symlinkSync(join(root, 'reference/bubu/video/turn.MP4'), join(root, 'reference/link.mp4'));
    const videos = findVideos(join(root, 'reference'));
    expect(videos.map((v) => v.rel)).toEqual([
      'bubu/video/turn.MP4',
      'rumah/atas-kamar-tidur/kamar.mov',
    ]);
    expect(videos[0]?.size).toBe(1);
  });

  it('names the frames folder after the subject and the clip', () => {
    expect(framesDirOf('bubu/video/PXL_1.TS.mp4')).toBe('frames/bubu/PXL_1.TS');
    expect(framesDirOf('rumah/atas-kamar-tidur/kamar-tidur.mp4')).toBe(
      'frames/rumah/atas-kamar-tidur/kamar-tidur',
    );
    expect(framesDirOf('lepas.mov')).toBe('frames/lepas');
  });

  it('spreads the frames evenly and never on the last one', () => {
    expect(frameTimes(12, 4)).toEqual([1.5, 4.5, 7.5, 10.5]);
  });

  it('writes frames once, then skips the video until it changes', () => {
    touch('bubu/video/turn.mp4');
    const tools = fakeTools();
    const first = extractFrames(root, { count: 3, maxSide: 800 }, tools);
    expect(first).toEqual([
      { source: 'bubu/video/turn.mp4', out: 'frames/bubu/turn', status: 'written', frames: 3 },
    ]);
    expect(tools.calls).toEqual([
      'reference/bubu/video/turn.mp4@1.67:800',
      'reference/bubu/video/turn.mp4@5.00:800',
      'reference/bubu/video/turn.mp4@8.33:800',
    ]);
    const dir = join(root, 'reference/frames/bubu/turn');
    expect(readdirSync(dir).sort()).toEqual([
      'frame-01.jpg',
      'frame-02.jpg',
      'frame-03.jpg',
      'source.json',
    ]);
    expect(JSON.parse(readFileSync(join(dir, 'source.json'), 'utf8'))).toMatchObject({
      source: 'bubu/video/turn.mp4',
      count: 3,
      maxSide: 800,
    });

    expect(extractFrames(root, { count: 3, maxSide: 800 }, tools)[0]?.status).toBe('fresh');
    expect(extractFrames(root, { count: 3, maxSide: 800, force: true }, tools)[0]?.status).toBe(
      'written',
    );
    utimesSync(join(root, 'reference/bubu/video/turn.mp4'), new Date(0), new Date(0));
    expect(extractFrames(root, { count: 3, maxSide: 800 }, tools)[0]?.status).toBe('written');
  });

  it('drops the old frames when fewer are asked for', () => {
    touch('bubu/video/turn.mp4');
    extractFrames(root, { count: 4 }, fakeTools());
    const [r] = extractFrames(root, { count: 2 }, fakeTools());
    expect(r?.status).toBe('written');
    const dir = join(root, 'reference/frames/bubu/turn');
    expect(readdirSync(dir).filter((n) => n.endsWith('.jpg'))).toEqual([
      'frame-01.jpg',
      'frame-02.jpg',
    ]);
  });

  it('re-extracts when a frame or the stamp is lost', () => {
    touch('bubu/video/turn.mp4');
    extractFrames(root, { count: 2 }, fakeTools());
    const dir = join(root, 'reference/frames/bubu/turn');
    rmSync(join(dir, 'frame-02.jpg'));
    expect(extractFrames(root, { count: 2 }, fakeTools())[0]?.status).toBe('written');
    writeFileSync(join(dir, 'source.json'), '{broken');
    expect(extractFrames(root, { count: 2 }, fakeTools())[0]?.status).toBe('written');
  });

  it('reports a video it cannot read and carries on with the rest', () => {
    touch('bubu/video/rusak.mp4', 'ocica/video/turn.mp4');
    const results = extractFrames(root, { count: 2 }, fakeTools({ 'rusak.mp4': 0 }));
    expect(results.map((r) => [r.source, r.status, r.message])).toEqual([
      ['bubu/video/rusak.mp4', 'failed', 'ffprobe: no duration for rusak.mp4'],
      ['ocica/video/turn.mp4', 'written', undefined],
    ]);
  });

  it('fails when reference/ is not linked', () => {
    expect(() => extractFrames(root, {}, fakeTools())).toThrow('reference/ is missing');
  });

  const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

  it.skipIf(!hasFfmpeg)('extracts real frames with ffmpeg, without metadata', () => {
    const video = join(root, 'reference/bubu/video/turn.mp4');
    mkdirSync(dirname(video), { recursive: true });
    const made = spawnSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=320x240:rate=10',
      '-metadata',
      'location=+00.0000+000.0000/',
      '-pix_fmt',
      'yuv420p',
      video,
    ]);
    expect(made.status).toBe(0);
    const [r] = extractFrames(root, { count: 3, maxSide: 160 });
    expect(r?.status).toBe('written');
    const frame = join(root, 'reference/frames/bubu/turn/frame-01.jpg');
    expect(existsSync(frame)).toBe(true);
    const probe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=width,height:format_tags', '-of', 'json', frame],
      { encoding: 'utf8' },
    );
    const info = JSON.parse(probe.stdout) as {
      streams: { width: number; height: number }[];
      format: { tags?: Record<string, string> };
    };
    expect(info.streams[0]).toMatchObject({ width: 160, height: 120 });
    expect(info.format.tags?.location).toBeUndefined();
  });

  it('explains a missing ffmpeg', () => {
    const path = process.env.PATH;
    process.env.PATH = '';
    try {
      expect(() => ffmpegTools.probe('x.mp4')).toThrow('ffprobe not found: install ffmpeg');
    } finally {
      process.env.PATH = path;
    }
  });

  it.skipIf(!hasFfmpeg)('reports what ffmpeg says when a file is not a video', () => {
    touch('bubu/video/bukan.mp4');
    expect(() => ffmpegTools.probe(join(root, 'reference/bubu/video/bukan.mp4'))).toThrow(
      /^ffprobe failed: /,
    );
  });
});
