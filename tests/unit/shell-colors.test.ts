import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cssHex, placeholderPalette } from '../../src/placeholder/palette';

const read = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const paletteHex = new Set(
  Object.values(placeholderPalette).map((c) => (typeof c === 'number' ? cssHex(c) : c)),
);

describe('shell colors come from the placeholder palette', () => {
  it('formats palette numbers as CSS hex', () => {
    expect(cssHex(0xfff4e6)).toBe('#fff4e6');
    expect(cssHex(0x00ff00)).toBe('#00ff00');
  });

  it('styles.css uses only palette colors, and the page background is the sky', () => {
    const css = read('src/styles.css');
    const used = css.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
    expect(used.length).toBeGreaterThan(0);
    for (const color of used) expect(paletteHex, color).toContain(color.toLowerCase());
    expect(css).toContain(`background: ${cssHex(placeholderPalette.sky)};`);
  });

  it('index.html leaves theme-color to the build, with no literal color of its own', () => {
    const html = read('index.html');
    expect(html).toContain('content="__SHELL_COLOR__"');
    expect(html).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});
