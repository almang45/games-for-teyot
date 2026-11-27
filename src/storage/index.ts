import type { Logger } from '../log/logger';
import { openDatabase } from './db';
import { IndexedDbProgressStore, MemoryProgressStore, type ProgressStore } from './progress';

export { CorruptRecordError, IndexedDbProgressStore, MemoryProgressStore } from './progress';
export type { ProgressStore } from './progress';
export { persistState, requestPersistence, type PersistState } from './persistence';
export { exportFileName, parseImport, serializeExport } from './transfer';
export type { ImportProblem, ImportResult } from './transfer';
export * from './schema';

export interface OpenedStorage {
  readonly progress: ProgressStore;
  /** Undefined when IndexedDB refused to open: progress then lives in memory for this launch. */
  readonly db: IDBDatabase | undefined;
}

/**
 * Opens on-device storage. A browser that refuses IndexedDB (a private window, storage blocked)
 * still gets a working game, with progress kept in memory and the refusal logged.
 */
export async function openStorage(
  factory: IDBFactory | undefined,
  log: Logger,
  onVersionChange: () => void,
): Promise<OpenedStorage> {
  if (!factory) {
    log.warn('storage.memory_only', { reason: 'no IndexedDB' });
    return { progress: new MemoryProgressStore(), db: undefined };
  }
  try {
    const db = await openDatabase(factory, onVersionChange);
    return { progress: new IndexedDbProgressStore(db), db };
  } catch (err) {
    log.error('storage.open_failed', err, { fallback: 'memory' });
    return { progress: new MemoryProgressStore(), db: undefined };
  }
}
