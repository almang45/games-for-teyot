import { z } from 'zod';

/** Screen inventory, PRD §6. Tests, layouts, logs and reviews refer to screens by these ids. */
export const SCREEN_IDS = [
  'SCR-INSTALL',
  'SCR-BOOT',
  'SCR-HOUSE',
  'SCR-TRACE',
  'SCR-COUNT',
  'SCR-COLOR-PICK',
  'SCR-COLOR',
  'SCR-TIDY',
  'SCR-BEDTIME',
  'HUD-HOME',
  'HUD-SPEAKER',
  'OVL-CELEBRATE',
  'OVL-RECOVER',
  'OVL-PARENT-GATE',
  'SCR-PARENT-HOME',
  'SCR-PARENT-SETTINGS',
  'SCR-PARENT-DATA',
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

/**
 * Screens the game draws on the canvas from `design/layouts/<screen-id>.json`. The install page,
 * the HUD parts (placed by each screen's layout), and the parent area (DOM, built from `ui/`) have
 * no layout file.
 */
export const LAYOUT_SCREENS = [
  'SCR-BOOT',
  'SCR-HOUSE',
  'SCR-TRACE',
  'SCR-COUNT',
  'SCR-COLOR-PICK',
  'SCR-COLOR',
  'SCR-TIDY',
  'SCR-BEDTIME',
  'OVL-CELEBRATE',
  'OVL-RECOVER',
] as const satisfies readonly ScreenId[];

export const layoutScreen = z.enum(LAYOUT_SCREENS);
export type LayoutScreen = z.infer<typeof layoutScreen>;

/** Activity screens share fixed HUD positions (design brief §1). */
export const ACTIVITY_SCREENS = [
  'SCR-TRACE',
  'SCR-COUNT',
  'SCR-COLOR-PICK',
  'SCR-COLOR',
  'SCR-TIDY',
] as const satisfies readonly LayoutScreen[];

/** `SCR-COLOR-PICK` → `scr-color-pick.json`: file names stay kebab-case (ASSETS.md §7). */
export const layoutFileName = (screen: LayoutScreen): string => `${screen.toLowerCase()}.json`;
