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

/**
 * Opens (and creates or upgrades) the database. `onVersionChange` runs when a newer app version
 * in another tab needs the database: this connection closes so that one can upgrade.
 */
export function openDatabase(
  factory: IDBFactory,
  onVersionChange: () => void,
  name: string = DB_NAME,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, DB_VERSION);
    req.onupgradeneeded = (event) => {
      upgrade(req.result, event.oldVersion);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        onVersionChange();
      };
      resolve(db);
    };
    // No onblocked: an older tab holding the database gets onversionchange above and closes it,
    // and the upgrade then goes ahead.
    req.onerror = () => {
      reject(req.error ?? new Error(`IndexedDB ${name} did not open`));
    };
  });
}
