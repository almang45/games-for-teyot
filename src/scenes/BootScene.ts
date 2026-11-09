import * as Phaser from 'phaser';
import { getStrings } from '../content/strings';
import { playPlaceholderChime, unlockAudio } from '../engine/audio/unlock';
import { markActiveScene, servicesOf } from '../game/services';
import { placeholderFont, placeholderPalette as pal } from '../placeholder/palette';
import { HouseScene } from './HouseScene';

const BUTTON_RADIUS = 170;

/** SCR-BOOT: one big "Mulai" button; its tap is the gesture that unlocks audio (US-AUD-01). */
export class BootScene extends Phaser.Scene {
  static readonly KEY = 'Boot';

  constructor() {
    super(BootScene.KEY);
  }

  create(): void {
    const { logger, audio } = servicesOf(this);
    const log = logger.forScene(BootScene.KEY);
    this.cameras.main.setBackgroundColor(pal.sky);

    const title = this.add
      .text(0, 0, 'Rumah Cici Theia', {
        fontFamily: placeholderFont,
        fontSize: '88px',
        fontStyle: 'bold',
        color: pal.text,
      })
      .setOrigin(0.5);

    const button = this.add
      .circle(0, 0, BUTTON_RADIUS, pal.button)
      .setStrokeStyle(10, pal.outline)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, getStrings().boot.start, {
        fontFamily: placeholderFont,
        fontSize: '96px',
        fontStyle: 'bold',
        color: pal.textOnButton,
      })
      .setOrigin(0.5);

    const layout = (): void => {
      const { centerX, centerY } = this.cameras.main;
      title.setPosition(centerX, centerY - 340);
      button.setPosition(centerX, centerY + 60);
      label.setPosition(centerX, centerY + 60);
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
    });

    const pulse = this.tweens.add({
      targets: [button, label],
      scale: 1.06,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    let started = false;
    button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      button.setFillStyle(pal.buttonPressed);
    });
    button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      button.setFillStyle(pal.button);
    });
    button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (started) return;
      started = true;
      pulse.stop();
      const tapAt = performance.now();
      unlockAudio(audio)
        .then(() => {
          log.info('boot.audio_unlocked', {
            latencyMs: Math.round(performance.now() - tapAt),
            audioState: audio.state,
          });
          // Its own catch, so a chime bug is never reported as a failed unlock.
          try {
            playPlaceholderChime(audio);
          } catch (err) {
            log.error('boot.chime_failed', err);
          }
        })
        .catch((err: unknown) => {
          // Silent play beats a stuck start screen; the parent log shows why.
          log.error('boot.audio_unlock_failed', err);
        })
        .finally(() => {
          this.scene.start(HouseScene.KEY);
        });
    });

    markActiveScene(BootScene.KEY);
    // Before the tap this must not be 'running'; US-AUD-01's E2E test checks it.
    log.info('scene.ready', { audioState: audio.state });
  }
}
