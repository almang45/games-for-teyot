import * as Phaser from 'phaser';
import { FollowStroke } from '../engine/tracing/follow';
import { LatencyMeter } from '../engine/tracing/latency';
import { slice, type Point } from '../engine/tracing/path';
import { PointerGate, type IgnoreReason } from '../engine/tracing/pointerGate';
import { markActiveScene, servicesOf } from '../game/services';
import type { Logger } from '../log';
import { placeholderPalette as pal } from '../placeholder/palette';
import { SPIKE_DEFAULTS, SPIKE_ITEMS, type SpikeItem, type SpikeSettings } from '../spike/tracing';
import { createTracingPanel, type PanelReadout, type TracingPanel } from '../spike/tracingPanel';

/** Glyph box height as a share of the screen height: the tracing area takes the full height. */
const BOX_SHARE = 0.72;
const INK_RADIUS = 0.035;
const BALL_RADIUS = 0.06;
const TRAIL_POINTS = 48;
const ITEM_REPEAT_MS = 1500;
const READOUT_MS = 250;
/** Corners sharper than this get a round cap, since Graphics lines have mitre-less joins. */
const CORNER_COS = Math.cos((20 * Math.PI) / 180);

interface Box {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

const noIgnores = (): Record<IgnoreReason, number> => ({
  'second-pointer': 0,
  palm: 0,
  'out-of-reach': 0,
});

/**
 * PRD US-TRACE-00: the tracing spike. One vertical stroke, a circle and the digit 1 in Follow mode,
 * with a live debug panel, so Papa can judge on the real tablet whether tracing feels right before
 * any art is drawn. Opened with `/?browser=1&spike=tracing`; it never runs in the game flow.
 *
 * Pointer events are read from the canvas directly, not through Phaser's input, for the coalesced
 * samples, contact size and timestamps the spike needs.
 */
export class TracingSpikeScene extends Phaser.Scene {
  static readonly KEY = 'TracingSpike';

  private log!: Logger;
  private settings: SpikeSettings = SPIKE_DEFAULTS;
  private item: SpikeItem = firstItem();
  private strokeIndex = 0;
  private follow!: FollowStroke;
  private strokeStartedAt = 0;
  private readonly gate = new PointerGate();
  /** Rolling, for the panel. */
  private readonly meter = new LatencyMeter();
  /** Per stroke, for the log. */
  private readonly strokeMeter = new LatencyMeter();
  /** Timestamps of input events whose ink hasn't reached a frame yet. */
  private pending: number[] = [];
  private ignored = noIgnores();
  private contact: PanelReadout['contact'];
  private trail: Point[] = [];
  private box: Box = { x: 0, y: 0, size: 1 };
  /** The guide only changes with the stroke, layout or settings; the ink with every sample. */
  private stale = { guide: true, ink: true };
  private guide!: Phaser.GameObjects.Graphics;
  private ink!: Phaser.GameObjects.Graphics;
  private trailLayer!: Phaser.GameObjects.Graphics;
  private ball!: Phaser.GameObjects.Arc;
  private panel: TracingPanel | undefined;
  private repeat: Phaser.Time.TimerEvent | undefined;

  constructor() {
    super(TracingSpikeScene.KEY);
  }

  create(): void {
    this.log = servicesOf(this).logger.forScene(TracingSpikeScene.KEY);
    this.cameras.main.setBackgroundColor(pal.sky);
    this.guide = this.add.graphics();
    this.ink = this.add.graphics();
    this.trailLayer = this.add.graphics();
    this.ball = this.add.circle(0, 0, 10, pal.theia).setStrokeStyle(8, pal.outline);

    this.listen();
    this.panel = createTracingPanel(document.body, {
      items: SPIKE_ITEMS,
      settings: this.settings,
      onSettings: (settings) => {
        this.settings = settings;
        this.stale = { guide: true, ink: true };
      },
      onSettled: (settings) => {
        this.log.info('spike.trace.settings', { ...settings });
      },
      onItem: (id) => {
        const item = SPIKE_ITEMS.find((i) => i.id === id);
        if (item) this.startItem(item);
      },
      onRestart: () => {
        this.startItem(this.item);
      },
    });
    const readout = this.time.addEvent({
      delay: READOUT_MS,
      loop: true,
      callback: () => {
        this.panel?.show(this.readout());
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      readout.remove();
      this.panel?.destroy();
      this.panel = undefined;
    });

    this.layout();
    this.startItem(this.item);
    markActiveScene(TracingSpikeScene.KEY);
    this.log.info('scene.ready', {
      items: SPIKE_ITEMS.map((i) => i.id),
      settings: { ...this.settings },
    });
  }

  override update(): void {
    if (this.stale.guide) this.drawGuide();
    if (this.stale.ink) this.drawInk();
    this.stale = { guide: false, ink: false };
  }

  private listen(): void {
    const canvas = this.game.canvas;
    const down = (e: PointerEvent): void => {
      this.onDown(canvas, e);
    };
    const move = (e: PointerEvent): void => {
      this.onMove(e);
    };
    const end = (e: PointerEvent): void => {
      this.gate.release(e.pointerId);
    };
    // Input-to-ink latency: from each event that moved the ink to the end of the frame drawing it.
    const frame = (): void => {
      if (this.pending.length === 0) return;
      const now = performance.now();
      for (const at of this.pending) {
        this.meter.add(now - at);
        this.strokeMeter.add(now - at);
      }
      this.pending = [];
    };
    const resize = (): void => {
      this.layout();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      canvas.addEventListener(type, end);
    }
    this.game.events.on(Phaser.Core.Events.POST_RENDER, frame);
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        canvas.removeEventListener(type, end);
      }
      this.game.events.off(Phaser.Core.Events.POST_RENDER, frame);
      this.scale.off(Phaser.Scale.Events.RESIZE, resize);
    });
  }

  private onDown(canvas: HTMLCanvasElement, e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const contact = { id: e.pointerId, type: e.pointerType, width: e.width, height: e.height };
    this.contact = contact;
    const p = this.toUnit(e);
    const decision = this.gate.down(
      contact,
      this.follow.reaches(p, this.settings),
      this.settings.palmPx,
    );
    if (!decision.accepted) {
      this.ignored[decision.reason] += 1;
      this.log.info('spike.trace.pointer_ignored', {
        reason: decision.reason,
        pointerType: e.pointerType,
        width: Math.round(e.width),
        height: Math.round(e.height),
      });
      return;
    }
    try {
      // Keeps the moves coming when the finger slides off the canvas edge.
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      this.log.warn('spike.trace.capture_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    this.trail = [];
    this.feed([p], e.timeStamp);
  }

  private onMove(e: PointerEvent): void {
    if (!this.gate.owns(e.pointerId)) return;
    // Chrome batches touch moves per frame; the coalesced events hold every sample in between.
    const batch = 'getCoalescedEvents' in e ? e.getCoalescedEvents() : [];
    const samples = (batch.length > 0 ? batch : [e]).map((s) => this.toUnit(s));
    this.feed(samples, e.timeStamp);
  }

  private feed(samples: readonly Point[], timeStamp: number): void {
    let moved = false;
    for (const p of samples) {
      if (this.follow.feed(p, this.settings)) moved = true;
    }
    if (this.settings.showTrail) this.trail = [...this.trail, ...samples].slice(-TRAIL_POINTS);
    if (moved || this.settings.showTrail) {
      this.stale.ink = true;
      this.pending.push(timeStamp);
    }
    if (moved && this.follow.done) this.completeStroke();
  }

  private startItem(item: SpikeItem): void {
    this.repeat?.remove();
    this.repeat = undefined;
    this.item = item;
    this.ignored = noIgnores();
    this.meter.reset();
    this.startStroke(0);
  }

  private startStroke(index: number): void {
    const stroke = this.item.glyph.strokes[index];
    if (!stroke) throw new Error(`${this.item.id} has no stroke ${index + 1}`);
    this.strokeIndex = index;
    this.follow = new FollowStroke(stroke);
    this.gate.reset();
    this.strokeMeter.reset();
    this.pending = [];
    this.trail = [];
    this.strokeStartedAt = performance.now();
    this.stale = { guide: true, ink: true };
    this.log.info('spike.trace.stroke_start', {
      item: this.item.id,
      stroke: index + 1,
      strokes: this.item.glyph.strokes.length,
      // Lets the E2E tests map glyph units to the screen.
      box: { x: this.box.x, y: this.box.y, size: this.box.size },
      frame: { width: this.scale.width, height: this.scale.height },
    });
  }

  private completeStroke(): void {
    const strokes = this.item.glyph.strokes;
    this.log.info('spike.trace.stroke_done', {
      item: this.item.id,
      stroke: this.strokeIndex + 1,
      ms: Math.round(performance.now() - this.strokeStartedAt),
      latency: this.strokeMeter.summary() ?? null,
      ignored: { ...this.ignored },
      corridor: this.settings.corridor,
    });
    const end = this.follow.path.points.at(-1);
    if (end) this.sparkle(end);
    if (this.strokeIndex + 1 < strokes.length) {
      this.startStroke(this.strokeIndex + 1);
      return;
    }
    this.log.info('spike.trace.item_done', { item: this.item.id });
    this.repeat = this.time.delayedCall(ITEM_REPEAT_MS, () => {
      this.startItem(this.item);
    });
  }

  private layout(): void {
    const { width, height } = this.scale;
    const size = Math.min(height * BOX_SHARE, width * 0.9);
    this.box = { x: (width - size) / 2, y: (height - size) / 2, size };
    this.stale = { guide: true, ink: true };
  }

  private drawGuide(): void {
    this.guide.clear();
    this.item.glyph.strokes.forEach((stroke, i) => {
      if (i < this.strokeIndex) return;
      if (i === this.strokeIndex && this.settings.showCorridor) {
        this.tube(this.guide, stroke.points, this.settings.corridor, pal.highlight, 0.6);
      }
      this.tube(this.guide, stroke.points, INK_RADIUS, pal.floor, i === this.strokeIndex ? 1 : 0.4);
    });
  }

  private drawInk(): void {
    const { size } = this.box;
    this.ink.clear();
    this.item.glyph.strokes.slice(0, this.strokeIndex).forEach((stroke) => {
      this.tube(this.ink, stroke.points, INK_RADIUS, pal.button);
    });
    this.tube(this.ink, slice(this.follow.path, 0, this.follow.progress), INK_RADIUS, pal.button);
    const ball = this.toScreen(this.follow.ball);
    this.ball
      .setPosition(ball.x, ball.y)
      .setRadius(BALL_RADIUS * size)
      .setVisible(!this.follow.done);

    this.trailLayer.clear();
    if (this.settings.showTrail && this.trail.length > 1) {
      this.trailLayer.lineStyle(4, pal.outline, 0.8);
      this.trailLayer.strokePoints(this.trail.map((p) => this.vec(p)));
    }
  }

  /** A thick line with round ends and corners, `radius` in glyph heights. */
  private tube(
    g: Phaser.GameObjects.Graphics,
    points: readonly Point[],
    radius: number,
    color: number,
    alpha = 1,
  ): void {
    if (points.length < 2) return;
    const r = radius * this.box.size;
    g.lineStyle(2 * r, color, alpha);
    g.strokePoints(points.map((p) => this.vec(p)));
    g.fillStyle(color, alpha);
    points.forEach((p, i) => {
      if (i === 0 || i === points.length - 1 || isCorner(points, i)) {
        const s = this.toScreen(p);
        g.fillCircle(s.x, s.y, r);
      }
    });
  }

  private sparkle(at: Point): void {
    const origin = this.toScreen(at);
    const spread = 0.12 * this.box.size;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const star = this.add.circle(origin.x, origin.y, 0.015 * this.box.size, pal.highlight);
      star.setStrokeStyle(3, pal.outline);
      this.tweens.add({
        targets: star,
        x: origin.x + Math.cos(angle) * spread,
        y: origin.y + Math.sin(angle) * spread,
        alpha: 0,
        duration: 500,
        ease: 'Quad.easeOut',
        onComplete: () => {
          star.destroy();
        },
      });
    }
  }

  private readout(): PanelReadout {
    return {
      item: this.item.label,
      stroke: `${this.strokeIndex + 1}/${this.item.glyph.strokes.length}`,
      latency: this.meter.summary(),
      contact: this.contact,
      ignored: this.ignored,
      fps: this.game.loop.actualFps,
    };
  }

  private toUnit(e: PointerEvent): Point {
    const x = this.scale.transformX(e.pageX);
    const y = this.scale.transformY(e.pageY);
    return { x: (x - this.box.x) / this.box.size, y: (y - this.box.y) / this.box.size };
  }

  private toScreen(p: Point): Point {
    return { x: this.box.x + p.x * this.box.size, y: this.box.y + p.y * this.box.size };
  }

  private vec(p: Point): Phaser.Math.Vector2 {
    const s = this.toScreen(p);
    return new Phaser.Math.Vector2(s.x, s.y);
  }
}

function firstItem(): SpikeItem {
  const item = SPIKE_ITEMS[0];
  if (!item) throw new Error('the tracing spike has no items');
  return item;
}

function isCorner(points: readonly Point[], i: number): boolean {
  const a = points[i - 1];
  const b = points[i];
  const c = points[i + 1];
  if (!a || !b || !c) return false;
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
  return cos < CORNER_COS;
}
