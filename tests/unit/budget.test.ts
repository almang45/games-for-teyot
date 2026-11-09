import { describe, expect, it } from 'vitest';
import {
  BUDGETS,
  ROOM_PREFIXES,
  ROOM_URL_PATTERN,
  evaluateBudget,
  roomOf,
} from '../../tools/build/budget.mjs';

const MB = 1024 * 1024;

describe('roomOf', () => {
  it.each([
    ['rooms/kamar/atlas.webp', 'kamar'],
    ['audio/rooms/kamar.webm', 'kamar'],
    ['audio/rooms/dapur/lagu.webm', 'dapur'],
    ['static/index-abc.js', undefined],
    ['audio/boot.webm', undefined],
    ['rooms/', undefined],
  ] as const)('%s → %s', (path, room) => {
    expect(roomOf(path)).toBe(room);
  });
});

describe('ROOM_URL_PATTERN', () => {
  it('matches the same paths as ROOM_PREFIXES, and nothing else', () => {
    for (const prefix of ROOM_PREFIXES) {
      expect(ROOM_URL_PATTERN.test(`https://rct.amns.my.id/${prefix}kamar/a.webp`)).toBe(true);
    }
    for (const path of ['static/rooms.js', 'audio/boot.webm', 'house/rooms/x.png']) {
      expect(ROOM_URL_PATTERN.test(`https://rct.amns.my.id/${path}`), path).toBe(false);
    }
  });
});

describe('evaluateBudget (ARCHITECTURE §10, NFR-PERF-02)', () => {
  it('passes a build within every budget and reports room sizes', () => {
    const result = evaluateBudget([
      { path: 'index.html', bytes: 1000 },
      { path: 'rooms/kamar/atlas.webp', bytes: 2 * MB },
      { path: 'audio/rooms/kamar.webm', bytes: 1 * MB },
    ]);
    expect(result.failures).toEqual([]);
    expect(result.firstLoadBytes).toBe(1000);
    expect(result.rooms).toEqual({ kamar: 3 * MB });
  });

  it('fails a room whose files are each under 4 MB but add up to more', () => {
    const result = evaluateBudget([
      { path: 'rooms/kamar/atlas.webp', bytes: 3.9 * MB },
      { path: 'audio/rooms/kamar.webm', bytes: 3.9 * MB },
    ]);
    expect(result.failures).toEqual(['room kamar 7.8 MB > 4 MB']);
  });

  it('fails first load and total', () => {
    const result = evaluateBudget([
      { path: 'static/big.js', bytes: BUDGETS.firstLoadBytes + 1 },
      ...Array.from({ length: 16 }, (_, i) => ({ path: `rooms/r${i}/a.webp`, bytes: 3.9 * MB })),
    ]);
    expect(result.failures).toEqual(['first load 3 MB > 3 MB', 'total 65.4 MB > 60 MB']);
  });
});
