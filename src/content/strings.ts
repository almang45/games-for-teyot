import type { InstallPlatform } from '../platform/launch';
import raw from '../../content/strings.id.json';

export interface Strings {
  readonly boot: { readonly start: string };
  readonly install: {
    readonly title: string;
    readonly lead: string;
    readonly steps: Readonly<Record<InstallPlatform, readonly string[]>>;
    readonly continueInBrowser: string;
    readonly browserWarning: string;
  };
}

/**
 * The file is bundled, so it cannot change at runtime: the compiler checks its shape here, and
 * tests/unit/strings.test.ts rejects empty or unknown keys. No schema library ships in the entry
 * chunk that SCR-INSTALL loads.
 */
export const strings: Strings = raw;
