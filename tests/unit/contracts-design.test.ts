import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  duplicates,
  formatPath,
  rectContains,
  rectContainsPoint,
  zodIssues,
} from '../../contracts/common';
import { CONTRACT_SCHEMAS, jsonSchema, type ContractName } from '../../contracts/jsonSchema';
import { checkMotion, EASINGS, motion } from '../../contracts/motion';
import {
  checkHudConsistency,
  checkScreenLayout,
  minHitFramePx,
  screenLayout,
  type ScreenLayout,
} from '../../contracts/screenLayout';
import {
  ACTIVITY_SCREENS,
  LAYOUT_SCREENS,
  SCREEN_IDS,
  layoutFileName,
} from '../../contracts/screens';
import { checkTokens, contrastRatio, SWATCH_COUNT, tokens } from '../../contracts/tokens';
import { motionFixture, screenFixture, tokensFixture } from './fixtures/contracts';

const messages = (issues: { path: string; message: string }[]): string[] =>
  issues.map((i) => `${i.path}: ${i.message}`);

const tabletElement = (l: ScreenLayout, key: string) => {
  const e = l.devices.tablet.find((x) => x.key === key);
  if (!e) throw new Error(`fixture lacks ${key}`);
  return e;
};

describe('common helpers', () => {
  it('formats issue paths like the semantic checks do', () => {
    expect(formatPath(['rooms', 2, 'stand'])).toBe('rooms[2].stand');
    expect(formatPath([0, 'x'])).toBe('[0].x');
    expect(formatPath([])).toBe('');
  });

  it('turns zod errors into issues', () => {
    const result = z.strictObject({ a: z.number() }).safeParse({ a: 'x' });
    if (result.success) throw new Error('should fail');
    expect(zodIssues(result.error)).toEqual([
      { severity: 'error', path: 'a', message: expect.stringContaining('number') as string },
    ]);
  });

  it('compares rects and lists duplicates once', () => {
    expect(rectContains([0, 0, 10, 10], [2, 2, 8, 8])).toBe(true);
    expect(rectContains([0, 0, 10, 10], [2, 2, 9, 8])).toBe(false);
    expect(rectContainsPoint([0, 0, 10, 10], [10, 10])).toBe(true);
    expect(rectContainsPoint([0, 0, 10, 10], [11, 0])).toBe(false);
    expect(duplicates(['a', 'b', 'a', 'a'])).toEqual(['a']);
  });
});

describe('screens', () => {
  it('only lists real screens, and kebab-cases layout file names', () => {
    for (const s of LAYOUT_SCREENS) expect(SCREEN_IDS).toContain(s);
    for (const s of ACTIVITY_SCREENS) expect(LAYOUT_SCREENS).toContain(s);
    expect(layoutFileName('SCR-COLOR-PICK')).toBe('scr-color-pick.json');
  });
});

describe('screen layout', () => {
  it('derives tap minimums from the reference devices', () => {
    expect(minHitFramePx('tablet', 'secondary')).toBe(99);
    expect(minHitFramePx('tablet', 'primary')).toBe(132);
    expect(minHitFramePx('phone', 'secondary')).toBe(210);
    expect(minHitFramePx('phone', 'primary')).toBe(280);
  });

  it('accepts the fixture', () => {
    expect(screenLayout.parse(screenFixture())).toBeTruthy();
    expect(checkScreenLayout(screenFixture())).toEqual([]);
  });

  it('rejects screens without a layout file and bad keys in the schema', () => {
    const bad = { ...screenFixture(), screen: 'SCR-PARENT-HOME' };
    expect(screenLayout.safeParse(bad).success).toBe(false);
    const badKey = screenFixture();
    tabletElement(badKey, 'main').key = 'Main Area';
    expect(screenLayout.safeParse(badKey).success).toBe(false);
  });

  it('keeps tap areas big enough and inside the safe area', () => {
    const l = screenFixture();
    tabletElement(l, 'hud-home').bounds = [100, 1000, 120, 140];
    tabletElement(l, 'hud-speaker').hit = [100, 80, 90, 200];
    tabletElement(l, 'parent-gate').hit = [1750, 20, 120, 120];
    tabletElement(l, 'main').hit = [0, 0, 10, 10];
    expect(messages(checkScreenLayout(l))).toEqual([
      'devices.tablet[0].hit: primary tap area on tablet must be at least 132 × 132 frame px (96 dp)',
      'devices.tablet[1].hit: secondary tap area on tablet must be at least 99 × 99 frame px (72 dp)',
      'devices.tablet[2].hit: tap area must stay inside the safe area 80, 60, 1760, 1080',
      'devices.tablet[3].hit: only interactive elements have a hit area',
    ]);
  });

  it('requires the HUD in its fixed corners on activity screens only', () => {
    const l = screenFixture();
    tabletElement(l, 'hud-home').bounds = [1600, 1000, 140, 140];
    l.devices.phone = l.devices.phone.filter((e) => e.key !== 'hud-speaker');
    expect(messages(checkScreenLayout(l))).toEqual(
      expect.arrayContaining([
        'devices.tablet.hud-home: hud-home sits bottom left',
        'devices.phone: activity screens need the hud-speaker element',
      ]),
    );
    const sizes = screenFixture();
    tabletElement(sizes, 'hud-home').interactive = 'secondary';
    delete tabletElement(sizes, 'parent-gate').interactive;
    expect(messages(checkScreenLayout(sizes))).toEqual([
      'devices.tablet.hud-home.interactive: hud-home is a primary target',
      'devices.tablet.parent-gate.interactive: parent-gate is a touch target',
    ]);
    const boot: ScreenLayout = {
      ...screenFixture('SCR-BOOT'),
      devices: {
        tablet: [{ key: 'mulai', bounds: [700, 400, 400, 400], depth: 1, interactive: 'primary' }],
        phone: [{ key: 'mulai', bounds: [660, 360, 600, 600], depth: 1, interactive: 'primary' }],
      },
    };
    expect(checkScreenLayout(boot)).toEqual([]);
  });

  it('wants the same keys on both devices, without duplicates', () => {
    const l = screenFixture();
    l.devices.tablet.push(
      { ...tabletElement(l, 'main') },
      { key: 'extra', bounds: [0, 0, 1, 1], depth: 0 },
    );
    expect(messages(checkScreenLayout(l))).toEqual([
      'devices.tablet: duplicate element key main',
      'devices: tablet and phone must define the same keys (tablet only: extra; phone only: —)',
    ]);
    const p = screenFixture();
    p.devices.phone.push({ key: 'extra', bounds: [0, 0, 1, 1], depth: 0 });
    expect(messages(checkScreenLayout(p))).toEqual([
      'devices: tablet and phone must define the same keys (tablet only: —; phone only: extra)',
    ]);
  });

  it('keeps the HUD in the same place across activity screens', () => {
    const trace = screenFixture('SCR-TRACE');
    const count = screenFixture('SCR-COUNT');
    const boot = screenFixture('SCR-BOOT');
    expect(checkHudConsistency([boot, trace, count])).toEqual([]);
    tabletElement(count, 'hud-home').bounds = [110, 1000, 140, 140];
    tabletElement(count, 'parent-gate').hit = [1690, 70, 140, 140];
    count.devices.phone = count.devices.phone.filter((e) => e.key !== 'hud-speaker');
    expect(messages(checkHudConsistency([boot, trace, count]))).toEqual([
      'SCR-COUNT.devices.tablet.hud-home: hud-home must match SCR-TRACE',
      'SCR-COUNT.devices.tablet.parent-gate: parent-gate must match SCR-TRACE',
    ]);
    expect(checkHudConsistency([boot])).toEqual([]);
  });
});

describe('tokens', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('accepts the fixture', () => {
    expect(tokens.parse(tokensFixture())).toBeTruthy();
    expect(checkTokens(tokensFixture())).toEqual([]);
  });

  it('caps the palette and wants exactly 6 swatches', () => {
    const t = tokensFixture();
    t.color.palette = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`c${i}`, '#000000']),
    );
    t.color.swatches.pop();
    const result = tokens.safeParse(t);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual([
      'color.palette',
      'color.swatches',
    ]);
    // The old ten no longer fit the phone.
    const ten = tokensFixture();
    ten.color.swatches.push('#8e24aa', '#8d6e63', '#212121', '#ffffff');
    expect(tokens.safeParse(ten).error?.issues.map((i) => i.path.join('.'))).toEqual([
      'color.swatches',
    ]);
    expect(SWATCH_COUNT).toBe(6);
  });

  it('flags low contrast and repeated swatches', () => {
    const t = tokensFixture();
    t.color.tracing.ink = '#3f6b60';
    t.color.parent.text = '#bbbbbb';
    t.color.swatches[1] = t.color.swatches[0]?.toUpperCase() ?? '';
    expect(messages(checkTokens(t))).toEqual([
      'color.tracing.ink: contrast against color.tracing.surface is 2.04:1, needs 3:1',
      'color.tracing.ink: contrast against color.tracing.guide is 1.00:1, needs 2:1',
      'color.parent.text: contrast against color.parent.surface is 1.92:1, needs 4.5:1',
      'color.swatches: swatches must be 6 different colours',
    ]);
  });
});

describe('motion', () => {
  it('uses Phaser ease names', () => {
    expect(EASINGS).toContain('Linear');
    expect(EASINGS).toContain('Back.easeOut');
    expect(EASINGS).toHaveLength(31);
  });

  it('accepts the fixture', () => {
    expect(motion.parse(motionFixture())).toBeTruthy();
    expect(checkMotion(motionFixture())).toEqual([]);
  });

  it('rejects unknown easings and bad moment names', () => {
    const m = motionFixture() as unknown as { moments: Record<string, { easing: string }> };
    (m.moments.celebrate as { easing: string }).easing = 'ease-in-out';
    m.moments['Bad Name'] = { kind: 'feedback', duration: 100, easing: 'Linear' } as never;
    expect(motion.safeParse(m).success).toBe(false);
  });

  it('enforces kind caps, the brief caps, the bedtime minimum and every required moment', () => {
    const m = motionFixture();
    m.moments['boot.breathe'] = { kind: 'transition', duration: 900, easing: 'Linear' };
    m.moments['trace.snap'] = { kind: 'feedback', duration: 300, easing: 'Linear' };
    m.moments.bedtime = { kind: 'sequence', duration: 1500, easing: 'Linear' };
    m.moments.celebrate = { kind: 'transition', duration: 500, easing: 'Linear' };
    delete m.moments['color.fill'];
    expect(messages(checkMotion(m))).toEqual([
      'moments.boot.breathe.duration: transition lasts at most 600 ms',
      'moments.trace.snap.duration: trace.snap lasts at most 250 ms',
      'moments: missing color.fill',
      'moments.celebrate.kind: celebrate is a celebration',
      'moments.bedtime.duration: bedtime lasts at least 2000 ms',
    ]);
  });
});

describe('JSON Schema', () => {
  it.each(Object.keys(CONTRACT_SCHEMAS) as ContractName[])('generates %s', (name) => {
    const schema = jsonSchema(name);
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.title).toBe(name);
    expect(schema.type).toBe('object');
    expect(String(schema.description)).toContain(CONTRACT_SCHEMAS[name].describes);
  });
});
