import * as Phaser from 'phaser';
import { depthKey, toScreen, type IsoProjection, type ScreenPoint } from '../engine/iso/projection';
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

/**
 * SCR-HOUSE placeholder: a code-drawn isometric cutaway with tappable rooms. The real hub replaces
 * the drawing with Antigravity's layers and design/layouts/house.json; the tap → walk flow stays.
 */
export class HouseScene extends Phaser.Scene {
  static readonly KEY = 'House';

  private log!: Logger;
  private theia!: Phaser.GameObjects.Arc;
  private roomLayer!: Phaser.GameObjects.Container;

  constructor() {
    super(HouseScene.KEY);
  }

  create(): void {
    this.log = servicesOf(this).logger.forScene(HouseScene.KEY);
    this.cameras.main.setBackgroundColor(pal.sky);
    this.roomLayer = this.add.container(0, 0);
    this.theia = this.add.circle(0, 0, 40, pal.theia).setStrokeStyle(6, pal.outline);

    const redraw = (): void => {
      this.draw();
    };
    redraw();
    this.scale.on(Phaser.Scale.Events.RESIZE, redraw);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, redraw);
    });

    markActiveScene(HouseScene.KEY);
    this.log.info('scene.ready', { rooms: placeholderRooms.length });
  }

  private projection(): IsoProjection {
    const { centerX, centerY } = this.cameras.main;
    const gridHeight = GRID_TILES * (TILE_WIDTH / 2);
    const wallRise = PLACEHOLDER_WALL_HEIGHT * (TILE_WIDTH / 2);
    return {
      tileWidth: TILE_WIDTH,
      origin: { x: centerX, y: centerY - (gridHeight - wallRise) / 2 },
    };
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
    const start = placeholderRooms[0];
    if (start) this.theia.setPosition(...centerOf(start, proj)).setDepth(1000);
  }

  private drawRoom(room: PlaceholderRoom, proj: IsoProjection): Phaser.GameObjects.Graphics {
    const corners = [
      toScreen({ x: room.x, y: room.y }, proj),
      toScreen({ x: room.x + room.w, y: room.y }, proj),
      toScreen({ x: room.x + room.w, y: room.y + room.d }, proj),
      toScreen({ x: room.x, y: room.y + room.d }, proj),
    ] as const;
    const outline = corners.map(toVec);
    const g = this.add.graphics();

    // Cutaway: only back walls (on the far edges of the house) are drawn.
    if (room.y === 0) fillWall(g, corners[0], corners[1], proj, pal.wallRight);
    if (room.x === 0) fillWall(g, corners[0], corners[3], proj, pal.wallLeft);

    const paint = (color: number): void => {
      g.fillStyle(color, 1);
      g.fillPoints(outline, true);
      g.lineStyle(4, pal.outline, 1);
      g.strokePoints(outline, true);
    };
    paint(pal.floor);

    const hit = new Phaser.Geom.Polygon(outline);
    g.setInteractive({
      hitArea: hit,
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
  a: ScreenPoint,
  b: ScreenPoint,
  proj: IsoProjection,
  color: number,
): void {
  const rise = PLACEHOLDER_WALL_HEIGHT * (proj.tileWidth / 2);
  const points = [a, b, { x: b.x, y: b.y - rise }, { x: a.x, y: a.y - rise }].map(toVec);
  g.fillStyle(color, 1);
  g.fillPoints(points, true);
  g.lineStyle(4, pal.outline, 1);
  g.strokePoints(points, true);
}
