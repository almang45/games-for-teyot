import './styles.css';
import type { Game } from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { strings } from './content/strings';
import { renderInstallScreen } from './install/installScreen';
import {
  captureGlobalErrors,
  ConsoleSink,
  createAppLog,
  createSessionId,
  serializeError,
  Logger,
  StoredLogSink,
} from './log';
import {
  detectInstallPlatform,
  readLaunchSignals,
  requestedSpike,
  resolveLaunchMode,
  type Spike,
} from './platform/launch';
import { renderFailureScreen } from './shell/failureScreen';
import { AUTO_RELOAD_DELAY_MS, claimAutoReload } from './shell/recovery';
import { openStorage, requestPersistence, type OpenedStorage } from './storage';

// No module imported above does work at import time, so the capture below sees every boot error.
const sessionId = createSessionId();
const appLog = createAppLog(sessionId, import.meta.env.DEV);
const { logger } = appLog;
/** The in-memory ring and the console only, for reporting that the stored log failed. */
const unstored = new Logger([appLog.ring, new ConsoleSink('warn')], sessionId);
const appRoot = document.getElementById('app');
let game: Game | undefined;
let failed = false;

let reloading = false;
function reload(): void {
  if (reloading) return;
  reloading = true;
  location.reload();
}

function destroyGame(): void {
  const current = game;
  game = undefined;
  if (!current) return;
  try {
    // destroy() only flags the game for teardown at the start of the next frame. An error thrown
    // inside a frame stops Phaser from scheduling one, so stop the loop and run that frame now:
    // otherwise WebGL, the AudioContext and Phaser's window input listeners stay alive.
    current.loop.stop();
    current.destroy(true);
    current.step(performance.now(), 0);
  } catch (err) {
    logger.error('app.game_destroy_failed', err);
  }
}

/**
 * PRD §7.5: any failure ends on the recovery screen, then one automatic reload to SCR-BOOT. In M0
 * the hub is the only scene, so there is no OVL-RECOVER step yet.
 */
function fail(): void {
  if (failed || !appRoot) return;
  failed = true;
  destroyGame();
  const autoReload = claimAutoReload(window, Date.now(), (err: unknown) => {
    logger.warn('app.recovery_storage_unavailable', { error: serializeError(err) });
  });
  logger.info('app.recovering', { autoReload });
  renderFailureScreen(appRoot, reload);
  if (autoReload) setTimeout(reload, AUTO_RELOAD_DELAY_MS);
}

captureGlobalErrors(window, logger, fail);

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
  const state = await requestPersistence('storage' in navigator ? navigator.storage : undefined);
  log.info('storage.persist', { state });
}

/** Opens progress storage and, once it is there, keeps the log on the device too. */
async function startStorage(log: Logger): Promise<OpenedStorage> {
  const storage = await openStorage(
    'indexedDB' in window ? window.indexedDB : undefined,
    log,
    () => {
      // A newer version of the app opened in another tab and needs the database.
      log.warn('storage.version_change');
      reload();
    },
  );
  if (storage.db) {
    appLog.persistTo(
      new StoredLogSink(storage.db, (err: unknown) => {
        // Not through `log`: its stored sink is the one failing, and would feed itself.
        unstored.error('log.store_failed', err);
      }),
    );
  }
  return storage;
}

async function startGame(root: HTMLElement, log: Logger, spike: Spike | undefined): Promise<void> {
  // Phaser is loaded lazily so SCR-INSTALL stays light, and the spike only when asked for.
  const [{ createGame }, scenes, { progress }] = await Promise.all([
    import('./game/createGame'),
    spike === 'tracing'
      ? import('./scenes/TracingSpikeScene').then((m) => [m.TracingSpikeScene])
      : undefined,
    startStorage(log),
  ]);
  // fail() may have run while the chunk loaded; a game built now would run hidden under its screen.
  if (failed) return;
  const audio = new AudioContext({ latencyHint: 'interactive' });
  const started = createGame(root, { logger: log, audio, progress }, scenes);
  started.events.once('destroy', () => {
    log.info('game.destroyed');
    audio.close().catch((err: unknown) => {
      log.error('game.audio_close_failed', err);
    });
  });
  game = started;
}

type NavigatorWithHints = Navigator & { userAgentData?: { platform?: string } };

function main(root: HTMLElement): void {
  const platform = detectInstallPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    uaPlatform: (navigator as NavigatorWithHints).userAgentData?.platform,
  });
  const signals = readLaunchSignals(window, platform, (err: unknown) => {
    logger.warn('launch.storage_unavailable', { error: serializeError(err) });
  });
  const mode = resolveLaunchMode(signals);
  logger.info('app.launch', { mode, platform, ...signals, version: __APP_VERSION__ });
  registerServiceWorker(logger);

  if (mode === 'install') {
    renderInstallScreen(root, platform, strings.install, new URL(location.href));
    return;
  }

  requestPersistentStorage(logger).catch((err: unknown) => {
    logger.error('storage.persist_failed', err);
  });
  const spike = requestedSpike(location.search);
  if (spike === 'unknown') logger.warn('app.spike_unknown', { search: location.search });
  else if (spike) logger.info('app.spike', { spike });
  startGame(root, logger, spike === 'unknown' ? undefined : spike).catch((err: unknown) => {
    logger.error('app.start_failed', err);
    fail();
  });
}

if (appRoot) {
  try {
    main(appRoot);
  } catch (err) {
    logger.error('app.boot_failed', err);
    fail();
  }
} else {
  // Only a broken index.html gets here; there is nowhere to render a screen.
  logger.error('app.boot_failed', new Error('#app root element missing from index.html'));
}
