// @vitest-environment happy-dom
import type * as Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { markActiveScene, provideServices, servicesOf } from '../../src/game/services';
import { createAppLog } from '../../src/log';
import { placeholderRooms } from '../../src/placeholder/house';

function fakeRegistry() {
  const store = new Map<string, unknown>();
  return { set: (k: string, v: unknown) => store.set(k, v), get: (k: string) => store.get(k) };
}

describe('game services', () => {
  it('round-trips through the registry', () => {
    const registry = fakeRegistry();
    const services = { logger: createAppLog('s', false).logger, audio: {} as AudioContext };
    provideServices({ registry } as unknown as Phaser.Game, services);
    const scene = { registry, scene: { key: 'Boot' } } as unknown as Phaser.Scene;
    expect(servicesOf(scene)).toBe(services);
  });

  it('throws a clear error when a scene starts before services exist', () => {
    const scene = { registry: fakeRegistry(), scene: { key: 'House' } } as unknown as Phaser.Scene;
    expect(() => servicesOf(scene)).toThrow(/House started before game services/);
  });

  it('marks the active scene on the body', () => {
    markActiveScene('House');
    expect(document.body.dataset.scene).toBe('House');
  });
});

describe('createAppLog', () => {
  it('keeps entries in the ring buffer', () => {
    const { logger, ring } = createAppLog('sess', true);
    logger.debug('a');
    expect(ring.entries().map((e) => e.event)).toEqual(['a']);
    expect(ring.capacity).toBe(2000);
  });
});

describe('placeholder house', () => {
  it('has unique room ids and non-overlapping footprints', () => {
    expect(new Set(placeholderRooms.map((r) => r.id)).size).toBe(placeholderRooms.length);
    for (const a of placeholderRooms) {
      for (const b of placeholderRooms) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});
