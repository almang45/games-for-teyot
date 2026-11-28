/**
 * The one IndexedDB database on the device (ARCHITECTURE.md §2, §11). Progress stays per device
 * (PRD decision 8): JSON export and import is how it moves.
 */
export const DB_NAME = 'rumah-cici-theia';
export const DB_VERSION = 1;

export const STORES = {
  /** ItemProgress by id. */
  items: 'items',
  /** StrokeAttempt, auto-numbered so key order is arrival order; indexed by item. */
  attempts: 'attempts',
  /** Single values by name: settings, the session counter. */
  values: 'values',
  /** LogEntry ring buffer, auto-numbered. */
  log: 'log',
} as const;

export const ATTEMPTS_BY_ITEM = 'byItem';

/** Settles with a request's result, or rejects with its error. */
export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'));
    };
  });
}

/** Settles once a transaction commits; an error or abort rejects, so nothing half-written passes. */
export function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    };
  });
}

function upgrade(db: IDBDatabase, from: number): void {
  // One step per version; a later version adds `if (from < 2) { … }` below this one.
  if (from < 1) {
    db.createObjectStore(STORES.items, { keyPath: 'id' });
    db.createObjectStore(STORES.attempts, { autoIncrement: true }).createIndex(
      ATTEMPTS_BY_ITEM,
      'itemId',
    );
    db.createObjectStore(STORES.values);
    db.createObjectStore(STORES.log, { autoIncrement: true });
  }
}

export interface DatabaseEvents {
  /**
   * A newer app version in another tab needs the database. `close` must be called, after any
   * last write such as the log line saying why, so that tab's upgrade can go ahead.
   */
  onVersionChange(close: () => void): void;
  /** An older tab still holds the database, so the upgrade waits for it to close. */
  onBlocked?(): void;
  /** A newer build already upgraded the database, and this one, rolled back, opens it as it is. */
  onNewerVersion?(onDisk: number): void;
}

/** Closes at once: for a connection with nothing left to write. */
export const closeNow = (close: () => void): void => {
  close();
};

/**
 * Opens (and creates or upgrades) the database. Upgrades are additive only (ARCHITECTURE.md
 * §8.4), so after a rollback an older build opens a newer database as it is: the stores it knows
 * are there, and the fields it doesn't know are ignored when read.
 */
export function openDatabase(
  factory: IDBFactory,
  events: DatabaseEvents,
  name: string = DB_NAME,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const attempt = (version: number | undefined): void => {
      const req = version === undefined ? factory.open(name) : factory.open(name, version);
      req.onupgradeneeded = (event) => {
        upgrade(req.result, event.oldVersion);
      };
      req.onsuccess = () => {
        const db = req.result;
        if (db.version > DB_VERSION) events.onNewerVersion?.(db.version);
        db.onversionchange = () => {
          events.onVersionChange(() => {
            db.close();
          });
        };
        resolve(db);
      };
      req.onblocked = () => {
        events.onBlocked?.();
      };
      req.onerror = (event) => {
        if (version !== undefined && req.error?.name === 'VersionError') {
          // Stops the failed request's error from surfacing as an uncaught one.
          event.preventDefault();
          attempt(undefined);
          return;
        }
        reject(req.error ?? new Error(`IndexedDB ${name} did not open`));
      };
    };
    attempt(DB_VERSION);
  });
}
