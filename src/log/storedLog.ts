import { committed, request, STORES } from '../storage/db';
import type { LogEntry, LogSink } from './logger';

/** ARCHITECTURE.md §11: the newest entries the device keeps. */
export const STORED_LOG_CAPACITY = 2000;

/**
 * Writes log entries to IndexedDB, so the parent can export what led up to a crash even after the
 * recovery reload (ARCHITECTURE.md §11). Entries are batched into one transaction per tick, and
 * the oldest beyond the capacity are dropped in that same transaction.
 */
export class StoredLogSink implements LogSink {
  private queue: LogEntry[] = [];
  private flushing: Promise<void> | undefined;

  /**
   * @param onError  where a failed write is reported. It must not log through this sink, or a
   *                 broken database would feed itself.
   */
  constructor(
    private readonly db: IDBDatabase,
    private readonly onError: (err: unknown) => void,
    private readonly capacity: number = STORED_LOG_CAPACITY,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`StoredLogSink capacity must be a positive integer, got ${capacity}`);
    }
  }

  write(entry: LogEntry): void {
    this.queue.push(entry);
    this.flushing ??= Promise.resolve().then(() => this.drain());
  }

  /** Settles once every entry written so far is stored. */
  async flush(): Promise<void> {
    while (this.flushing) await this.flushing;
  }

  private async drain(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const batch = this.queue;
        this.queue = [];
        await this.store(batch);
      }
    } catch (err) {
      this.queue = [];
      this.onError(err);
    } finally {
      this.flushing = undefined;
    }
  }

  private async store(batch: readonly LogEntry[]): Promise<void> {
    const tx = this.db.transaction(STORES.log, 'readwrite');
    const log = tx.objectStore(STORES.log);
    for (const entry of batch) log.add(entry);
    const total = await request(log.count());
    if (total > this.capacity) {
      const oldest = await request(log.getAllKeys(null, total - this.capacity));
      for (const key of oldest) log.delete(key);
    }
    await committed(tx);
  }
}

/** The stored log, oldest first, for the parent's export. */
export async function readStoredLog(db: IDBDatabase): Promise<unknown[]> {
  const tx = db.transaction(STORES.log, 'readonly');
  return request<unknown[]>(tx.objectStore(STORES.log).getAll());
}
