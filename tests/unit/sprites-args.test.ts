import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inside, parseRates, stripName } from '../../tools/sprites/args';

describe('parseRates', () => {
  it('reads animation=fps pairs into a map', () => {
    expect([...parseRates(['idle=6', 'walk.fr=8', 'tuck-in=4'])]).toEqual([
      ['idle', 6],
      ['walk.fr', 8],
      ['tuck-in', 4],
    ]);
  });

  it.each(['__proto__=6', 'idle', 'idle=0', 'idle=31', 'idle=6.5', 'idle=6=7', '=6', 'walk.xx=8'])(
    'refuses %s',
    (pair) => {
      expect(() => parseRates([pair])).toThrow(`--fps takes <animation>=<1–30>, got ${pair}`);
    },
  );
});

describe('inside', () => {
  const base = resolve('/srv/assets');

  it('resolves paths under the base', () => {
    expect(inside(base, 'character/theia/default.png')).toBe(
      join(base, 'character', 'theia', 'default.png'),
    );
    expect(inside('/srv/assets/', `${base}${sep}ui`)).toBe(join(base, 'ui'));
  });

  it.each(['../secrets.txt', '/etc/passwd', '.', `${base}-other${sep}x.png`])(
    'refuses %s',
    (path) => {
      expect(() => inside(base, path)).toThrow(/is outside/);
    },
  );
});

describe('stripName', () => {
  it('names the animation a strip holds', () => {
    expect(stripName('walk.fr.png')).toBe('walk.fr');
    expect(stripName('talk.png')).toBe('talk');
    expect(stripName('tuck-in.fr.png')).toBe('tuck-in.fr');
  });

  it('ignores files that are not strips', () => {
    expect(stripName('Walk.fr.png')).toBeUndefined();
    expect(stripName('../walk.fr.png')).toBeUndefined();
    expect(stripName('walk.fr.png.bak')).toBeUndefined();
    expect(stripName('walk.left.png')).toBeUndefined();
  });
});
