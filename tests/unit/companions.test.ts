import { describe, expect, it } from 'vitest';
import type { Point } from '../../contracts/common';
import { pointInPolygon } from '../../contracts/geometry';
import type { HouseRoom } from '../../contracts/houseLayout';
import type { RoomId } from '../../contracts/rooms';
import { Companions, type CompanionTuning } from '../../src/engine/nav/companions';
import { buildNavGraph, distance, nodeOf } from '../../src/engine/nav/graph';
import { Polyline } from '../../src/engine/nav/polyline';
import { NavWalker } from '../../src/engine/nav/walker';
import { buildPlaceholderHouse } from '../../src/placeholder/house';

const { layout } = buildPlaceholderHouse();
const graph = buildNavGraph(layout);
const TUNING: CompanionTuning = { theiaSpeed: 400, lead: 110, gap: 90 };
const FRAME = 16;

const room = (id: RoomId): HouseRoom => {
  const r = layout.rooms.find((x) => x.id === id);
  if (!r) throw new Error(`no ${id}`);
  return r;
};

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const len = distance(a, b);
  if (len === 0) return distance(p, a);
  const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len);
  return distance(p, new Polyline([a, b]).at(Math.max(0, Math.min(1, t)) * len));
}

const climbs = layout.edges
  .map(([a, b]) => [nodeOf(graph, a), nodeOf(graph, b)] as const)
  .filter(([a, b]) => a.stair && b.stair);

/** On some room's floor or on a flight of stairs: where Theia herself can walk. */
const walkable = (p: Point): boolean =>
  layout.rooms.some((r) => pointInPolygon(p, r.walk)) ||
  climbs.some(([a, b]) => distanceToSegment(p, a.pos, b.pos) < 1);

interface Run {
  readonly walker: NavWalker;
  readonly companions: Companions;
}

function start(at: RoomId): Run {
  const walker = new NavWalker(graph, at, TUNING.theiaSpeed);
  return { walker, companions: new Companions(room(at).parking, TUNING) };
}

function walkTo({ walker, companions }: Run, to: RoomId): void {
  walker.walkTo(to);
  companions.follow(walker.route, room(to).parking);
}

/** Runs frames, calling `check` after each; returns the frame Theia arrived on, if any. */
function run(
  { walker, companions }: Run,
  frames: number,
  check: (frame: number) => void = () => undefined,
): number | undefined {
  let arrivedAt: number | undefined;
  for (let f = 0; f < frames; f++) {
    if (walker.advance(FRAME)) arrivedAt ??= f;
    companions.update(FRAME, {
      pos: walker.position,
      remaining: walker.remaining,
      walking: walker.walking,
    });
    check(f);
  }
  return arrivedAt;
}

describe('Polyline', () => {
  const line = new Polyline([
    [0, 0],
    [10, 0],
    [10, 10],
  ]);

  it('finds points by arc length, clamped to the ends', () => {
    expect(line.length).toBe(20);
    expect(line.at(5)).toEqual([5, 0]);
    expect(line.at(15)).toEqual([10, 5]);
    expect(line.at(-3)).toEqual([0, 0]);
    expect(line.at(99)).toEqual([10, 10]);
  });

  it('returns the far end itself at the full length, with no float drift', () => {
    const end: Point = [1.3, 0.9];
    const uneven = new Polyline([[0.1, 0.2], [0.7, 0.3], end]);
    expect(uneven.at(uneven.length)).toBe(end);
    expect(uneven.between(0, uneven.length).at(-1)).toBe(end);
  });

  it('cuts out a part in either direction', () => {
    expect(line.between(5, 15)).toEqual([
      [5, 0],
      [10, 0],
      [10, 5],
    ]);
    expect(line.between(15, 5)).toEqual([
      [10, 5],
      [10, 0],
      [5, 0],
    ]);
  });

  it('handles a single point and refuses none', () => {
    const dot = new Polyline([[3, 4]]);
    expect(dot.length).toBe(0);
    expect(dot.at(2)).toEqual([3, 4]);
    expect(dot.between(0, 0)).toEqual([
      [3, 4],
      [3, 4],
    ]);
    expect(() => new Polyline([])).toThrow(RangeError);
  });
});

describe('Companions', () => {
  it('wait on their parking spots until Theia walks', () => {
    const r = start('ruang-keluarga');
    run(r, 30);
    const parking = room('ruang-keluarga').parking;
    expect(r.companions.bubu).toMatchObject({ pos: parking.bubu, moving: false, travelled: 0 });
    expect(r.companions.ocica).toMatchObject({ pos: parking.ocica, moving: false, travelled: 0 });
  });

  it('refuses tuning that would leave them behind', () => {
    const parking = room('dapur').parking;
    expect(() => new Companions(parking, { ...TUNING, theiaSpeed: 0 })).toThrow(RangeError);
    expect(() => new Companions(parking, { ...TUNING, lead: -1 })).toThrow(RangeError);
    expect(() => new Companions(parking, { ...TUNING, gap: -1 })).toThrow(RangeError);
  });

  it('follow her up both flights: Bubu ahead, Ocica behind, both only where she can walk', () => {
    const r = start('ruang-keluarga');
    walkTo(r, 'kamar-tidur');
    let bubuParkedAt: number | undefined;
    const target = room('kamar-tidur').parking;
    const arrivedAt = run(r, 600, (f) => {
      const { bubu, ocica } = r.companions;
      const theia = r.walker.position;
      expect(walkable(bubu.pos), `Bubu off the floor at frame ${f}`).toBe(true);
      expect(walkable(ocica.pos), `Ocica off the floor at frame ${f}`).toBe(true);
      if (r.walker.walking && f > 60) {
        expect(distance(bubu.pos, theia)).toBeLessThanOrEqual(TUNING.lead + 1);
        expect(distance(ocica.pos, theia)).toBeLessThanOrEqual(TUNING.gap + 10);
      }
      if (bubuParkedAt === undefined && distance(bubu.pos, target.bubu) === 0) bubuParkedAt = f;
    });

    expect(arrivedAt).toBeDefined();
    expect(bubuParkedAt).toBeDefined();
    // Bubu is there first; Ocica settles only after Theia has arrived.
    expect(bubuParkedAt).toBeLessThanOrEqual(arrivedAt ?? 0);
    expect(r.companions.bubu.pos).toEqual(target.bubu);
    expect(r.companions.ocica.pos).toEqual(target.ocica);
    expect(r.companions.ocica.moving).toBe(false);
  });

  it('turn back with her when she changes her mind, still never leaving the floor', () => {
    const r = start('ruang-keluarga');
    walkTo(r, 'kamar-tidur');
    run(r, 40);
    walkTo(r, 'dapur');
    run(r, 400, (f) => {
      expect(walkable(r.companions.bubu.pos), `Bubu off the floor at frame ${f}`).toBe(true);
      expect(walkable(r.companions.ocica.pos), `Ocica off the floor at frame ${f}`).toBe(true);
    });
    expect(r.walker.room).toBe('dapur');
    expect(r.companions.bubu.pos).toEqual(room('dapur').parking.bubu);
    expect(r.companions.ocica.pos).toEqual(room('dapur').parking.ocica);
  });

  it('stay put when she taps the room she is already in', () => {
    const r = start('dapur');
    walkTo(r, 'dapur');
    run(r, 30);
    expect(r.companions.bubu.travelled).toBe(0);
    expect(r.companions.ocica.travelled).toBe(0);
  });

  it('face their direction of travel, and turn to look at her once they stop', () => {
    const r = start('ruang-keluarga');
    walkTo(r, 'dapur');
    const views = new Set<string>();
    run(r, 300, () => {
      if (r.companions.bubu.moving) views.add(`${r.companions.bubu.facing.flipX}`);
    });
    // Dapur is to the left of the living room on screen.
    expect(views.has('true')).toBe(true);
    const { bubu } = r.companions;
    const theia = r.walker.position;
    expect(bubu.facing.flipX).toBe(theia[0] < bubu.pos[0]);
  });

  it('ignore negative frame times', () => {
    const r = start('ruang-keluarga');
    walkTo(r, 'dapur');
    r.companions.update(-100, { pos: r.walker.position, remaining: 0, walking: true });
    expect(r.companions.bubu.travelled).toBe(0);
  });
});
