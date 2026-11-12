import { describe, expect, it } from 'vitest';
import { checkHouseLayout, houseLayout, type HouseLayout } from '../../contracts/houseLayout';
import {
  pointInPolygon,
  polygonArea,
  sampleSegment,
  selfIntersects,
} from '../../contracts/geometry';
import { ROOM_IDS, STOREYS, storey } from '../../contracts/rooms';
import { houseFixture } from './fixtures/contracts';

const messages = (layout: HouseLayout): string[] =>
  checkHouseLayout(layout).map((i) => `${i.path}: ${i.message}`);

const square: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('geometry', () => {
  it('treats points on the boundary as inside, and points beyond it as outside', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
    expect(pointInPolygon([10, 5], square)).toBe(true);
    expect(pointInPolygon([10.4, 5], square)).toBe(true);
    expect(pointInPolygon([11, 5], square)).toBe(false);
    expect(pointInPolygon([-1, -1], square)).toBe(false);
  });

  it('measures area and finds crossing edges', () => {
    expect(polygonArea(square)).toBe(100);
    expect(
      polygonArea([
        [0, 0],
        [5, 5],
        [10, 10],
      ]),
    ).toBe(0);
    expect(selfIntersects(square)).toBe(false);
    const bowtie: [number, number][] = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
    ];
    expect(selfIntersects(bowtie)).toBe(true);
  });

  it('samples a segment with both endpoints, and a zero-length one once each end', () => {
    const samples = sampleSegment([0, 0], [20, 0], 8);
    expect(samples).toHaveLength(4);
    expect(samples[0]).toEqual([0, 0]);
    expect(samples[3]).toEqual([20, 0]);
    expect(samples[1]?.[0]).toBeCloseTo(20 / 3);
    expect(sampleSegment([3, 3], [3, 3], 8)).toEqual([
      [3, 3],
      [3, 3],
    ]);
  });
});

describe('rooms', () => {
  it('keeps the storey schema equal to the storey table', () => {
    for (const s of STOREYS) expect(storey.safeParse(s.id).success).toBe(true);
    expect(storey.safeParse(4).success).toBe(false);
  });

  it('has the five rooms Papa chose', () => {
    expect(ROOM_IDS).toEqual([
      'kamar-tidur',
      'dapur',
      'ruang-keluarga',
      'kantor-papa',
      'kamar-anak',
    ]);
  });
});

describe('house layout', () => {
  it('accepts the fixture', () => {
    expect(houseLayout.parse(houseFixture())).toBeTruthy();
    expect(checkHouseLayout(houseFixture())).toEqual([]);
  });

  it('rejects unknown rooms and wrong canvas sizes in the schema', () => {
    const bad = houseFixture() as unknown as { size: number[]; rooms: { id: string }[] };
    bad.size = [3840, 2400];
    (bad.rooms[0] as { id: string }).id = 'ruang-tamu';
    const result = houseLayout.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(
      expect.arrayContaining(['size.0', 'rooms.0.id']),
    );
  });

  it('flags duplicate ids, activities and occluders, and a missing start', () => {
    const l = houseFixture();
    l.waypoints.push({ id: 'dapur', pos: [700, 900], storey: 0 });
    l.rooms[1]?.activities.push('coloring');
    l.occluders.push({ key: 'house.occluders.railing', sortY: 10 });
    l.start = 'kamar-anak';
    expect(messages(l)).toEqual(
      expect.arrayContaining([
        'rooms: duplicate node id dapur',
        'rooms: coloring is hosted by more than one room',
        'occluders: duplicate occluder house.occluders.railing',
        'start: start room kamar-anak is not in rooms',
      ]),
    );
  });

  it('defaults props to none and checks each prop against its sprite, room and storey', () => {
    const withoutProps: Partial<HouseLayout> = houseFixture();
    delete withoutProps.props;
    expect(houseLayout.parse(withoutProps).props).toEqual([]);

    const l = houseFixture();
    const kulkas = l.props[0];
    if (!kulkas) throw new Error('fixture has a prop');
    l.props.push(
      { ...kulkas },
      { ...kulkas, key: 'house.props.dapur.meja', rect: [1900, 600, 160, 240] },
      { ...kulkas, key: 'house.props.dapur.kursi', rect: [480, 600, 40, 40] },
      { ...kulkas, key: 'house.props.dapur.rak', room: 'kamar-anak' },
      { ...kulkas, key: 'house.props.dapur.lemari', storey: 2 },
    );
    expect(messages(l)).toEqual([
      'props: duplicate prop house.props.dapur.kulkas',
      'props[2].rect: prop leaves the canvas',
      'props[2].base: the footprint must lie inside the sprite rect',
      'props[3].base: the footprint must lie inside the sprite rect',
      'props[4].room: kamar-anak is not in rooms',
      'props[5].storey: dapur is on storey 0',
    ]);
    expect(
      houseLayout.safeParse({ ...l, props: [{ ...kulkas, key: 'house.kulkas' }] }).success,
    ).toBe(false);
  });

  it('flags degenerate, crossing and off-canvas polygons', () => {
    const l = houseFixture();
    const room = l.rooms[0];
    if (!room) throw new Error('fixture has rooms');
    room.polygon = [
      [0, 0],
      [5, 5],
      [10, 10],
    ];
    room.walk = [
      [1100, 820],
      [1600, 980],
      [1600, 820],
      [1100, 980],
    ];
    room.focus = [1800, 1100, 400, 400];
    l.rooms[1]?.polygon.push([2000, 1300]);
    expect(messages(l)).toEqual(
      expect.arrayContaining([
        'rooms[0].polygon: polygon has no area',
        'rooms[0].walk: polygon edges cross',
        'rooms[0].focus: focus rect leaves the canvas',
        'rooms[1].polygon: polygon leaves the 1920 × 1200 canvas',
      ]),
    );
  });

  it('keeps stand and parking spots on the floor', () => {
    const l = houseFixture();
    const room = l.rooms[0];
    if (!room) throw new Error('fixture has rooms');
    room.stand = [10, 10];
    room.parking.ocica = [10, 10];
    expect(messages(l)).toEqual([
      'rooms[0].stand: stand must lie inside the walk polygon',
      'rooms[0].parking.ocica: parking spot must lie inside the walk polygon',
      // The stand is the room's graph node, so its edges now leave the floor too.
      'edges[1]: pintu-dapur → ruang-keluarga leaves the walkable floor',
      'edges[2]: ruang-keluarga → tangga-bawah leaves the walkable floor',
    ]);
  });

  it('checks spots point at real rooms and stay on the canvas', () => {
    const l = houseFixture();
    l.spots.fridge.room = 'kantor-papa';
    l.spots['sticker-wall'].rect = [1900, 10, 100, 100];
    expect(messages(l)).toEqual([
      'spots.fridge.room: kantor-papa is not in rooms',
      'spots.sticker-wall.rect: spot leaves the canvas',
    ]);
  });

  it('walks the graph: unknown nodes, loops, stairs, floors and reachability', () => {
    const l = houseFixture();
    l.waypoints.push({ id: 'taman', pos: [100, 100], storey: 0 });
    l.edges.push(
      ['dapur', 'garasi'],
      ['dapur', 'dapur'],
      ['dapur', 'kamar-tidur'],
      ['dapur', 'ruang-keluarga'],
    );
    l.edges.push(['taman', 'dapur']);
    expect(messages(l)).toEqual([
      'waypoints[3].pos: taman is off the walkable floor of storey 0',
      'edges[5]: unknown node garasi',
      'edges[6]: edge connects a node to itself',
      'edges[7]: an edge between storeys must join two stair waypoints',
      'edges[9]: taman → dapur leaves the walkable floor',
    ]);
  });

  it('reports rooms that cannot be reached from the start', () => {
    const l = houseFixture();
    l.edges = l.edges.filter(([a]) => a !== 'tangga-bawah');
    expect(messages(l)).toEqual(['edges: kamar-tidur is not reachable from ruang-keluarga']);
  });

  it('skips the graph walk while node ids are ambiguous', () => {
    const l = houseFixture();
    l.waypoints.push({ id: 'pintu-dapur', pos: [5, 5], storey: 0 });
    expect(messages(l)).toEqual(['rooms: duplicate node id pintu-dapur']);
  });
});
