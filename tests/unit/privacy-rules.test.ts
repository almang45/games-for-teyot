import { describe, expect, it } from 'vitest';
import { violation } from '../../tools/build/privacy-rules.mjs';

describe('privacy rules (US-PRIV-01)', () => {
  it.each([
    'index.html',
    '_headers',
    'robots.txt',
    'manifest.webmanifest',
    'sw.js',
    'static/index-abc123.js',
    'static/index-abc123.css',
    'icons/icon-512.png',
    'rooms/kamar/atlas.webp',
    'audio/rooms/kamar.webm',
  ])('ships %s', (path) => {
    expect(violation(path)).toBeNull();
  });

  it.each([
    ['audio/voice-note.ogg', /not allow-listed/],
    ['audio/mama.opus', /not allow-listed/],
    ['static/clip.3gp', /not allow-listed/],
    ['static/clip.aac', /not allow-listed/],
    ['static/photo.tiff', /not allow-listed/],
    ['static/photo.avif', /not allow-listed/],
    ['static/photo.JPG', /not allow-listed/],
    ['static/index.js.map', /not allow-listed/],
    ['LICENSE', /\(none\)/],
    ['static/intro.webm', /outside audio/],
    ['reference/house/front.png', /private folder/],
    ['static/Recordings/a.webm', /private folder/],
  ])('blocks %s', (path, reason) => {
    expect(violation(path)).toMatch(reason);
  });
});
