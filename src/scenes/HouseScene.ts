import * as Phaser from 'phaser';
import type { Point } from '../../contracts/common.ts';
import { HOUSE_SIZE, type HouseLayout, type HouseRoom } from '../../contracts/houseLayout.ts';
import type { RoomId } from '../../contracts/rooms.ts';
import { Companions } from '../engine/nav/companions';
import { buildNavGraph } from '../engine/nav/graph';
import { paintOrder, roomAt } from '../engine/nav/hit';
import { NavWalker } from '../engine/nav/walker';
import { markActiveScene, servicesOf } from '../game/services';
import type { Logger } from '../log';
import { buildPlaceholderHouse, type PlaceholderHouse } from '../placeholder/house';
import { placeholderPalette as pal } from '../placeholder/palette';
import { bubuView, ocicaView, theiaView, type ActorView } from './house/actors';

/** Theia's walking speed in layout px per second: a room's width in about a second. */
const WALK_SPEED = 420;
const RESIZE_SETTLE_MS = 120;
/** Game px a pointer may travel between down and up and still count as a tap, not a drag. */
const TAP_SLOP = 30;
const OUTLINE = 4;
/** Bubu hops at most this far ahead of Theia and Ocica keeps this far behind, in layout px. */
const BUBU_LEAD = 110;
const OCICA_GAP = 90;
/** Bubu's head tilt when a tap lands outside every room (PRD US-HOUSE-01). */
const TILT_RAD = 0.3;
const TILT_MS = 220;

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
  private companions!: Companions;
  private actors!: Phaser.GameObjects.Container;
  private theia!: ActorView;
  private bubu!: ActorView;
  private ocica!: ActorView;
  /** The room the companions are heading to, until both stand on its parking spots. */
  private parkingIn: RoomId | undefined;
  private floors!: Map<RoomId, (highlight: boolean) => void>;
  private hovered: RoomId | undefined;

  constructor() {
    super(HouseScene.KEY);
  }

  create(): void {
    this.log = servicesOf(this).logger.forScene(HouseScene.KEY);
    // Phaser reuses the scene instance on restart, so per-run state starts over here.
    this.floors = new Map();
    this.hovered = undefined;
    this.parkingIn = undefined;
    this.cameras.main.setBackgroundColor(pal.sky);
    const house = buildPlaceholderHouse();
    this.layout = house.layout;
    this.walker = new NavWalker(buildNavGraph(this.layout), this.layout.start, WALK_SPEED);
    this.companions = new Companions(this.roomById(this.layout.start).parking, {
      theiaSpeed: WALK_SPEED,
      lead: BUBU_LEAD,
      gap: OCICA_GAP,
    });

    this.stage = this.add.container(0, 0);
    this.drawHouse(house);
    this.theia = theiaView(this);
    this.bubu = bubuView(this);
    this.ocica = ocicaView(this);
    this.actors = this.add.container(0, 0, [this.theia.root, this.bubu.root, this.ocica.root]);
    this.stage.add(this.actors);
    this.placeActors();

    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      // A touch has no hover: the highlight it set while down must not stay behind.
      if (p.wasTouch) this.hover(undefined);
      if (isTap(p)) this.onTap(this.toLayout(p));
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      this.hover(roomAt(this.layout, this.toLayout(p))?.id);
    });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.hover(undefined);
    });

    this.fit();
    this.logLayout();
    // Refit on every RESIZE so the frame never lags the window; a window drag or rotation fires
    // dozens of them, so only the log waits for the size to settle.
    let settle: Phaser.Time.TimerEvent | undefined;
    const onResize = (): void => {
      this.fit();
      settle?.remove();
      settle = this.time.delayedCall(RESIZE_SETTLE_MS, () => {
        this.logLayout();
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
    this.companions.update(delta, {
      pos: this.walker.position,
      remaining: this.walker.remaining,
      walking: this.walker.walking,
    });
    this.placeActors();
    if (arrival) {
      this.log.info('house.arrived', { room: arrival.room, theia: roundPoint(arrival.pos) });
    }
    const { bubu, ocica } = this.companions;
    if (this.parkingIn && !this.walker.walking && !bubu.moving && !ocica.moving) {
      const { parking } = this.roomById(this.parkingIn);
      this.log.info('house.companions_parked', {
        room: this.parkingIn,
        // The E2E test checks that they ended on the spots layout.json gives that room.
        onSpots: samePoint(bubu.pos, parking.bubu) && samePoint(ocica.pos, parking.ocica),
      });
      this.parkingIn = undefined;
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
  }

  /** Points in game pixels, so E2E tests can tap a room and find Theia on any viewport. */
  private logLayout(): void {
    const { width, height } = this.scale;
    const scale = this.stage.scale;
    const toGame = ([x, y]: Point): Point => [
      Math.round(this.stage.x + x * scale),
      Math.round(this.stage.y + y * scale),
    ];
    this.log.info('house.layout', {
      width,
      height,
      scale,
      theiaRoom: this.walker.room,
      theia: toGame(this.walker.position),
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
      this.log.info('house.tap_outside', { at: roundPoint(at) });
      this.tiltBubu();
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
    if (plan.via.length > 0) {
      this.companions.follow(this.walker.route, room.parking);
      this.parkingIn = room.id;
    }
  }

  private tiltBubu(): void {
    const figure = this.bubu.root;
    if (this.tweens.isTweening(figure)) return;
    this.tweens.add({
      targets: figure,
      rotation: this.companions.bubu.facing.flipX ? -TILT_RAD : TILT_RAD,
      duration: TILT_MS,
      yoyo: true,
      hold: TILT_MS,
      ease: 'Sine.easeInOut',
    });
  }

  private roomById(id: RoomId): HouseRoom {
    const room = this.layout.rooms.find((r) => r.id === id);
    if (!room) throw new Error(`layout has no room ${id}`);
    return room;
  }

  private hover(room: RoomId | undefined): void {
    if (room === this.hovered) return;
    if (this.hovered) this.floors.get(this.hovered)?.(false);
    if (room) this.floors.get(room)?.(true);
    this.hovered = room;
    this.input.setDefaultCursor(room ? 'pointer' : 'default');
  }

  private placeActors(): void {
    const w = this.walker;
    this.theia.place({ pos: w.position, facing: w.facing, moving: w.walking, travelled: 0 });
    this.bubu.place(this.companions.bubu);
    this.ocica.place(this.companions.ocica);
    // Feet nearer the viewer are drawn later (ARCHITECTURE §6 depth sorting).
    this.actors.sort('y');
  }

  private drawHouse(house: PlaceholderHouse): void {
    const drawOrder = [...this.layout.rooms].sort(paintOrder);
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

/** The primary button (touch, pen tip, left mouse) let go near where it went down. */
function isTap(p: Phaser.Input.Pointer): boolean {
  return p.button === 0 && p.getDistance() <= TAP_SLOP;
}

function toVec([x, y]: Point): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(x, y);
}

function samePoint(a: Point, b: Point): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function roundPoint([x, y]: Point): Point {
  return [Math.round(x), Math.round(y)];
}
