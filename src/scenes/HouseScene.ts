import * as Phaser from 'phaser';
import {
  depthKey,
  toScreen,
  type IsoProjection,
  type ScreenPoint,
  type WorldPoint,
} from '../engine/iso/projection';
import { markActiveScene, servicesOf } from '../game/services';
import type { Logger } from '../log';
import {
  PLACEHOLDER_WALL_HEIGHT,
  placeholderRooms,
  type PlaceholderRoom,
} from '../placeholder/house';
import { placeholderPalette as pal } from '../placeholder/palette';

const TILE_WIDTH = 180;
const GRID_TILES = 8;
const RESIZE_SETTLE_MS = 120;

/**
 * SCR-HOUSE placeholder: a code-drawn isometric cutaway with tappable rooms. The real hub replaces
 * the drawing with Antigravity's layers and design/layouts/house.json; the tap → walk flow stays.
 */
export class HouseScene extends Phaser.Scene {
  static readonly KEY = 'House';

  private log!: Logger;
  private theia!: Phaser.GameObjects.Arc;
  private roomLayer!: Phaser.GameObjects.Container;
  /** Theia's position is kept as a room, not screen pixels, so it survives every resize. */
  private theiaRoom: PlaceholderRoom | undefined;

  constructor() {
    super(HouseScene.KEY);
  }

  create(): void {
    this.log = servicesOf(this).logger.forScene(HouseScene.KEY);
    this.cameras.main.setBackgroundColor(pal.sky);
    this.roomLayer = this.add.container(0, 0);
    this.theia = this.add.circle(0, 0, 40, pal.theia).setStrokeStyle(6, pal.outline);
    this.theia.setDepth(1000);
    this.theiaRoom = placeholderRooms[0];

    this.draw();
    // A window drag or rotation fires dozens of RESIZE events; rebuild once the size settles.
    let settle: Phaser.Time.TimerEvent | undefined;
    const onResize = (): void => {
      settle?.remove();
      settle = this.time.delayedCall(RESIZE_SETTLE_MS, () => {
        this.draw();
      });
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
    });

    markActiveScene(HouseScene.KEY);
    this.log.info('scene.ready', { rooms: placeholderRooms.length });
  }

  /** Centers the house, walls included, in the current camera view. */
  private projection(): IsoProjection {
    const { centerX, centerY } = this.cameras.main;
    const atOrigin: IsoProjection = { tileWidth: TILE_WIDTH, origin: { x: 0, y: 0 } };
    const top = toScreen({ x: 0, y: 0, z: PLACEHOLDER_WALL_HEIGHT }, atOrigin).y;
    const bottom = toScreen({ x: GRID_TILES, y: GRID_TILES }, atOrigin).y;
    return { tileWidth: TILE_WIDTH, origin: { x: centerX, y: centerY - (top + bottom) / 2 } };
  }

  private draw(): void {
    const proj = this.projection();
    this.roomLayer.removeAll(true);
    const sorted = [...placeholderRooms].sort(
      (a, b) => depthKey({ x: a.x, y: a.y }) - depthKey({ x: b.x, y: b.y }),
    );
    for (const room of sorted) {
      this.roomLayer.add(this.drawRoom(room, proj));
    }
    // A walk in progress was tweening toward old screen coordinates: land her in its target room.
    this.tweens.killTweensOf(this.theia);
    if (this.theiaRoom) this.theia.setPosition(...centerOf(this.theiaRoom, proj));
    this.log.info('house.layout', {
      width: this.scale.width,
      height: this.scale.height,
      theiaRoom: this.theiaRoom?.id ?? null,
    });
  }

  private drawRoom(room: PlaceholderRoom, proj: IsoProjection): Phaser.GameObjects.Graphics {
    const floor: readonly WorldPoint[] = [
      { x: room.x, y: room.y },
      { x: room.x + room.w, y: room.y },
      { x: room.x + room.w, y: room.y + room.d },
      { x: room.x, y: room.y + room.d },
    ];
    const outline = floor.map((p) => toVec(toScreen(p, proj)));
    const g = this.add.graphics();

    // Repaints from scratch so hover never accumulates draw commands in the Graphics buffer.
    const paint = (floorColor: number): void => {
      g.clear();
      // Cutaway: only back walls (on the far edges of the house) are drawn.
      const [back, right, , left] = floor;
      if (back && right && room.y === 0) fillWall(g, back, right, proj, pal.wallRight);
      if (back && left && room.x === 0) fillWall(g, back, left, proj, pal.wallLeft);
      g.fillStyle(floorColor, 1);
      g.fillPoints(outline, true);
      g.lineStyle(4, pal.outline, 1);
      g.strokePoints(outline, true);
    };
    paint(pal.floor);

    g.setInteractive({
      hitArea: new Phaser.Geom.Polygon(outline),
      hitAreaCallback: (area: Phaser.Geom.Polygon, x: number, y: number) => area.contains(x, y),
      useHandCursor: true,
    });
    g.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      paint(pal.highlight);
    });
    g.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      paint(pal.floor);
    });
    g.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.walkTo(room, proj);
    });
    return g;
  }

  private walkTo(room: PlaceholderRoom, proj: IsoProjection): void {
    const [x, y] = centerOf(room, proj);
    this.log.info('house.room_tap', { room: room.id });
    this.theiaRoom = room;
    this.tweens.killTweensOf(this.theia);
    // Straight-line stand-in; waypoint navigation (ARCHITECTURE §6) replaces it.
    this.tweens.add({ targets: this.theia, x, y, duration: 600, ease: 'Sine.easeInOut' });
  }
}

function toVec(p: ScreenPoint): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(p.x, p.y);
}

function centerOf(room: PlaceholderRoom, proj: IsoProjection): [number, number] {
  const c = toScreen({ x: room.x + room.w / 2, y: room.y + room.d / 2 }, proj);
  return [c.x, c.y];
}

function fillWall(
  g: Phaser.GameObjects.Graphics,
  a: WorldPoint,
  b: WorldPoint,
  proj: IsoProjection,
  color: number,
): void {
  const h = PLACEHOLDER_WALL_HEIGHT;
  const points = [a, b, { ...b, z: h }, { ...a, z: h }].map((p) => toVec(toScreen(p, proj)));
  g.fillStyle(color, 1);
  g.fillPoints(points, true);
  g.lineStyle(4, pal.outline, 1);
  g.strokePoints(points, true);
}
