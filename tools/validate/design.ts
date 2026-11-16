import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { error, warning } from '../../contracts/common.ts';
import type { Manifest } from '../../contracts/manifest.ts';
import { checkMotion, motion } from '../../contracts/motion.ts';
import {
  checkHudConsistency,
  checkScreenLayout,
  screenLayout,
  type ScreenLayout,
} from '../../contracts/screenLayout.ts';
import { layoutFileName } from '../../contracts/screens.ts';
import { checkTokens, tokens } from '../../contracts/tokens.ts';
import { loadManifest } from './assets.ts';
import {
  inFile,
  laneFiles,
  parseJsonFile,
  symlinkIssue,
  type FileIssue,
  type LaneFile,
  type Report,
} from './lane.ts';
import { lintUiComponent } from './ui-lint.ts';

export const DESIGN_LANE = 'design';
export const UI_LANE = 'ui';

const TOKENS_FILE = `${DESIGN_LANE}/tokens.json`;
const MOTION_FILE = `${DESIGN_LANE}/motion.json`;
const LAYOUTS_DIR = `${DESIGN_LANE}/layouts/`;

/**
 * Review material: concepts, mockups (also the visual baselines), motion reference GIFs, and
 * Markdown notes that go with them, such as an object inventory (#27).
 */
const MEDIA_DIRS = ['concepts/', 'mockups/', 'motion/'].map((d) => `${DESIGN_LANE}/${d}`);
const MEDIA = /\.(?:png|webp|gif|jpe?g|svg|md)$/;

/** ui/: components, their tests, and nothing else. */
const UI_FILE = /^ui\/[A-Z][A-Za-z]+\.svelte$|^ui\/[A-Za-z]+\.test\.ts$/;

interface ManifestView {
  readonly keys: ReadonlySet<string>;
  readonly fonts: ReadonlySet<string>;
}

function manifestView(m: Manifest): ManifestView {
  return {
    keys: new Set(m.assets.map((a) => a.key)),
    fonts: new Set(m.assets.filter((a) => a.type === 'font').map((a) => a.key)),
  };
}

function checkLayoutFile(
  file: string,
  layout: ScreenLayout,
  view: ManifestView | undefined,
): FileIssue[] {
  const issues = checkScreenLayout(layout).map(inFile(file));
  const expected = `${LAYOUTS_DIR}${layoutFileName(layout.screen)}`;
  if (file !== expected)
    issues.push({ ...error('screen', `${layout.screen} belongs in ${expected}`), file });
  if (view) {
    for (const [device, elements] of Object.entries(layout.devices)) {
      elements.forEach((e, i) => {
        if (e.asset !== undefined && !view.keys.has(e.asset)) {
          issues.push({
            ...error(`devices.${device}[${i}].asset`, `${e.asset} is not in assets/manifest.json`),
            file,
          });
        }
      });
    }
  }
  return issues;
}

function checkJson(
  root: string,
  f: LaneFile,
  view: ManifestView | undefined,
  layouts: ScreenLayout[],
): FileIssue[] {
  if (f.path === TOKENS_FILE) {
    const parsed = parseJsonFile(root, f.path, tokens);
    if (!parsed.ok) return parsed.issues;
    const issues = checkTokens(parsed.value).map(inFile(f.path));
    for (const [role, key] of Object.entries(parsed.value.font.family)) {
      if (view && !view.fonts.has(key)) {
        issues.push({
          ...error(`font.family.${role}`, `${key} is not a font in assets/manifest.json`),
          file: f.path,
        });
      }
    }
    return issues;
  }
  if (f.path === MOTION_FILE) {
    const parsed = parseJsonFile(root, f.path, motion);
    return parsed.ok ? checkMotion(parsed.value).map(inFile(f.path)) : parsed.issues;
  }
  const parsed = parseJsonFile(root, f.path, screenLayout);
  if (!parsed.ok) return parsed.issues;
  layouts.push(parsed.value);
  return checkLayoutFile(f.path, parsed.value, view);
}

const isLayout = (path: string): boolean =>
  path.startsWith(LAYOUTS_DIR) &&
  path.endsWith('.json') &&
  !path.slice(LAYOUTS_DIR.length).includes('/');

function checkDesignFile(
  root: string,
  f: LaneFile,
  view: ManifestView | undefined,
  layouts: ScreenLayout[],
): FileIssue[] {
  if (f.path === TOKENS_FILE || f.path === MOTION_FILE || isLayout(f.path))
    return checkJson(root, f, view, layouts);
  if (MEDIA_DIRS.some((d) => f.path.startsWith(d)) && MEDIA.test(f.path)) return [];
  return [
    {
      ...error(
        '',
        'not a design artifact: tokens.json, motion.json, layouts/<screen>.json, or media and .md notes in concepts/, mockups/, motion/',
      ),
      file: f.path,
    },
  ];
}

function checkUiFile(root: string, f: LaneFile): FileIssue[] {
  if (!UI_FILE.test(f.path))
    return [{ ...error('', 'ui/ holds <Component>.svelte and their tests only'), file: f.path }];
  if (!f.path.endsWith('.svelte')) return [];
  return lintUiComponent(f.path, readFileSync(join(root, f.path), 'utf8')).map(inFile(f.path));
}

/** validate:design: design/ against the contracts, and the ui/ lane rules. */
export function validateDesign(root: string): Report {
  const design = laneFiles(root, DESIGN_LANE);
  const ui = laneFiles(root, UI_LANE);
  const all = [...design, ...ui];
  const issues: FileIssue[] = all.filter((f) => f.symlink).map(symlinkIssue);

  const parsed = loadManifest(root);
  const view = parsed?.ok ? manifestView(parsed.value) : undefined;
  if (design.length > 0 && !view) {
    issues.push({
      ...warning('', 'no valid assets/manifest.json yet: asset and font keys are unchecked'),
      file: 'assets/manifest.json',
    });
  }

  const layouts: ScreenLayout[] = [];
  for (const f of design.filter((d) => !d.symlink))
    issues.push(...checkDesignFile(root, f, view, layouts));
  for (const f of ui.filter((d) => !d.symlink)) issues.push(...checkUiFile(root, f));

  issues.push(...checkHudConsistency(layouts).map(inFile(LAYOUTS_DIR)));
  return { lane: `${DESIGN_LANE}+${UI_LANE}`, files: all.length, issues };
}
