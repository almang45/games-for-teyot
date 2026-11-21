import { describe, expect, it } from 'vitest';
import { checkHouseLayout, houseLayout, type HouseLayout } from '../../contracts/houseLayout';
import {
  distanceToBoundary,
  pointInPolygon,
  polygonArea,
  samplePolygon,
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

  it('measures the distance to the nearest edge from either side', () => {
    expect(distanceToBoundary([5, 5], square)).toBe(5);
    expect(distanceToBoundary([2, 5], square)).toBe(2);
    expect(distanceToBoundary([13, 14], square)).toBe(5);
  });

  it('samples a polygon on a grid from its top-left corner, boundary included', () => {
    expect(samplePolygon(square, 5)).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [0, 5],
      [5, 5],
      [10, 5],
      [0, 10],
      [5, 10],
      [10, 10],
    ]);
    const triangle: [number, number][] = [
      [0, 0],
      [10, 0],
      [0, 10],
    ];
    expect(samplePolygon(triangle, 5)).not.toContainEqual([10, 10]);
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

  it('keeps the straight walk from the stand to each parking spot on the floor (#36)', () => {
    const l = houseFixture();
    const room = l.rooms[0];
    if (!room) throw new Error('fixture has rooms');
    // A counter cut into the floor between the stand (1350) and Ocica's spot (1450).
    room.walk = [
      [1100, 820],
      [1380, 820],
      [1380, 940],
      [1420, 940],
      [1420, 820],
      [1600, 820],
      [1600, 980],
      [1100, 980],
    ];
    expect(messages(l)).toEqual([
      'rooms[0].parking.ocica: the straight walk from the stand leaves the walk polygon',
      // The stair edge runs over the counter as well.
      'edges[2]: ruang-keluarga → tangga-bawah leaves the walkable floor',
    ]);
  });

  it('keeps the walk polygon inside the tap polygon', () => {
    const l = houseFixture();
    const room = l.rooms[0];
    if (!room) throw new Error('fixture has rooms');
    room.polygon = [
      [1100, 780],
      [1550, 780],
      [1550, 1020],
      [1100, 1020],
    ];
    expect(messages(l)).toEqual([
      'rooms[0].walk: the walk polygon must lie inside the tap polygon',
    ]);
  });

  it('keeps taps on a floor from landing on a neighbour on the same storey', () => {
    const l = houseFixture();
    const [living, kitchen, bedroom] = l.rooms;
    if (!living || !kitchen || !bedroom) throw new Error('fixture has three rooms');
    // Rooms that only meet on a shared edge are fine: dapur's floor ends on ruang-keluarga's.
    expect(messages(l)).toEqual([]);

    // ruang-keluarga's tap area reaching 200 px over dapur's floor takes those taps: on the
    // tie in paint order, the earlier room in `rooms` wins, as in the engine's roomAt.
    living.polygon = [
      [900, 780],
      [1650, 780],
      [1650, 1020],
      [900, 1020],
    ];
    const [overlap, ...rest] = messages(l);
    expect(rest).toEqual([]);
    expect(overlap).toMatch(
      /^rooms\[1\]\.walk: \d+ of \d+ points on this floor tap ruang-keluarga$/,
    );

    // A storey above may cover it: the child sees that storey on top, and the zoom fades it out.
    living.polygon = [
      [1100, 780],
      [1650, 780],
      [1650, 1020],
      [1100, 1020],
    ];
    bedroom.polygon = [
      [400, 280],
      [1650, 280],
      [1650, 1000],
      [400, 1000],
    ];
    expect(messages(l)).toEqual([]);
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
