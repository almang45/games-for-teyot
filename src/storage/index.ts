import type { Logger } from '../log/logger';
import { openDatabase, type DatabaseEvents } from './db';
import { IndexedDbProgressStore, MemoryProgressStore, type ProgressStore } from './progress';

export { CorruptRecordError, IndexedDbProgressStore, MemoryProgressStore } from './progress';
export type { ProgressStore } from './progress';
export { persistState, requestPersistence, type PersistState } from './persistence';
export { exportFileName, parseImport, serializeExport } from './transfer';
export type { ImportProblem, ImportResult } from './transfer';
export * from './schema';
export { closeNow, type DatabaseEvents } from './db';

/**
 * How long the game waits for IndexedDB before it starts with progress in memory. Some WebKit and
 * WebView builds leave an open request hanging, and she must still be able to play.
 */
export const OPEN_DEADLINE_MS = 4_000;

export interface OpenedStorage {
  readonly progress: ProgressStore;
  /** Undefined when IndexedDB refused to open: progress then lives in memory for this launch. */
  readonly db: IDBDatabase | undefined;
}

/** The promise's value, or undefined once `ms` have passed without one. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, ms, undefined);
  });
  return Promise.race([promise, deadline]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Opens on-device storage. A browser that refuses IndexedDB (a private window, storage blocked)
 * or never answers still gets a working game, with progress kept in memory and the reason logged.
 */
export async function openStorage(
  factory: IDBFactory | undefined,
  log: Logger,
  onVersionChange: DatabaseEvents['onVersionChange'],
  deadlineMs: number = OPEN_DEADLINE_MS,
): Promise<OpenedStorage> {
  const memory = (): OpenedStorage => ({ progress: new MemoryProgressStore(), db: undefined });
  if (!factory) {
    log.warn('storage.memory_only', { reason: 'no IndexedDB' });
    return memory();
  }
  try {
    const opening = openDatabase(factory, {
      onVersionChange,
      onBlocked: () => {
        log.warn('storage.open_blocked');
      },
      onNewerVersion: (onDisk) => {
        log.warn('storage.newer_version', { onDisk });
      },
    });
    const db = await within(opening, deadlineMs);
    if (db) return { progress: new IndexedDbProgressStore(db), db };
    const err = new Error(`IndexedDB did not open within ${deadlineMs} ms`);
    log.error('storage.open_timeout', err, { fallback: 'memory' });
    // This launch already plays from memory; a late connection would only hold the database.
    opening.then(
      (late) => {
        late.close();
      },
      (lateErr: unknown) => {
        log.warn('storage.open_late_failure', { error: String(lateErr) });
      },
    );
    return memory();
  } catch (err) {
    log.error('storage.open_failed', err, { fallback: 'memory' });
    return memory();
  }
}
