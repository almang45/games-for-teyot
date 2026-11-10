import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveWithoutLinks } from '../../tools/build/no-links';

describe('resolveWithoutLinks', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });
  const makeRoot = (): string => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'rct-links-')));
    roots.push(root);
    mkdirSync(join(root, 'lane', 'ok'), { recursive: true });
    writeFileSync(join(root, 'lane', 'ok', 'a.png'), 'x');
    writeFileSync(join(root, 'secret.png'), 'x');
    return root;
  };

  it('returns plain files inside the root', () => {
    const root = makeRoot();
    expect(resolveWithoutLinks(join(root, 'lane'), 'ok/a.png')).toBe(
      join(root, 'lane', 'ok', 'a.png'),
    );
  });

  it('rejects links in the file or a parent folder, and paths that leave the root', () => {
    const root = makeRoot();
    const lane = join(root, 'lane');
    symlinkSync(join(root, 'secret.png'), join(lane, 'ok', 'b.png'));
    symlinkSync(join(lane, 'ok'), join(lane, 'linked'));
    expect(() => resolveWithoutLinks(lane, 'ok/b.png')).toThrow('goes through a symlink');
    expect(() => resolveWithoutLinks(lane, 'linked/a.png')).toThrow('goes through a symlink');
    expect(() => resolveWithoutLinks(lane, '../secret.png')).toThrow('points outside');
  });

  it('rejects a linked lane folder, but not a linked folder the repo sits in', () => {
    const root = makeRoot();
    symlinkSync(join(root, 'lane'), join(root, 'linked-lane'));
    expect(() => resolveWithoutLinks(root, 'linked-lane/ok/a.png')).toThrow(
      'linked-lane/ok/a.png goes through a symlink',
    );
    symlinkSync(root, `${root}-alias`);
    roots.push(`${root}-alias`);
    expect(resolveWithoutLinks(`${root}-alias`, 'lane/ok/a.png')).toBe(
      join(root, 'lane', 'ok', 'a.png'),
    );
  });
});
