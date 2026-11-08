import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { strings } from './content/strings';
import { renderInstallScreen } from './install/installScreen';
import { captureGlobalErrors, createAppLog, type Logger } from './log';
import { detectInstallPlatform, readLaunchSignals, resolveLaunchMode } from './platform/launch';

const sessionId = crypto.randomUUID();
const { logger } = createAppLog(sessionId, import.meta.env.DEV);
captureGlobalErrors(window, logger);

function registerServiceWorker(log: Logger): void {
  registerSW({
    immediate: true,
    // registerType "prompt": a waiting worker activates on the next cold start, never mid-session.
    onNeedRefresh() {
      log.info('pwa.update_waiting');
    },
    onOfflineReady() {
      log.info('pwa.offline_ready');
    },
    onRegisterError(err: unknown) {
      log.error('pwa.register_failed', err);
    },
  });
}

async function requestPersistentStorage(log: Logger): Promise<void> {
  if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') {
    log.warn('storage.persist_unsupported');
    return;
  }
  const persisted = await navigator.storage.persist();
  log.info('storage.persist', { persisted });
}

async function startGame(root: HTMLElement, log: Logger): Promise<void> {
  // Phaser is loaded lazily so SCR-INSTALL stays light.
  const { createGame } = await import('./game/createGame');
  const audio = new AudioContext({ latencyHint: 'interactive' });
  createGame(root, { logger: log, audio });
}

function main(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app root element missing from index.html');

  const signals = readLaunchSignals(window);
  const mode = resolveLaunchMode(signals);
  logger.info('app.launch', { mode, ...signals, version: __APP_VERSION__ });
  registerServiceWorker(logger);

  if (mode === 'install') {
    renderInstallScreen(
      root,
      detectInstallPlatform(navigator.userAgent),
      strings.install,
      new URL(location.href),
    );
    return;
  }

  requestPersistentStorage(logger).catch((err: unknown) => {
    logger.error('storage.persist_failed', err);
  });
  startGame(root, logger).catch((err: unknown) => {
    logger.error('app.start_failed', err);
  });
}

main();
