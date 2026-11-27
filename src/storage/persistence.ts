/**
 * Whether the browser may evict this site's storage under pressure (US-PARENT-04 shows it to the
 * parent). `persisted`: only the user can clear it. `best-effort`: the browser may, when the
 * device runs low on space. `unsupported`: the browser has no StorageManager.
 */
export type PersistState = 'persisted' | 'best-effort' | 'unsupported';

type Storage = Pick<StorageManager, 'persist' | 'persisted'>;

const supported = (storage: Partial<Storage> | undefined): storage is Storage =>
  typeof storage?.persist === 'function' && typeof storage.persisted === 'function';

export async function persistState(storage: Partial<Storage> | undefined): Promise<PersistState> {
  if (!supported(storage)) return 'unsupported';
  return (await storage.persisted()) ? 'persisted' : 'best-effort';
}

/** Asks once per launch; Chrome grants an installed PWA without a prompt. */
export async function requestPersistence(
  storage: Partial<Storage> | undefined,
): Promise<PersistState> {
  if (!supported(storage)) return 'unsupported';
  if (await storage.persisted()) return 'persisted';
  return (await storage.persist()) ? 'persisted' : 'best-effort';
}
