import * as Phaser from 'phaser';
import type { Point } from '../../contracts/common.ts';
import { HOUSE_SIZE, type HouseLayout, type HouseRoom } from '../../contracts/houseLayout.ts';
import { STOREYS, type RoomId, type Storey } from '../../contracts/rooms.ts';
import { isPhone, tapSize } from '../engine/camera/device';
import { boundsOf } from '../engine/camera/focus';
import { fitView, HouseCamera, type Ease } from '../engine/camera/houseCamera';
import { Companions } from '../engine/nav/companions';
import { buildNavGraph, samePoint } from '../engine/nav/graph';
import { paintOrder, roomAt } from '../engine/nav/hit';
import { NavWalker } from '../engine/nav/walker';
import { markActiveScene, servicesOf } from '../game/services';
import type { Logger } from '../log';
import { buildPlaceholderHouse, type PlaceholderHouse } from '../placeholder/house';
import { placeholderMotion } from '../placeholder/motion';
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

const ROOM_ZOOM = placeholderMotion['house.room-zoom'];
/** The grid an E2E tap point is searched on, per room, when its stand is off screen or covered. */
const TAP_SEARCH_GRID = 12;

/**
 * SCR-HOUSE on the placeholder house: tap a room and Theia walks there along the waypoint graph
 * (PRD US-HOUSE-01, ARCHITECTURE §6), and the camera zooms into it on arrival. On a phone the hub
 * opens framed on her room instead of the whole house: a drag pans, a pinch zooms, and a tapped
 * room is framed as she walks there (US-HOUSE-05). Everything is placed in layout.json space inside
 * one stage container that the camera's shot scales and moves, so a resize only refits the stage
 * and a walk or zoom in progress carries on. The real hub swaps the drawing for Antigravity's
 * layers; the layout, the graph, the walk and the camera stay.
 */
export class HouseScene extends Phaser.Scene {
  static readonly KEY = 'House';

  private log!: Logger;
  private layout!: HouseLayout;
  private walker!: NavWalker;
  private stage!: Phaser.GameObjects.Container;
  private camera!: HouseCamera;
  private zoomEase!: Ease;
  /** Each storey's drawing, indexed by storey, so the zoom can fade the storeys above a room. */
  private storeys!: Phaser.GameObjects.Container[];
  private companions!: Companions;
  private actors!: Phaser.GameObjects.Container;
  private theia!: ActorView;
  private bubu!: ActorView;
  private ocica!: ActorView;
  /** The room the companions are heading to, until both stand on its parking spots. */
  private parkingIn: RoomId | undefined;
  /** Theia's remaining walk at its halfway point, where the companions' spacing is logged once. */
  private spacingAt: number | undefined;
  private floors!: Map<RoomId, (highlight: boolean) => void>;
  private hovered: RoomId | undefined;
  /** The mouse while it is over the game, so hover can follow the stage as the camera moves. */
  private mouse: Phaser.Input.Pointer | undefined;
  /** Phone-sized screen: the hub opens framed on her room, and drag and pinch move the view. */
  private phone = false;
  /** Pointers down on a phone, by id, at the position the camera last moved them to. */
  private fingers = new Map<number, Point>();
  /** Set once a drag passes the tap slop or two fingers pinch; the touch that ends it is no tap. */
  private gestured = false;
  private wasGliding = false;

  constructor() {
    super(HouseScene.KEY);
  }

  create(): void {
    this.log = servicesOf(this).logger.forScene(HouseScene.KEY);
    // Phaser reuses the scene instance on restart, so per-run state starts over here.
    this.floors = new Map();
    this.hovered = undefined;
    this.mouse = undefined;
    this.fingers = new Map();
    this.gestured = false;
    this.wasGliding = false;
    this.parkingIn = undefined;
    this.spacingAt = undefined;
    this.cameras.main.setBackgroundColor(pal.sky);
    const house = buildPlaceholderHouse();
    this.layout = house.layout;
    this.walker = new NavWalker(buildNavGraph(this.layout), this.layout.start, WALK_SPEED);
    this.companions = new Companions(this.roomById(this.layout.start).parking, {
      theiaSpeed: WALK_SPEED,
      lead: BUBU_LEAD,
      gap: OCICA_GAP,
    });

    // A pinch zooms in no closer than the tightest room framing.
    const closest = Math.min(...this.layout.rooms.map((r) => r.focus[2]));
    this.camera = new HouseCamera([0, 0, HOUSE_SIZE[0], HOUSE_SIZE[1]], closest);
    const ease = Phaser.Tweens.Builders.GetEaseFunction(ROOM_ZOOM.easing) as Ease;
    this.zoomEase = (t) => ease(t);

    this.stage = this.add.container(0, 0);
    this.storeys = STOREYS.map(() => this.add.container(0, 0));
    this.stage.add(this.storeys);
    this.drawHouse(house);
    this.theia = theiaView(this);
    this.bubu = bubuView(this);
    this.ocica = ocicaView(this);
    this.actors = this.add.container(0, 0, [this.theia.root, this.bubu.root, this.ocica.root]);
    this.stage.add(this.actors);
    this.placeActors();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.onFingerDown(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      // A touch has no hover: the highlight it set while down must not stay behind.
      if (p.wasTouch) {
        this.mouse = undefined;
        this.hover(undefined);
      }
      const gesture = this.onFingerUp(p);
      if (!gesture && isTap(p)) this.onTap(this.toLayout(p));
    });
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (p: Phaser.Input.Pointer) => {
      this.onFingerUp(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      this.mouse = p.wasTouch ? undefined : p;
      this.onFingerMove(p);
      this.hover(this.roomAt(this.toLayout(p))?.id);
    });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.mouse = undefined;
      this.hover(undefined);
    });

    this.phone = this.onPhone();
    this.camera.resize({ width: this.scale.width, height: this.scale.height });
    if (this.phone) this.camera.frameNow(this.roomById(this.layout.start));
    this.fit();
    this.logLayout();
    // Refit on every RESIZE so the frame never lags the window; a window drag or rotation fires
    // dozens of them, so only the log waits for the size to settle.
    let settle: Phaser.Time.TimerEvent | undefined;
    const onResize = (): void => {
      this.onScreenChange();
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
    const settled = this.camera.advance(delta);
    this.fit();
    // The stage moves under a resting mouse, and a fading storey stops catching it.
    if (this.mouse && (this.camera.moving || settled)) {
      this.hover(this.roomAt(this.toLayout(this.mouse))?.id);
    }
    if (this.wasGliding && !this.camera.gliding) this.logPanned();
    this.wasGliding = this.camera.gliding;
    if (settled) {
      if (settled.on === 'room') this.log.info('house.room_focused', { room: settled.room });
      else if (settled.on === 'framed') this.log.info('house.framed', { room: settled.room });
      else this.log.info('house.overview');
      this.logLayout();
    }
    const arrival = this.walker.advance(delta);
    this.companions.update(delta, {
      pos: this.walker.position,
      remaining: this.walker.remaining,
      walking: this.walker.walking,
    });
    this.placeActors();
    if (arrival) {
      this.log.info('house.arrived', { room: arrival.room, theia: roundPoint(arrival.pos) });
      // The room's activity starts once the zoom has settled (house.room_focused).
      this.camera.focusOn(this.roomById(arrival.room), ROOM_ZOOM.duration, this.zoomEase);
    }
    if (
      this.spacingAt !== undefined &&
      this.walker.walking &&
      this.walker.remaining <= this.spacingAt
    ) {
      // Lets the E2E test see Bubu ahead of her and Ocica behind (PRD US-HOUSE-02).
      const { bubuAhead, ocicaBehind } = this.companions.spacing;
      this.log.info('house.companions_following', {
        bubuAhead: Math.round(bubuAhead),
        ocicaBehind: Math.round(ocicaBehind),
      });
      this.spacingAt = undefined;
    }
    this.logParked();
  }

  /** Once both stand on the spots layout.json gives the room; position, not a still frame, decides. */
  private logParked(): void {
    if (!this.parkingIn || this.walker.walking) return;
    const { parking } = this.roomById(this.parkingIn);
    const { bubu, ocica } = this.companions;
    if (samePoint(bubu.pos, parking.bubu) && samePoint(ocica.pos, parking.ocica)) {
      this.log.info('house.companions_parked', { room: this.parkingIn });
      this.parkingIn = undefined;
    }
  }

  /** CSS px are dp on Android; the canvas fills the window (EXPAND), so its CSS size is the screen's. */
  private onPhone(): boolean {
    const { width, height } = this.scale.displaySize;
    return isPhone(width, height);
  }

  /** A resize can cross the phone size, e.g. a tablet split screen: the view starts over then. */
  private onScreenChange(): void {
    this.camera.resize({ width: this.scale.width, height: this.scale.height });
    const phone = this.onPhone();
    if (phone === this.phone) return;
    this.phone = phone;
    this.fingers.clear();
    this.log.info('house.device', { phone });
    // Zoomed into a room, she stays there; leaving brings the new screen's own view.
    if (this.camera.room) return;
    if (phone) this.camera.frameNow(this.roomById(this.walker.room));
    else this.camera.overviewNow();
  }

  private onFingerDown(p: Phaser.Input.Pointer): void {
    if (!this.phone || p.button !== 0) return;
    // A touch that catches a glide only stops the house: letting go is not a tap.
    if (this.fingers.size === 0) {
      this.gestured = this.camera.gliding;
      // Its release logs where the house stopped, so the glide's own end must not log it too.
      this.wasGliding = false;
    }
    this.fingers.set(p.id, [p.x, p.y]);
    this.camera.hold(p.downTime);
  }

  /** One finger past the tap slop pans the house; two pinch it about their midpoint. */
  private onFingerMove(p: Phaser.Input.Pointer): void {
    const last = this.fingers.get(p.id);
    if (!last) return;
    const other = [...this.fingers].find(([id]) => id !== p.id)?.[1];
    const now: Point = [p.x, p.y];
    if (other) {
      this.gestured = true;
      this.camera.twoFingers([last, other], [now, other], p.moveTime);
    } else {
      // Below the slop the finger may still be tapping, so the house waits, then catches up.
      if (!this.gestured && p.getDistance() <= TAP_SLOP) return;
      this.gestured = true;
      this.camera.drag(p.x - last[0], p.y - last[1], p.moveTime);
    }
    this.fingers.set(p.id, now);
  }

  /** Returns whether the pointer was part of a drag or pinch, so its release is not a tap. */
  private onFingerUp(p: Phaser.Input.Pointer): boolean {
    if (!this.fingers.delete(p.id) || !this.gestured) return false;
    if (this.fingers.size > 0) {
      // The finger left behind carries the pan on from here, without the pinch's motion.
      this.camera.hold(p.upTime);
      return true;
    }
    // A glide can end on its first frame, before update() would see it start: mark it here.
    if (this.camera.release(p.upTime)) this.wasGliding = true;
    else this.logPanned();
    return true;
  }

  /** Once a drag or pinch, and any glide after it, comes to rest. */
  private logPanned(): void {
    // A release comes between frames: the stage must show the view before the layout reads it.
    this.fit();
    this.log.info('house.panned', { view: this.camera.shot.view.map(Math.round) });
    this.logLayout();
  }

  /** Fits the camera's shot to the view, centred (EXPAND adds side area), and fades the storeys. */
  private fit(): void {
    const { view, alpha } = this.camera.shot;
    const { scale, x, y } = fitView(view, this.scale.width, this.scale.height);
    this.stage.setScale(scale);
    this.stage.setPosition(x, y);
    this.storeys.forEach((layer, s) => layer.setAlpha(alpha[s] ?? 1));
  }

  private roomAt(at: Point): HouseRoom | undefined {
    return roomAt(this.layout, at, (r) => this.camera.shows(r.storey));
  }

  /** Points in game pixels, so E2E tests can tap a room and find Theia on any viewport. */
  private logLayout(): void {
    const { width, height } = this.scale;
    const scale = this.stage.scale;
    const toGame = ([x, y]: Point): Point => [
      Math.round(this.stage.x + x * scale),
      Math.round(this.stage.y + y * scale),
    ];
    const dpPerPx = this.scale.displaySize.width / width;
    const minTap = Math.min(...this.layout.rooms.map((r) => tapSize(r.polygon, r.stand)));
    this.log.info('house.layout', {
      width,
      height,
      scale,
      phone: this.phone,
      // The smallest room's tap area as drawn now (PRD US-HOUSE-05: never under 72 dp).
      minTapDp: Math.round(minTap * scale * dpPerPx),
      theiaRoom: this.walker.room,
      theia: toGame(this.walker.position),
      zoomedTo: this.camera.room ?? null,
      // Read back from the layers, so a test sees the fade as drawn.
      storeys: this.storeys.map((layer) => Math.round(layer.alpha * 100) / 100),
      view: this.camera.shot.view.map(Math.round),
      stands: Object.fromEntries(this.layout.rooms.map((r) => [r.id, toGame(r.stand)])),
      taps: Object.fromEntries(
        this.layout.rooms.map((r) => {
          const at = this.tapPoint(r);
          return [r.id, at ? toGame(at) : null];
        }),
      ),
    });
  }

  /**
   * A layout point on screen where a tap lands on `room`: its stand when that shows, else the
   * nearest point that does, or undefined when none of the room is on screen. A point within the
   * tap slop of the screen's edge does not count: a sliver there is no place to tap.
   */
  private tapPoint(room: HouseRoom): Point | undefined {
    const [x, y, w, h] = boundsOf(room.polygon);
    const side = TAP_SEARCH_GRID + 1;
    const grid = Array.from({ length: side * side }, (_, i): Point => [
      x + (w * (i % side)) / TAP_SEARCH_GRID,
      y + (h * Math.floor(i / side)) / TAP_SEARCH_GRID,
    ]);
    const near = ([px, py]: Point): number => Math.hypot(px - room.stand[0], py - room.stand[1]);
    const s = this.stage.scale;
    const onScreen = ([px, py]: Point): boolean => {
      const gx = this.stage.x + px * s;
      const gy = this.stage.y + py * s;
      const { width, height } = this.scale;
      return Math.min(gx, gy, width - gx, height - gy) >= TAP_SLOP;
    };
    return [room.stand, ...grid.sort((a, b) => near(a) - near(b))].find(
      (p) => onScreen(p) && this.roomAt(p)?.id === room.id,
    );
  }

  private toLayout(p: Phaser.Input.Pointer): Point {
    const s = this.stage.scale;
    return [(p.x - this.stage.x) / s, (p.y - this.stage.y) / s];
  }

  private onTap(at: Point): void {
    const room = this.roomAt(at);
    const zoomed = this.camera.room;
    // In the room she is already in, its activity has the screen.
    if (zoomed && room?.id === zoomed) {
      this.log.info('house.tap_in_room', { room: zoomed });
      return;
    }
    if (zoomed) {
      // Leaving zooms back out (PRD US-HOUSE-01): to the whole house, or on a phone to her room
      // with every storey back. Until the activity scenes and their way home exist, any tap off
      // her room is how she leaves.
      this.log.info('house.zoom_out', { room: zoomed });
      if (!this.phone) this.camera.zoomOut(ROOM_ZOOM.duration, this.zoomEase);
      else if (!room) this.camera.frame(this.roomById(zoomed), ROOM_ZOOM.duration, this.zoomEase);
    }
    if (!room) {
      if (zoomed) return;
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
    this.log.info('house.walk', {
      room: plan.room,
      via: [...plan.via],
      theia: roundPoint(this.walker.position),
    });
    // On a phone the room she is heading to comes into view, so she never needs to pinch.
    if (this.phone) this.camera.frame(room, ROOM_ZOOM.duration, this.zoomEase);
    if (this.companions.follow(this.walker.route, room.parking)) this.parkingIn = room.id;
    const remaining = this.walker.remaining;
    this.spacingAt = remaining > 0 ? remaining / 2 : undefined;
  }

  private tiltBubu(): void {
    const figure = this.bubu.root;
    if (this.tweens.isTweening(figure)) return;
    this.log.info('house.bubu_tilt');
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
    this.actors.sort('y');
  }

  private drawHouse(house: PlaceholderHouse): void {
    const drawOrder = [...this.layout.rooms].sort(paintOrder);
    for (const room of drawOrder) {
      const layer = this.layerOf(room.storey);
      for (const wall of house.walls.filter((w) => w.room === room.id)) {
        layer.add(polygon(this, wall.quad, wall.side === 'left' ? pal.wallLeft : pal.wallRight));
      }
      for (const slab of house.slabs.filter((s) => s.room === room.id)) {
        layer.add(polygon(this, slab.quad, pal.wallRight));
      }
      layer.add(this.drawFloor(room));
    }
    this.drawStairs();
  }

  private layerOf(storey: Storey): Phaser.GameObjects.Container {
    const layer = this.storeys[storey];
    if (!layer) throw new Error(`no layer for storey ${storey}`);
    return layer;
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

  /**
   * Each climbed edge as a ramp line: enough to read where the stairs are. A flight belongs to the
   * storey it climbs to, so it fades with the floor it leads up to.
   */
  private drawStairs(): void {
    const stairs = new Map(this.layout.waypoints.filter((w) => w.stair).map((w) => [w.id, w]));
    for (const [a, b] of this.layout.edges) {
      const from = stairs.get(a);
      const to = stairs.get(b);
      if (!from || !to) continue;
      const g = this.add.graphics();
      g.lineStyle(18, pal.outline, 1);
      g.lineBetween(from.pos[0], from.pos[1], to.pos[0], to.pos[1]);
      this.layerOf(from.storey > to.storey ? from.storey : to.storey).add(g);
    }
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

function roundPoint([x, y]: Point): Point {
  return [Math.round(x), Math.round(y)];
}
