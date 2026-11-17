import * as Phaser from 'phaser';
import type { Point } from '../../../contracts/common.ts';
import type { CompanionPose } from '../../engine/nav/companions';
import type { Facing } from '../../engine/nav/walker';
import { placeholderPalette as pal } from '../../placeholder/palette';

/**
 * A placeholder character: code-drawn shapes standing on `root`'s origin (the feet), so the
 * actors layer can depth-sort by y. Sprites from the manifest replace the shapes, not the API.
 */
export interface ActorView {
  readonly root: Phaser.GameObjects.Container;
  place(pose: CompanionPose): void;
}

const STROKE = 5;
/** Bubu hops once per this many px walked; Ocica sways once per stride. */
const HOP_STRIDE = 70;
const HOP_HEIGHT = 22;
const SWAY_STRIDE = 45;
const SWAY_RAD = 0.18;

/** The eye sits toward where the actor looks: low when facing the viewer, high when facing away. */
function eyeAt(facing: Facing, dx: number, low: number, high: number): Point {
  return [facing.flipX ? -dx : dx, facing.view === 'fr' ? low : high];
}

export function theiaView(scene: Phaser.Scene): ActorView {
  const radius = 34;
  const body = scene.add.circle(0, -radius, radius, pal.theia).setStrokeStyle(6, pal.outline);
  const eye = scene.add.circle(0, 0, 7, pal.outline);
  const root = scene.add.container(0, 0, [body, eye]);
  return {
    root,
    place({ pos, facing }) {
      root.setPosition(pos[0], pos[1]);
      const [x, y] = eyeAt(facing, 14, -radius - 4, -radius - 16);
      eye.setPosition(x, y);
    },
  };
}

/** A bunny: body, two ears, one eye. Bubu is slim with tall ears, Ocica round and wide. */
function bunny(
  scene: Phaser.Scene,
  color: number,
  body: { w: number; h: number },
  ear: { w: number; h: number },
): {
  root: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Container;
  eye: Phaser.GameObjects.Arc;
} {
  const torso = scene.add
    .ellipse(0, -body.h / 2, body.w, body.h, color)
    .setStrokeStyle(STROKE, pal.outline);
  const ears = [-1, 1].map((side) =>
    scene.add
      .ellipse(side * body.w * 0.22, -body.h - ear.h / 2 + 8, ear.w, ear.h, color)
      .setStrokeStyle(STROKE, pal.outline),
  );
  const eye = scene.add.circle(0, 0, 5, pal.outline);
  const figure = scene.add.container(0, 0, [...ears, torso, eye]);
  return { root: scene.add.container(0, 0, [figure]), figure, eye };
}

/** Bubu hops ahead (PRD US-HOUSE-02): an arc per stride while moving. */
export function bubuView(scene: Phaser.Scene): ActorView {
  const h = 52;
  const { root, figure, eye } = bunny(scene, pal.bubu, { w: 34, h }, { w: 13, h: 38 });
  return {
    root,
    place({ pos, facing, moving, travelled }) {
      root.setPosition(pos[0], pos[1]);
      const phase = (travelled % HOP_STRIDE) / HOP_STRIDE;
      figure.setY(moving ? -Math.sin(phase * Math.PI) * HOP_HEIGHT : 0);
      const [x, y] = eyeAt(facing, 8, -h * 0.6, -h * 0.78);
      eye.setPosition(x, y);
    },
  };
}

/** Ocica waddles behind (PRD US-HOUSE-02): a side-to-side sway per stride while moving. */
export function ocicaView(scene: Phaser.Scene): ActorView {
  const h = 46;
  const { root, figure, eye } = bunny(scene, pal.ocica, { w: 56, h }, { w: 15, h: 26 });
  return {
    root,
    place({ pos, facing, moving, travelled }) {
      root.setPosition(pos[0], pos[1]);
      figure.setRotation(moving ? Math.sin((travelled / SWAY_STRIDE) * Math.PI) * SWAY_RAD : 0);
      const [x, y] = eyeAt(facing, 13, -h * 0.55, -h * 0.75);
      eye.setPosition(x, y);
    },
  };
}
