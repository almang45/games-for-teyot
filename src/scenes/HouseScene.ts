import * as Phaser from 'phaser';
import type { Point } from '../../contracts/common.ts';
import { HOUSE_SIZE, type HouseLayout, type HouseRoom } from '../../contracts/houseLayout.ts';
import type { RoomId } from '../../contracts/rooms.ts';
import { buildNavGraph } from '../engine/nav/graph';
import { roomAt } from '../engine/nav/hit';
import { NavWalker } from '../engine/nav/walker';
import { markActiveScene, servicesOf } from '../game/services';
import type { Logger } from '../log';
import { buildPlaceholderHouse, type PlaceholderHouse } from '../placeholder/house';
import { placeholderPalette as pal } from '../placeholder/palette';

/** Theia's walking speed in layout px per second: a room's width in about a second. */
const WALK_SPEED = 420;
const RESIZE_SETTLE_MS = 120;
const THEIA_RADIUS = 34;
const OUTLINE = 4;

/**
 * SCR-HOUSE on the placeholder house: tap a room and Theia walks there along the waypoint graph
 * (PRD US-HOUSE-01, ARCHITECTURE §6). Everything is placed in layout.json space inside one stage
 * container, so a resize only refits the stage and a walk in progress carries on. The real hub
 * swaps the drawing for Antigravity's layers; the layout, the graph and the walk stay.
 */
export class HouseScene extends Phaser.Scene {
  static readonly KEY = 'House';

  private log!: Logger;
  private layout!: HouseLayout;
  private walker!: NavWalker;
  private stage!: Phaser.GameObjects.Container;
  private theia!: Phaser.GameObjects.Container;
  private theiaEye!: Phaser.GameObjects.Arc;
  private floors = new Map<RoomId, (highlight: boolean) => void>();
  private hovered: RoomId | undefined;

  constructor() {
    super(HouseScene.KEY);
  }

  create(): void {
    this.log = servicesOf(this).logger.forScene(HouseScene.KEY);
    this.cameras.main.setBackgroundColor(pal.sky);
    const house = buildPlaceholderHouse();
    this.layout = house.layout;
    this.walker = new NavWalker(buildNavGraph(this.layout), this.layout.start, WALK_SPEED);

    this.stage = this.add.container(0, 0);
    this.drawHouse(house);
    this.theia = this.drawTheia();
    this.stage.add(this.theia);
    this.placeTheia();

    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      this.onTap(this.toLayout(p));
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      this.hover(roomAt(this.layout, this.toLayout(p))?.id);
    });

    this.fit();
    // A window drag or rotation fires dozens of RESIZE events; refit once the size settles.
    let settle: Phaser.Time.TimerEvent | undefined;
    const onResize = (): void => {
      settle?.remove();
      settle = this.time.delayedCall(RESIZE_SETTLE_MS, () => {
        this.fit();
      });
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
    });

    markActiveScene(HouseScene.KEY);
    this.log.info('scene.ready', { rooms: this.layout.rooms.length, start: this.layout.start });
  }

  override update(_time: number, delta: number): void {
    const arrival = this.walker.advance(delta);
    this.placeTheia();
    if (arrival) {
      this.log.info('house.arrived', { room: arrival.room, theia: roundPoint(arrival.pos) });
    }
  }

  /** Scales the 1920 × 1200 layout frame to fit the view, centred; EXPAND adds side area only. */
  private fit(): void {
    const { width, height } = this.scale;
    const scale = Math.min(width / HOUSE_SIZE[0], height / HOUSE_SIZE[1]);
    this.stage.setScale(scale);
    this.stage.setPosition(
      (width - HOUSE_SIZE[0] * scale) / 2,
      (height - HOUSE_SIZE[1] * scale) / 2,
    );
    const toGame = ([x, y]: Point): Point => [
      Math.round(this.stage.x + x * scale),
      Math.round(this.stage.y + y * scale),
    ];
    this.log.info('house.layout', {
      width,
      height,
      scale,
      theiaRoom: this.walker.room,
      theia: roundPoint(this.walker.position),
      // Each room's stand in game pixels, so E2E tests can tap a room on any viewport.
      stands: Object.fromEntries(this.layout.rooms.map((r) => [r.id, toGame(r.stand)])),
    });
  }

  private toLayout(p: Phaser.Input.Pointer): Point {
    const s = this.stage.scale;
    return [(p.x - this.stage.x) / s, (p.y - this.stage.y) / s];
  }

  private onTap(at: Point): void {
    const room = roomAt(this.layout, at);
    if (!room) {
      // Bubu's head tilt (PRD US-HOUSE-01) hooks in here once the companions exist.
      this.log.info('house.tap_outside', { at: roundPoint(at) });
      return;
    }
    this.log.info('house.room_tap', { room: room.id });
    const plan = this.walker.walkTo(room.id);
    if (!plan) {
      // checkHouseLayout proves every room reachable, so this is a broken layout, not a user error.
      this.log.error('house.route_missing', new Error(`no route to ${room.id}`), { room: room.id });
      return;
    }
    this.log.info('house.walk', { room: plan.room, via: [...plan.via] });
  }

  private hover(room: RoomId | undefined): void {
    if (room === this.hovered) return;
    if (this.hovered) this.floors.get(this.hovered)?.(false);
    if (room) this.floors.get(room)?.(true);
    this.hovered = room;
  }

  private placeTheia(): void {
    const [x, y] = this.walker.position;
    this.theia.setPosition(x, y - THEIA_RADIUS);
    const { view, flipX } = this.walker.facing;
    // Placeholder facing: the eye sits toward where she looks, low when facing the viewer.
    this.theiaEye.setPosition(flipX ? -14 : 14, view === 'fr' ? -4 : -16);
  }

  private drawHouse(house: PlaceholderHouse): void {
    const drawOrder = [...this.layout.rooms].sort(
      (a, b) => a.storey - b.storey || a.stand[1] - b.stand[1],
    );
    for (const room of drawOrder) {
      for (const wall of house.walls.filter((w) => w.room === room.id)) {
        this.stage.add(
          polygon(this, wall.quad, wall.side === 'left' ? pal.wallLeft : pal.wallRight),
        );
      }
      for (const slab of house.slabs.filter((s) => s.room === room.id)) {
        this.stage.add(polygon(this, slab.quad, pal.wallRight));
      }
      this.stage.add(this.drawFloor(room));
    }
    this.stage.add(this.drawStairs());
  }

  private drawFloor(room: HouseRoom): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    // Repaints from scratch so hover never accumulates draw commands in the Graphics buffer.
    const paint = (highlight: boolean): void => {
      g.clear();
      g.fillStyle(highlight ? pal.highlight : pal.floor, 1);
      g.fillPoints(room.walk.map(toVec), true);
      g.lineStyle(OUTLINE, pal.outline, 1);
      g.strokePoints(room.walk.map(toVec), true);
    };
    paint(false);
    this.floors.set(room.id, paint);
    return g;
  }

  /** Each climbed edge as a ramp line: enough to read where the stairs are. */
  private drawStairs(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const stairs = new Map(this.layout.waypoints.filter((w) => w.stair).map((w) => [w.id, w.pos]));
    g.lineStyle(18, pal.outline, 1);
    for (const [a, b] of this.layout.edges) {
      const from = stairs.get(a);
      const to = stairs.get(b);
      if (from && to) g.lineBetween(from[0], from[1], to[0], to[1]);
    }
    return g;
  }

  private drawTheia(): Phaser.GameObjects.Container {
    const body = this.add.circle(0, 0, THEIA_RADIUS, pal.theia).setStrokeStyle(6, pal.outline);
    this.theiaEye = this.add.circle(0, 0, 7, pal.outline);
    return this.add.container(0, 0, [body, this.theiaEye]);
  }
}

function polygon(
  scene: Phaser.Scene,
  points: readonly Point[],
  color: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.fillPoints(points.map(toVec), true);
  g.lineStyle(OUTLINE, pal.outline, 1);
  g.strokePoints(points.map(toVec), true);
  return g;
}

function toVec([x, y]: Point): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(x, y);
}

function roundPoint([x, y]: Point): Point {
  return [Math.round(x), Math.round(y)];
}
