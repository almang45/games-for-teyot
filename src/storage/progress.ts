import type { z } from 'zod';
import type { ItemRecord } from '../engine/scheduler/leitner';
import { ATTEMPTS_BY_ITEM, committed, request, STORES } from './db';
import {
  ATTEMPTS_PER_ITEM,
  compactAttempt,
  DEFAULT_SETTINGS,
  itemProgress,
  progressExport,
  SCHEMA_VERSION,
  settings as settingsSchema,
  strokeAttempt,
  type ItemProgress,
  type ProgressExport,
  type Settings,
  type StrokeAttempt,
} from './schema';

/** A stored record that no longer matches its schema: the caller decides whether to reset. */
export class CorruptRecordError extends Error {
  constructor(
    readonly store: string,
    readonly key: string,
    readonly issues: readonly string[],
  ) {
    super(`${store}/${key} is not valid: ${issues.join('; ')}`);
    this.name = 'CorruptRecordError';
  }
}

function checked<T>(schema: z.ZodType<T>, value: unknown, store: string, key: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new CorruptRecordError(
    store,
    key,
    parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  );
}

/** Progress on this device: Leitner records, stroke attempts, settings and the session counter. */
export interface ProgressStore {
  /** Every item's record, by id; an item with no record has never been scored. */
  records(): Promise<Map<string, ItemRecord>>;
  saveRecord(id: string, record: ItemRecord): Promise<void>;
  /** Keeps the newest ATTEMPTS_PER_ITEM per item. */
  addAttempt(attempt: StrokeAttempt): Promise<void>;
  /** Newest first, at most `limit`. */
  attempts(itemId: string, limit?: number): Promise<StrokeAttempt[]>;
  settings(): Promise<Settings>;
  saveSettings(next: Settings): Promise<void>;
  /** The last session started; 0 before the first. */
  session(): Promise<number>;
  /** Starts the next session and returns its number. */
  startSession(): Promise<number>;
  /** Everything, for the parent's export (US-PARENT-04). */
  exportAll(now: Date): Promise<ProgressExport>;
  /** Replaces everything with an import, all or nothing. */
  replaceAll(data: ProgressExport): Promise<void>;
  /** Forgets progress, attempts and sessions. Settings stay: they are the parent's, not hers. */
  resetProgress(): Promise<void>;
}

const SETTINGS_KEY = 'settings';
const SESSION_KEY = 'session';

const toProgress = (id: string, record: ItemRecord): ItemProgress =>
  checked(itemProgress, { id, ...record }, STORES.items, id);

const toRecord = (p: ItemProgress): ItemRecord => ({
  box: p.box,
  waitFromSession: p.waitFromSession,
  lastSeenSession: p.lastSeenSession,
  attempts: p.attempts,
  successes: p.successes,
  sessionMisses: p.sessionMisses,
});

/** A record from a session that hasn't started would make every later export invalid. */
function notAhead(item: ItemProgress, session: number): void {
  if (item.lastSeenSession > session) {
    throw new CorruptRecordError(STORES.items, item.id, [
      `seen in session ${item.lastSeenSession}, but the last session started is ${session}`,
    ]);
  }
}

const exportOf = (
  now: Date,
  session: number,
  settings: Settings,
  items: readonly ItemProgress[],
  attempts: readonly StrokeAttempt[],
): ProgressExport =>
  checked(
    progressExport,
    {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      session,
      settings,
      items,
      attempts,
    },
    'export',
    now.toISOString(),
  );

/** Attempts newest last, trimmed to the newest ATTEMPTS_PER_ITEM of each item. */
function trimAttempts(attempts: readonly StrokeAttempt[]): StrokeAttempt[] {
  const kept = new Map<string, number>();
  const out: StrokeAttempt[] = [];
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (!a) continue;
    const n = kept.get(a.itemId) ?? 0;
    if (n >= ATTEMPTS_PER_ITEM) continue;
    kept.set(a.itemId, n + 1);
    out.push(a);
  }
  return out.reverse();
}

export class IndexedDbProgressStore implements ProgressStore {
  constructor(private readonly db: IDBDatabase) {}

  async records(): Promise<Map<string, ItemRecord>> {
    const tx = this.db.transaction(STORES.items, 'readonly');
    const rows = await request<unknown[]>(tx.objectStore(STORES.items).getAll());
    return new Map(
      rows.map((row, i) => {
        const item = checked(itemProgress, row, STORES.items, String(i));
        return [item.id, toRecord(item)];
      }),
    );
  }

  async saveRecord(id: string, record: ItemRecord): Promise<void> {
    const item = toProgress(id, record);
    const tx = this.db.transaction([STORES.items, STORES.values], 'readwrite');
    const session = this.sessionIn(
      await request<unknown>(tx.objectStore(STORES.values).get(SESSION_KEY)),
    );
    notAhead(item, session);
    tx.objectStore(STORES.items).put(item);
    await committed(tx);
  }

  async addAttempt(attempt: StrokeAttempt): Promise<void> {
    const valid = checked(strokeAttempt, compactAttempt(attempt), STORES.attempts, attempt.itemId);
    const tx = this.db.transaction(STORES.attempts, 'readwrite');
    const store = tx.objectStore(STORES.attempts);
    store.add(valid);
    // Index keys come in primary-key order, which for auto-numbered keys is arrival order.
    const keys = await request(store.index(ATTEMPTS_BY_ITEM).getAllKeys(valid.itemId));
    for (const key of keys.slice(0, Math.max(0, keys.length - ATTEMPTS_PER_ITEM))) {
      store.delete(key);
    }
    await committed(tx);
  }

  async attempts(itemId: string, limit = ATTEMPTS_PER_ITEM): Promise<StrokeAttempt[]> {
    const tx = this.db.transaction(STORES.attempts, 'readonly');
    const rows = await request<unknown[]>(
      tx.objectStore(STORES.attempts).index(ATTEMPTS_BY_ITEM).getAll(itemId),
    );
    return rows
      .map((row, i) => checked(strokeAttempt, row, STORES.attempts, `${itemId}#${i}`))
      .reverse()
      .slice(0, Math.max(0, limit));
  }

  async settings(): Promise<Settings> {
    const stored = await this.value(SETTINGS_KEY);
    return stored === undefined
      ? DEFAULT_SETTINGS
      : checked(settingsSchema, stored, STORES.values, SETTINGS_KEY);
  }

  async saveSettings(next: Settings): Promise<void> {
    const valid = checked(settingsSchema, next, STORES.values, SETTINGS_KEY);
    const tx = this.db.transaction(STORES.values, 'readwrite');
    tx.objectStore(STORES.values).put(valid, SETTINGS_KEY);
    await committed(tx);
  }

  async session(): Promise<number> {
    return this.sessionIn(await this.value(SESSION_KEY));
  }

  async startSession(): Promise<number> {
    const tx = this.db.transaction(STORES.values, 'readwrite');
    const store = tx.objectStore(STORES.values);
    // Read and write in one transaction, so two tabs starting at once still count twice.
    const next = this.sessionIn(await request<unknown>(store.get(SESSION_KEY))) + 1;
    store.put(next, SESSION_KEY);
    await committed(tx);
    return next;
  }

  async exportAll(now: Date): Promise<ProgressExport> {
    const tx = this.db.transaction([STORES.items, STORES.attempts, STORES.values], 'readonly');
    const [items, attempts, session, stored] = await Promise.all([
      request<unknown[]>(tx.objectStore(STORES.items).getAll()),
      request<unknown[]>(tx.objectStore(STORES.attempts).getAll()),
      request<unknown>(tx.objectStore(STORES.values).get(SESSION_KEY)),
      request<unknown>(tx.objectStore(STORES.values).get(SETTINGS_KEY)),
    ]);
    const current =
      stored === undefined
        ? DEFAULT_SETTINGS
        : checked(settingsSchema, stored, STORES.values, SETTINGS_KEY);
    return exportOf(
      now,
      this.sessionIn(session),
      current,
      items.map((row, i) => checked(itemProgress, row, STORES.items, String(i))),
      attempts.map((row, i) => checked(strokeAttempt, row, STORES.attempts, String(i))),
    );
  }

  async replaceAll(data: ProgressExport): Promise<void> {
    const valid = checked(progressExport, data, 'import', data.exportedAt);
    const tx = this.db.transaction([STORES.items, STORES.attempts, STORES.values], 'readwrite');
    const items = tx.objectStore(STORES.items);
    const attempts = tx.objectStore(STORES.attempts);
    const values = tx.objectStore(STORES.values);
    items.clear();
    attempts.clear();
    values.clear();
    for (const item of valid.items) items.put(item);
    for (const attempt of trimAttempts(valid.attempts)) attempts.add(attempt);
    values.put(valid.settings, SETTINGS_KEY);
    values.put(valid.session, SESSION_KEY);
    await committed(tx);
  }

  async resetProgress(): Promise<void> {
    const tx = this.db.transaction([STORES.items, STORES.attempts, STORES.values], 'readwrite');
    tx.objectStore(STORES.items).clear();
    tx.objectStore(STORES.attempts).clear();
    tx.objectStore(STORES.values).delete(SESSION_KEY);
    await committed(tx);
  }

  private async value(key: string): Promise<unknown> {
    const tx = this.db.transaction(STORES.values, 'readonly');
    return request<unknown>(tx.objectStore(STORES.values).get(key));
  }

  private sessionIn(value: unknown): number {
    if (value === undefined) return 0;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    throw new CorruptRecordError(STORES.values, SESSION_KEY, [
      `not a session number: ${JSON.stringify(value)}`,
    ]);
  }
}

/**
 * Progress kept in memory only, for a browser that refuses IndexedDB (a private window): she can
 * still play, and nothing is saved. Same checks as the stored version.
 */
export class MemoryProgressStore implements ProgressStore {
  private items = new Map<string, ItemProgress>();
  private log: StrokeAttempt[] = [];
  private current: Settings = DEFAULT_SETTINGS;
  private last = 0;

  records(): Promise<Map<string, ItemRecord>> {
    return Promise.resolve(new Map([...this.items].map(([id, item]) => [id, toRecord(item)])));
  }

  saveRecord(id: string, record: ItemRecord): Promise<void> {
    return this.run(() => {
      const item = toProgress(id, record);
      notAhead(item, this.last);
      this.items.set(id, item);
    });
  }

  addAttempt(attempt: StrokeAttempt): Promise<void> {
    return this.run(() => {
      const valid = checked(
        strokeAttempt,
        compactAttempt(attempt),
        STORES.attempts,
        attempt.itemId,
      );
      this.log = trimAttempts([...this.log, valid]);
    });
  }

  attempts(itemId: string, limit = ATTEMPTS_PER_ITEM): Promise<StrokeAttempt[]> {
    const mine = this.log.filter((a) => a.itemId === itemId).reverse();
    return Promise.resolve(mine.slice(0, Math.max(0, limit)));
  }

  settings(): Promise<Settings> {
    return Promise.resolve(this.current);
  }

  saveSettings(next: Settings): Promise<void> {
    return this.run(() => {
      this.current = checked(settingsSchema, next, STORES.values, SETTINGS_KEY);
    });
  }

  session(): Promise<number> {
    return Promise.resolve(this.last);
  }

  startSession(): Promise<number> {
    this.last += 1;
    return Promise.resolve(this.last);
  }

  exportAll(now: Date): Promise<ProgressExport> {
    return this.run(() =>
      exportOf(now, this.last, this.current, [...this.items.values()], this.log),
    );
  }

  replaceAll(data: ProgressExport): Promise<void> {
    return this.run(() => {
      const valid = checked(progressExport, data, 'import', data.exportedAt);
      this.items = new Map(valid.items.map((item) => [item.id, item]));
      this.log = trimAttempts(valid.attempts);
      this.current = valid.settings;
      this.last = valid.session;
    });
  }

  resetProgress(): Promise<void> {
    this.items = new Map();
    this.log = [];
    this.last = 0;
    return Promise.resolve();
  }

  /** Runs `work`, turning a throw into a rejection like the stored version. */
  private run<T>(work: () => T): Promise<T> {
    try {
      return Promise.resolve(work());
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
