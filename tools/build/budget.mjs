// The size budgets of docs/ARCHITECTURE.md §10 and PRD NFR-PERF-02, shared by the build check and
// the service worker config so "what is a room bundle" has one definition.

const MB = 1024 * 1024;

export const BUDGETS = {
  firstLoadBytes: 3 * MB,
  roomBundleBytes: 4 * MB,
  totalBytes: 60 * MB,
};

/** Room bundles load on first entry and are cached at runtime, never precached (§8.1). */
export const ROOM_PREFIXES = ['rooms/', 'audio/rooms/'];

/**
 * The same prefixes as a URL pattern for the Workbox runtime route. A literal, not a closure:
 * Workbox serializes it into the service worker. tests/unit/budget.test.ts keeps both in step.
 */
export const ROOM_URL_PATTERN = /^https?:\/\/[^/]+\/(?:audio\/)?rooms\//;

/** @param {number} bytes */
export const toMB = (bytes) => +(bytes / MB).toFixed(2);

/**
 * The room a dist file belongs to: `rooms/<id>/…`, `audio/rooms/<id>.webm` or `audio/rooms/<id>/…`.
 * @param {string} path dist-relative, '/'-separated
 * @returns {string | undefined}
 */
export function roomOf(path) {
  const prefix = ROOM_PREFIXES.find((p) => path.startsWith(p));
  if (prefix === undefined) return undefined;
  const id = (path.slice(prefix.length).split('/')[0] ?? '').replace(/\.[^.]+$/, '');
  return id === '' ? undefined : id;
}

/**
 * @param {{ path: string, bytes: number }[]} files
 * @returns {{ firstLoadBytes: number, totalBytes: number, rooms: Record<string, number>, failures: string[] }}
 */
export function evaluateBudget(files) {
  /** @type {Record<string, number>} */
  const rooms = {};
  let firstLoadBytes = 0;
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.bytes;
    const room = roomOf(file.path);
    if (room === undefined) firstLoadBytes += file.bytes;
    else rooms[room] = (rooms[room] ?? 0) + file.bytes;
  }
  const failures = [];
  if (firstLoadBytes > BUDGETS.firstLoadBytes)
    failures.push(`first load ${toMB(firstLoadBytes)} MB > 3 MB`);
  for (const [room, bytes] of Object.entries(rooms)) {
    if (bytes > BUDGETS.roomBundleBytes) failures.push(`room ${room} ${toMB(bytes)} MB > 4 MB`);
  }
  if (totalBytes > BUDGETS.totalBytes) failures.push(`total ${toMB(totalBytes)} MB > 60 MB`);
  return { firstLoadBytes, totalBytes, rooms, failures };
}
