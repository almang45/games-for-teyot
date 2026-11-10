import * as Phaser from 'phaser';
import { placeholderPalette } from '../placeholder/palette';
import { BootScene } from '../scenes/BootScene';
import { HouseScene } from '../scenes/HouseScene';
import { provideServices, type GameServices } from './services';

/** Design frame (PRD NFR-COMPAT-01): 16:10, matching the Tab S10+ and both laptops. */
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1200;

/** The game flow; the tracing spike (US-TRACE-00) passes its own scene instead. */
const GAME_SCENES: Phaser.Types.Scenes.SceneType[] = [BootScene, HouseScene];

export function createGame(
  parent: HTMLElement,
  services: GameServices,
  scenes: Phaser.Types.Scenes.SceneType[] = GAME_SCENES,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: placeholderPalette.sky,
    banner: false,
    // EXPAND keeps the whole 1920×1200 frame visible and adds side area on wider screens (phones).
    scale: {
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
    },
    // The app owns the AudioContext (services.audio). Handing it to Phaser would add Phaser's own
    // unlock: an unhandled resume() at boot plus body-wide gesture listeners that race the Mulai tap.
    audio: { noAudio: true },
    input: { activePointers: 3 },
    render: { antialias: true, powerPreference: 'high-performance' },
    scene: scenes,
    callbacks: {
      // Before boot, so every scene's create() can rely on the services being present.
      preBoot: (game) => {
        provideServices(game, services);
      },
    },
  });
}
