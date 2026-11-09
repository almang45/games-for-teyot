import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { distFiles } from '../../tools/build/dist-files.mjs';

describe('distFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rct-dist-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists nested files with posix paths and sizes', () => {
    mkdirSync(join(dir, 'static'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, 'static', 'a.js'), 'x'.repeat(10));
    const files = distFiles(dir).sort((a, b) => a.path.localeCompare(b.path));
    expect(files).toEqual([
      { path: 'index.html', bytes: 15, symlink: false },
      { path: 'static/a.js', bytes: 10, symlink: false },
    ]);
  });

  it('flags a symlink with an innocent name instead of following it', () => {
    const outside = mkdtempSync(join(tmpdir(), 'rct-recordings-'));
    try {
      writeFileSync(join(outside, 'raw.webm'), 'raw voice');
      mkdirSync(join(dir, 'audio'));
      symlinkSync(join(outside, 'raw.webm'), join(dir, 'audio', 'kamar.webm'));
      expect(distFiles(dir)).toEqual([{ path: 'audio/kamar.webm', bytes: 0, symlink: true }]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
