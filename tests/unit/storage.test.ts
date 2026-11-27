import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { applyOutcome, type ItemRecord } from '../../src/engine/scheduler/leitner';
import { createAppLog, Logger, type LogEntry, type LogSink } from '../../src/log';
import { readStoredLog, StoredLogSink } from '../../src/log/storedLog';
import {
  ATTEMPTS_PER_ITEM,
  CorruptRecordError,
  DEFAULT_SETTINGS,
  exportFileName,
  IndexedDbProgressStore,
  MemoryProgressStore,
  openStorage,
  parseImport,
  persistState,
  requestPersistence,
  serializeExport,
  settings as settingsSchema,
  type ProgressExport,
  type ProgressStore,
  type StrokeAttempt,
} from '../../src/storage';
import { committed, DB_NAME, openDatabase, request, STORES } from '../../src/storage/db';
import { MAX_IMPORT_BYTES } from '../../src/storage/transfer';

const NOW = new Date('2026-11-27T08:00:00.000Z');
/** For callbacks these tests don't watch. */
const ignore = vi.fn();

const record = (extra: Partial<ItemRecord> = {}): ItemRecord => ({
  box: 2,
  waitFromSession: 0,
  lastSeenSession: 0,
  attempts: 1,
  successes: 1,
  sessionMisses: 0,
  ...extra,
});

const attempt = (itemId: string, n: number, extra: Partial<StrokeAttempt> = {}): StrokeAttempt => ({
  itemId,
  strokeIndex: 0,
  points: [
    [0.5, 0, 0],
    [0.5, 1, n],
  ],
  verdict: 'pass',
  input: 'touch',
  corridor: 0.12,
  ts: new Date(NOW.getTime() + n * 1000).toISOString(),
  ...extra,
});

const open = (factory = new IDBFactory()): Promise<IDBDatabase> => openDatabase(factory, ignore);

const stores: [string, () => Promise<ProgressStore>][] = [
  ['IndexedDbProgressStore', async () => new IndexedDbProgressStore(await open())],
  ['MemoryProgressStore', () => Promise.resolve(new MemoryProgressStore())],
];

describe.each(stores)('%s (US-PARENT-04)', (_name, make) => {
  it('keeps Leitner records by item, as the scheduler writes them', async () => {
    const store = await make();
    expect(await store.records()).toEqual(new Map());
    const first = applyOutcome(undefined, 'success', await store.startSession()).record;
    if (!first) throw new Error('no record');
    await store.saveRecord('stroke.circle', first);
    await store.saveRecord('digit.4', record({ box: 3 }));
    const records = await store.records();
    expect(records.get('stroke.circle')).toEqual(first);
    expect(records.get('digit.4')?.box).toBe(3);
  });

  it('refuses a record that breaks the schema, leaving the stored one', async () => {
    const store = await make();
    await store.saveRecord('digit.4', record());
    await expect(store.saveRecord('digit.4', record({ successes: 5 }))).rejects.toThrow(
      CorruptRecordError,
    );
    await expect(store.saveRecord('Digit 4', record())).rejects.toThrow(/not an item id/);
    await expect(store.saveRecord('digit.4', record({ lastSeenSession: 3 }))).rejects.toThrow(
      /seen in session 3, but the last session started is 0/,
    );
    expect((await store.records()).get('digit.4')).toEqual(record());
  });

  it(`keeps the newest ${ATTEMPTS_PER_ITEM} attempts per item, newest first`, async () => {
    const store = await make();
    for (let n = 0; n < ATTEMPTS_PER_ITEM + 5; n++) await store.addAttempt(attempt('digit.4', n));
    await store.addAttempt(attempt('digit.5', 99));
    const kept = await store.attempts('digit.4');
    expect(kept).toHaveLength(ATTEMPTS_PER_ITEM);
    expect(kept[0]?.points[1]?.[2]).toBe(ATTEMPTS_PER_ITEM + 4);
    expect(kept.at(-1)?.points[1]?.[2]).toBe(5);
    expect((await store.attempts('digit.4', 3)).map((a) => a.points[1]?.[2])).toEqual([24, 23, 22]);
    expect(await store.attempts('digit.5')).toHaveLength(1);
    await expect(store.addAttempt(attempt('digit.4', 1, { corridor: 0 }))).rejects.toThrow();
  });

  it('reads default settings until a parent changes them, and refuses bad ones', async () => {
    const store = await make();
    expect(await store.settings()).toEqual(DEFAULT_SETTINGS);
    const mine = { ...DEFAULT_SETTINGS, sessionMinutes: 15, bedtimeCooldown: false };
    await store.saveSettings(mine);
    expect(await store.settings()).toEqual(mine);
    await expect(store.saveSettings({ ...mine, sessionMinutes: 45 })).rejects.toThrow(
      /sessionMinutes/,
    );
    expect(await store.settings()).toEqual(mine);
  });

  it('counts sessions from 1', async () => {
    const store = await make();
    expect(await store.session()).toBe(0);
    expect(await store.startSession()).toBe(1);
    expect(await store.startSession()).toBe(2);
    expect(await store.session()).toBe(2);
  });

  it('exports everything, and an import replaces it all', async () => {
    const store = await make();
    await store.startSession();
    await store.saveRecord('digit.4', record());
    await store.addAttempt(attempt('digit.4', 1));
    await store.saveSettings({ ...DEFAULT_SETTINGS, narrator: 'alternate' });
    const exported = await store.exportAll(NOW);
    expect(exported).toMatchObject({
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      session: 1,
      settings: { narrator: 'alternate' },
      items: [{ id: 'digit.4', box: 2 }],
    });
    expect(exported.attempts).toHaveLength(1);
    const read = parseImport(serializeExport(exported));
    if (!read.ok) throw new Error(read.problem.detail);

    const other = await make();
    await other.saveRecord('stroke.wave', record());
    await other.replaceAll(read.data);
    expect(await other.exportAll(NOW)).toEqual(exported);
    expect((await other.records()).has('stroke.wave')).toBe(false);
  });

  it('resets progress after confirmation, but keeps the parent’s settings', async () => {
    const store = await make();
    await store.startSession();
    await store.saveRecord('digit.4', record());
    await store.addAttempt(attempt('digit.4', 1));
    const mine = { ...DEFAULT_SETTINGS, childName: 'Cici' };
    await store.saveSettings(mine);
    await store.resetProgress();
    expect(await store.records()).toEqual(new Map());
    expect(await store.attempts('digit.4')).toEqual([]);
    expect(await store.session()).toBe(0);
    expect(await store.settings()).toEqual(mine);
  });
});

describe('db helpers', () => {
  it('rejects a failed request, an aborted transaction and a refused open', async () => {
    const factory = new IDBFactory();
    const db = await open(factory);
    const tx = db.transaction(STORES.items, 'readwrite');
    const done = committed(tx);
    const items = tx.objectStore(STORES.items);
    items.add({ id: 'digit.4' });
    await expect(request(items.add({ id: 'digit.4' }))).rejects.toThrow(/ConstraintError|exists/i);
    await expect(done).rejects.toThrow();
    db.close();
    await expect(openDatabase(factory, ignore, DB_NAME)).resolves.toBeDefined();
    const newer = await new Promise<IDBDatabase>((resolve) => {
      const req = factory.open('later', 3);
      req.onsuccess = () => {
        resolve(req.result);
      };
    });
    newer.close();
    await expect(openDatabase(factory, ignore, 'later')).rejects.toThrow();
  });
});

describe('IndexedDbProgressStore', () => {
  it('keeps progress across launches', async () => {
    const factory = new IDBFactory();
    const first = await open(factory);
    await new IndexedDbProgressStore(first).saveRecord('digit.4', record());
    first.close();
    const again = new IndexedDbProgressStore(await open(factory));
    expect((await again.records()).get('digit.4')).toEqual(record());
  });

  it('reports a corrupt stored record instead of guessing', async () => {
    const db = await open();
    const tx = db.transaction([STORES.items, STORES.values], 'readwrite');
    tx.objectStore(STORES.items).put({ id: 'digit.4', box: 9 });
    tx.objectStore(STORES.values).put('three', 'session');
    tx.objectStore(STORES.values).put({ sessionMinutes: 99 }, 'settings');
    await new Promise((resolve) => (tx.oncomplete = resolve));
    const store = new IndexedDbProgressStore(db);
    await expect(store.records()).rejects.toThrow(/items\/0 is not valid: box/);
    await expect(store.session()).rejects.toThrow(/not a session number: "three"/);
    await expect(store.settings()).rejects.toThrow(/values\/settings is not valid/);
  });

  it('refuses an import without writing any of it', async () => {
    const store = new IndexedDbProgressStore(await open());
    await store.saveRecord('digit.4', record());
    const bad = {
      ...(await store.exportAll(NOW)),
      items: [{ id: 'digit.5', ...record({ waitFromSession: 7, lastSeenSession: 7 }) }],
    } as ProgressExport;
    await expect(store.replaceAll(bad)).rejects.toThrow(CorruptRecordError);
    expect([...(await store.records()).keys()]).toEqual(['digit.4']);
  });

  it('trims imported attempts to the newest per item', async () => {
    const store = new IndexedDbProgressStore(await open());
    const data = await store.exportAll(NOW);
    const many = Array.from({ length: ATTEMPTS_PER_ITEM + 3 }, (_, n) => attempt('digit.4', n));
    await store.replaceAll({ ...data, attempts: many });
    expect(await store.attempts('digit.4', 1)).toEqual([many.at(-1)]);
    expect(await store.attempts('digit.4')).toHaveLength(ATTEMPTS_PER_ITEM);
  });

  it('closes when a newer app version upgrades the database', async () => {
    const factory = new IDBFactory();
    const onVersionChange = vi.fn();
    const db = await openDatabase(factory, onVersionChange);
    await new Promise<void>((resolve, reject) => {
      const req = factory.open(DB_NAME, 2);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => {
        reject(req.error ?? new Error('open failed'));
      };
    });
    expect(onVersionChange).toHaveBeenCalledOnce();
    expect(() => db.transaction(STORES.items)).toThrow();
  });
});

describe('parseImport (US-PARENT-04)', () => {
  const valid = async (): Promise<ProgressExport> => {
    const store = new MemoryProgressStore();
    await store.startSession();
    await store.saveRecord('digit.4', record());
    return store.exportAll(NOW);
  };

  it('names the file after the export day', async () => {
    expect(exportFileName(await valid())).toBe('rumah-cici-theia-2026-11-27.json');
  });

  it('refuses what is not JSON, not an export, or from a newer app', () => {
    expect(parseImport('{ nope')).toMatchObject({ ok: false, problem: { kind: 'not-json' } });
    expect(parseImport('[1, 2]')).toMatchObject({ ok: false, problem: { kind: 'not-progress' } });
    expect(parseImport('{"name": "photo"}')).toMatchObject({
      ok: false,
      problem: { kind: 'not-progress' },
    });
    expect(parseImport('{"schemaVersion": 4}')).toMatchObject({
      ok: false,
      problem: { kind: 'newer-version', version: 4 },
    });
    expect(parseImport(' '.repeat(MAX_IMPORT_BYTES + 1))).toMatchObject({
      ok: false,
      problem: { kind: 'not-progress', detail: expect.stringMatching(/too large/) as string },
    });
  });

  it('lists what is wrong with an export that does not check out', async () => {
    const data = await valid();
    const twice = { ...data, items: [...data.items, ...data.items] };
    const result = parseImport(JSON.stringify(twice));
    expect(result).toMatchObject({ ok: false, problem: { kind: 'invalid' } });
    if (result.ok || result.problem.kind !== 'invalid') throw new Error('expected invalid');
    expect(result.problem.issues).toEqual(['items.1.id: digit.4 twice']);
    const later = { ...data, items: [{ ...data.items[0], lastSeenSession: 5 }] };
    expect(parseImport(JSON.stringify(later))).toMatchObject({
      ok: false,
      problem: { detail: expect.stringMatching(/after the last session 1/) as string },
    });
    expect(parseImport(JSON.stringify({ ...data, extra: true }))).toMatchObject({
      ok: false,
      problem: { kind: 'invalid' },
    });
  });

  it('fills settings a parent never changed with their defaults', async () => {
    const data = await valid();
    const result = parseImport(JSON.stringify({ ...data, settings: { childName: 'Cici' } }));
    if (!result.ok) throw new Error(result.problem.detail);
    expect(result.data.settings).toEqual({ ...DEFAULT_SETTINGS, childName: 'Cici' });
    expect(settingsSchema.parse({})).toEqual(DEFAULT_SETTINGS);
  });
});

describe('persistent storage (US-PARENT-04)', () => {
  it('reports whether the browser may evict the progress', async () => {
    expect(await persistState(undefined)).toBe('unsupported');
    expect(await persistState({ persisted: () => Promise.resolve(true) })).toBe('unsupported');
    const granted = {
      persist: () => Promise.resolve(true),
      persisted: () => Promise.resolve(true),
    };
    expect(await persistState(granted)).toBe('persisted');
    const refused = {
      persist: vi.fn(() => Promise.resolve(false)),
      persisted: () => Promise.resolve(false),
    };
    expect(await persistState(refused)).toBe('best-effort');
    expect(await requestPersistence(refused)).toBe('best-effort');
    expect(refused.persist).toHaveBeenCalledOnce();
    expect(await requestPersistence(granted)).toBe('persisted');
    expect(await requestPersistence(undefined)).toBe('unsupported');
  });
});

describe('openStorage', () => {
  const logged = () => {
    const entries: LogEntry[] = [];
    const sink: LogSink = { write: (e) => entries.push(e) };
    return { entries, logger: new Logger([sink], 's') };
  };

  it('opens IndexedDB when it can', async () => {
    const { logger } = logged();
    const opened = await openStorage(new IDBFactory(), logger, ignore);
    expect(opened.progress).toBeInstanceOf(IndexedDbProgressStore);
    expect(opened.db).toBeDefined();
  });

  it('keeps progress in memory when IndexedDB is missing or refuses', async () => {
    const missing = logged();
    const none = await openStorage(undefined, missing.logger, ignore);
    expect(none.progress).toBeInstanceOf(MemoryProgressStore);
    expect(missing.entries.map((e) => e.event)).toEqual(['storage.memory_only']);

    const refusing = logged();
    const factory = {
      open: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as IDBFactory;
    const refused = await openStorage(factory, refusing.logger, ignore);
    expect(refused).toMatchObject({ db: undefined });
    expect(refused.progress).toBeInstanceOf(MemoryProgressStore);
    expect(refusing.entries[0]).toMatchObject({
      level: 'error',
      event: 'storage.open_failed',
      data: { fallback: 'memory', error: { name: 'SecurityError' } },
    });
  });
});

describe('stored log (ARCHITECTURE.md §11)', () => {
  const entry = (n: number): LogEntry => ({
    ts: NOW.toISOString(),
    level: 'info',
    event: `e${n}`,
    scene: null,
    sessionId: 's',
    data: {},
  });

  it('batches entries into IndexedDB and keeps only the newest', async () => {
    const db = await open();
    const sink = new StoredLogSink(db, ignore, 5);
    for (let n = 0; n < 8; n++) sink.write(entry(n));
    await sink.flush();
    sink.write(entry(8));
    await sink.flush();
    expect(((await readStoredLog(db)) as LogEntry[]).map((e) => e.event)).toEqual([
      'e4',
      'e5',
      'e6',
      'e7',
      'e8',
    ]);
    expect(() => new StoredLogSink(db, ignore, 0)).toThrow(RangeError);
  });

  it('reports a write that fails, and keeps going afterwards', async () => {
    const db = await open();
    const onError = vi.fn();
    const sink = new StoredLogSink(db, onError);
    db.close();
    sink.write(entry(1));
    await sink.flush();
    expect(onError).toHaveBeenCalledOnce();
    sink.write(entry(2));
    await sink.flush();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('stores this launch’s earlier entries once the database is open', async () => {
    const db = await open();
    const app = createAppLog('s', false);
    app.logger.info('app.launch');
    const sink = new StoredLogSink(db, ignore);
    app.persistTo(sink);
    app.logger.info('storage.persist');
    await sink.flush();
    expect(((await readStoredLog(db)) as LogEntry[]).map((e) => e.event)).toEqual([
      'app.launch',
      'storage.persist',
    ]);
    expect(() => {
      app.persistTo(sink);
    }).toThrow(/already stored/);
  });
});
