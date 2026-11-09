import { describe, expect, it } from 'vitest';
import { AUTO_RELOAD_KEY, AUTO_RELOAD_WINDOW_MS, claimAutoReload } from '../../src/shell/recovery';

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const windowWith = (storage: MemoryStorage | Error): Pick<Window, 'sessionStorage'> =>
  ({
    get sessionStorage() {
      if (storage instanceof Error) throw storage;
      return storage;
    },
  }) as unknown as Pick<Window, 'sessionStorage'>;

const noStorageError = (err: unknown): never => {
  throw new Error(`unexpected storage error: ${String(err)}`);
};

describe('claimAutoReload (PRD §7.5)', () => {
  it('allows one automatic reload per window, then waits for a tap', () => {
    const storage = new MemoryStorage();
    const win = windowWith(storage);
    const t0 = 1_000_000;
    expect(claimAutoReload(win, t0, noStorageError)).toBe(true);
    expect(storage.getItem(AUTO_RELOAD_KEY)).toBe(String(t0));
    expect(claimAutoReload(win, t0 + AUTO_RELOAD_WINDOW_MS - 1, noStorageError)).toBe(false);
    expect(claimAutoReload(win, t0 + AUTO_RELOAD_WINDOW_MS, noStorageError)).toBe(true);
  });

  it('ignores a corrupt or future timestamp instead of blocking recovery for good', () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTO_RELOAD_KEY, 'garbage');
    expect(claimAutoReload(windowWith(storage), 5_000, noStorageError)).toBe(true);
    storage.setItem(AUTO_RELOAD_KEY, String(10_000_000));
    expect(claimAutoReload(windowWith(storage), 5_000, noStorageError)).toBe(true);
  });

  it('without storage, reports the error and never reloads on its own (no loop guard)', () => {
    const blocked = new Error('SecurityError');
    const errors: unknown[] = [];
    expect(claimAutoReload(windowWith(blocked), 1, (err) => errors.push(err))).toBe(false);
    expect(errors).toEqual([blocked]);
  });
});
