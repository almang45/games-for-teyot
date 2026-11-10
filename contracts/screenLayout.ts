import { z } from 'zod';
import {
  assetKey,
  duplicates,
  error,
  kebabId,
  rect,
  rectContains,
  schemaRef,
  version,
  type Issue,
  type Rect,
} from './common.ts';
import { ACTIVITY_SCREENS, layoutScreen, type LayoutScreen } from './screens.ts';

/** Every device shows the whole 1920 × 1200 design frame (design brief, "Devices"). */
export const FRAME = { width: 1920, height: 1200 } as const;

/** Interactive content stays inside the centred 1760 × 1080 area (design brief §1). */
export const SAFE_AREA: Rect = [80, 60, 1760, 1080];

export const DEVICE_CLASSES = ['tablet', 'phone'] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/**
 * Frame px per dp differ by device because the frame is scaled to the screen height. Reference
 * devices: Galaxy Tab S10+ (1752 px tall, density 2.0) and Pixel 6 / Galaxy A52s (1080 px tall,
 * density 2.625). Laptops use the tablet layout. Re-measure `devicePixelRatio` on the real
 * devices if a new one joins.
 */
export const REFERENCE_DEVICES = {
  tablet: { heightPx: 1752, density: 2 },
  phone: { heightPx: 1080, density: 2.625 },
} as const satisfies Record<DeviceClass, { heightPx: number; density: number }>;

/** Touch targets: ≥ 72 dp, ≥ 96 dp for primary actions (design brief §1). */
export const TOUCH_DP = { secondary: 72, primary: 96 } as const;

export type Interactive = keyof typeof TOUCH_DP;

/** The smallest hit area side, in frame px, for a touch target on a device class. */
export function minHitFramePx(device: DeviceClass, kind: Interactive): number {
  const { heightPx, density } = REFERENCE_DEVICES[device];
  return Math.ceil((TOUCH_DP[kind] * density) / (heightPx / FRAME.height));
}

const unit = z.number().min(0).max(1);

export const layoutElement = z.strictObject({
  /** Stable id the scene looks the element up by, e.g. `trace-area`, `hud-home`. */
  key: kebabId,
  /** Visual bounds in frame px. */
  bounds: rect,
  /** Pivot inside the bounds for scale and rotate tweens, [0, 0] top left. Default centre. */
  anchor: z.tuple([unit, unit]).optional(),
  /** Draw order: higher is in front. */
  depth: z.number().int().min(0).max(1000),
  /** Manifest key drawn in the bounds, when the element is art. */
  asset: assetKey.optional(),
  /** Set for anything she can tap. Primary actions get the larger minimum. */
  interactive: z.enum(['primary', 'secondary']).optional(),
  /** Tap area in frame px when it differs from the bounds, e.g. padding around a small icon. */
  hit: rect.optional(),
});
export type LayoutElement = z.infer<typeof layoutElement>;

export const screenLayout = z.strictObject({
  $schema: schemaRef,
  version,
  screen: layoutScreen,
  devices: z.strictObject({
    tablet: z.array(layoutElement).min(1),
    phone: z.array(layoutElement).min(1),
  }),
});
export type ScreenLayout = z.infer<typeof screenLayout>;

/**
 * Fixed HUD slots on every activity screen (brief §1), with the quadrant each sits in and the
 * touch target it needs. Home is her way out, so it gets the primary size. Tapping the speaker
 * replays the clip and the parent gate is held by a grown-up, so either size will do.
 */
export const HUD_SLOTS = {
  'hud-home': { left: true, top: false, interactive: 'primary' },
  'hud-speaker': { left: true, top: true, interactive: 'any' },
  'parent-gate': { left: false, top: true, interactive: 'any' },
} as const satisfies Record<
  string,
  { left: boolean; top: boolean; interactive: Interactive | 'any' }
>;

const hitRect = (e: LayoutElement): Rect => e.hit ?? e.bounds;

function checkElement(e: LayoutElement, device: DeviceClass, path: string): Issue[] {
  if (e.interactive === undefined) {
    return e.hit === undefined
      ? []
      : [error(`${path}.hit`, 'only interactive elements have a hit area')];
  }
  const issues: Issue[] = [];
  const hit = hitRect(e);
  if (!rectContains(SAFE_AREA, hit)) {
    issues.push(
      error(`${path}.hit`, `tap area must stay inside the safe area ${SAFE_AREA.join(', ')}`),
    );
  }
  const min = minHitFramePx(device, e.interactive);
  if (hit[2] < min || hit[3] < min) {
    issues.push(
      error(
        `${path}.hit`,
        `${e.interactive} tap area on ${device} must be at least ${min} × ${min} frame px (${TOUCH_DP[e.interactive]} dp)`,
      ),
    );
  }
  return issues;
}

function checkHudSlots(
  screen: LayoutScreen,
  device: DeviceClass,
  elements: LayoutElement[],
): Issue[] {
  if (!(ACTIVITY_SCREENS as readonly LayoutScreen[]).includes(screen)) return [];
  return Object.entries(HUD_SLOTS).flatMap(([key, slot]) => {
    const e = elements.find((el) => el.key === key);
    const path = `devices.${device}`;
    if (!e) return [error(path, `activity screens need the ${key} element`)];
    const [x, y, w, h] = e.bounds;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const inQuadrant = cx < FRAME.width / 2 === slot.left && cy < FRAME.height / 2 === slot.top;
    const where = `${slot.top ? 'top' : 'bottom'} ${slot.left ? 'left' : 'right'}`;
    const issues = inQuadrant ? [] : [error(`${path}.${key}`, `${key} sits ${where}`)];
    if (e.interactive === undefined) {
      issues.push(error(`${path}.${key}.interactive`, `${key} is a touch target`));
    } else if (slot.interactive !== 'any' && e.interactive !== slot.interactive) {
      issues.push(error(`${path}.${key}.interactive`, `${key} is a ${slot.interactive} target`));
    }
    return issues;
  });
}

/** Semantic rules the schema can't express. */
export function checkScreenLayout(layout: ScreenLayout): Issue[] {
  const issues: Issue[] = [];
  const keySets = DEVICE_CLASSES.map((device) => {
    const elements = layout.devices[device];
    for (const dupe of duplicates(elements.map((e) => e.key))) {
      issues.push(error(`devices.${device}`, `duplicate element key ${dupe}`));
    }
    elements.forEach((e, i) => issues.push(...checkElement(e, device, `devices.${device}[${i}]`)));
    issues.push(...checkHudSlots(layout.screen, device, elements));
    return new Set(elements.map((e) => e.key));
  });
  const [tablet, phone] = keySets as [Set<string>, Set<string>];
  const onlyTablet = [...tablet].filter((k) => !phone.has(k));
  const onlyPhone = [...phone].filter((k) => !tablet.has(k));
  if (onlyTablet.length > 0 || onlyPhone.length > 0) {
    issues.push(
      error(
        'devices',
        `tablet and phone must define the same keys (tablet only: ${onlyTablet.join(', ') || '—'}; phone only: ${onlyPhone.join(', ') || '—'})`,
      ),
    );
  }
  return issues;
}

const sameRect = (a: Rect, b: Rect): boolean => a.every((v, i) => v === b[i]);

/**
 * The HUD stays put across activity screens (brief §1), so a child never hunts for the home
 * button. Compares every activity layout against the first in ACTIVITY_SCREENS order, per device.
 */
export function checkHudConsistency(layouts: readonly ScreenLayout[]): Issue[] {
  const order = (l: ScreenLayout): number =>
    (ACTIVITY_SCREENS as readonly LayoutScreen[]).indexOf(l.screen);
  // Reference is the first screen in ACTIVITY_SCREENS order, so reports don't depend on file order.
  const activity = layouts.filter((l) => order(l) >= 0).sort((a, b) => order(a) - order(b));
  const [first, ...rest] = activity;
  if (!first) return [];
  return rest.flatMap((layout) =>
    DEVICE_CLASSES.flatMap((device) =>
      Object.keys(HUD_SLOTS).flatMap((key) => {
        const want = first.devices[device].find((e) => e.key === key);
        const got = layout.devices[device].find((e) => e.key === key);
        if (!want || !got) return [];
        const same = sameRect(want.bounds, got.bounds) && sameRect(hitRect(want), hitRect(got));
        return same
          ? []
          : [
              error(
                `${layout.screen}.devices.${device}.${key}`,
                `${key} must match ${first.screen}`,
              ),
            ];
      }),
    ),
  );
}
