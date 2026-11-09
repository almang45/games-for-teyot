import type * as Phaser from 'phaser';
import type { Logger } from '../log';

/** Cross-scene dependencies, injected through the game registry instead of module globals. */
export interface GameServices {
  readonly logger: Logger;
  readonly audio: AudioContext;
}

const SERVICES_KEY = 'rct.services';

export function provideServices(game: Phaser.Game, services: GameServices): void {
  game.registry.set(SERVICES_KEY, services);
}

export function servicesOf(scene: Phaser.Scene): GameServices {
  const services: unknown = scene.registry.get(SERVICES_KEY);
  if (!isGameServices(services)) {
    throw new Error(`Scene ${scene.scene.key} started before game services were provided`);
  }
  return services;
}

function isGameServices(value: unknown): value is GameServices {
  return typeof value === 'object' && value !== null && 'logger' in value && 'audio' in value;
}

/** DOM marker for E2E tests and the parent log; carries no game state. */
export function markActiveScene(key: string): void {
  document.body.dataset.scene = key;
}
