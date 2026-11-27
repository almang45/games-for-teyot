import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encodePng } from '../../tools/build/png';
import { sheetPng, THEIA_STANDING } from './fixtures/sprites';
import { loadManifest, validateAssets } from '../../tools/validate/assets';
import { validateDesign } from '../../tools/validate/design';
import { printReport, type Report } from '../../tools/validate/lane';
import { lintUiComponent } from '../../tools/validate/ui-lint';
import {
  houseFixture,
  manifestFixture,
  motionFixture,
  screenFixture,
  tokensFixture,
} from './fixtures/contracts';
import { gridPage } from './fixtures/pages';

let root: string;

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('fixture list is empty');
  return item;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rct-validate-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function put(file: string, content: string | Buffer): void {
  const full = join(root, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const putJson = (file: string, value: unknown): void => {
  put(file, JSON.stringify(value));
};

const blank = (w: number, h: number): Buffer => encodePng(w, h, () => [255, 255, 255, 0]);

/** The manifest fixture with every file it registers. */
function deliverAssets(): void {
  putJson('assets/manifest.json', manifestFixture());
  put('assets/character/theia/default.png', sheetPng(1024, 256, [256, 256], [THEIA_STANDING]));
  put('assets/counting/objects/apel.png', blank(192, 192));
  put('assets/counting/containers/mangkuk.png', blank(512, 384));
  // Occluder and prop art isn't delivered here; their keys are tested separately.
  putJson('assets/house/layout.json', { ...houseFixture(), occluders: [], props: [] });
  put('assets/fonts/andika-regular.woff2', Buffer.from('wOF2 not really a font'));
  put('assets/ui/home.png', blank(144, 144));
}

const errors = (r: Report): string[] =>
  r.issues.filter((i) => i.severity === 'error').map((i) => `${i.file} ${i.path}: ${i.message}`);
const warnings = (r: Report): string[] =>
  r.issues.filter((i) => i.severity === 'warning').map((i) => `${i.file} ${i.path}: ${i.message}`);

describe('validateAssets', () => {
  it('passes an empty or missing lane', () => {
    expect(validateAssets(root)).toEqual({ lane: 'assets', files: 0, issues: [] });
    put('assets/.gitkeep', '');
    put('assets/README.md', '# notes');
    expect(validateAssets(root).files).toBe(0);
  });

  it('needs a manifest once assets arrive', () => {
    put('assets/counting/objects/apel.png', blank(192, 192));
    expect(errors(validateAssets(root))).toEqual([
      'assets/manifest.json : assets/ needs a manifest.json',
    ]);
  });

  it('reports a manifest that does not parse', () => {
    put('assets/manifest.json', '{ nope');
    expect(errors(validateAssets(root))).toEqual([
      expect.stringMatching(/^assets\/manifest\.json : not valid JSON/) as string,
    ]);
    putJson('assets/manifest.json', { version: 2, assets: [] });
    expect(errors(validateAssets(root))).toEqual([
      expect.stringMatching(/^assets\/manifest\.json version: /) as string,
    ]);
  });

  it('keeps assets/style/ to PNG reference sheets', () => {
    deliverAssets();
    put('assets/style/theia-ref.jpg', 'JFIF');
    put('assets/style/fake.png', 'not a png at all, just text pretending');
    expect(errors(validateAssets(root))).toEqual([
      'assets/style/fake.png : not a PNG file: reference sheets are drawn PNG sheets (ASSETS.md §3)',
      'assets/style/theia-ref.jpg : reference sheets are drawn PNG sheets (ASSETS.md §3)',
    ]);
  });

  it('takes a font licence beside the fonts without registering it', () => {
    deliverAssets();
    put('assets/fonts/OFL.txt', 'SIL OPEN FONT LICENSE Version 1.1');
    put('assets/fonts/LICENSE-andika.txt', 'Copyright SIL International');
    expect(errors(validateAssets(root))).toEqual([]);
    put('assets/fonts/OFL.txt', '');
    put('assets/fonts/notes.txt', 'not a licence');
    put('assets/ui/OFL.txt', 'SIL OPEN FONT LICENSE Version 1.1');
    expect(errors(validateAssets(root))).toEqual([
      'assets/fonts/OFL.txt : a font licence is plain text (ASSETS.md §5)',
      'assets/fonts/notes.txt : not registered in assets/manifest.json',
      'assets/ui/OFL.txt : not registered in assets/manifest.json',
    ]);
  });

  it('accepts a complete delivery, warning only about staged art', () => {
    deliverAssets();
    put('assets/style/reference-sheet.png', blank(10, 10));
    const report = validateAssets(root);
    expect(errors(report)).toEqual([]);
    expect(warnings(report)).toEqual([
      expect.stringMatching(
        /^assets\/manifest\.json assets\[0\]\.animations: not delivered yet/,
      ) as string,
      'assets/house/layout.json rooms: house.structure.lt-dasar is not delivered yet',
      'assets/house/layout.json rooms: house.structure.lt-atas is not delivered yet',
    ]);
    expect(report.files).toBe(8);
  });

  it('flags missing, unregistered, wrongly sized and broken files', () => {
    deliverAssets();
    put('assets/counting/objects/apel.png', blank(200, 192));
    put('assets/ui/home.png', Buffer.from('not a png'));
    put('assets/fonts/andika-regular.woff2', Buffer.from('ttf!'));
    put('assets/counting/objects/stray.png', blank(192, 192));
    const m = manifestFixture();
    m.assets.push({
      key: 'counting.objects.telur',
      type: 'image',
      path: 'counting/objects/telur.png',
      room: 'dapur',
    });
    putJson('assets/manifest.json', m);
    expect(errors(validateAssets(root))).toEqual([
      'assets/manifest.json assets[1]: counting.objects.apel must be 192 × 192 px, got 200 × 192',
      'assets/fonts/andika-regular.woff2 : not a WOFF2 font',
      'assets/ui/home.png : not a PNG file',
      'assets/manifest.json assets[6].path: assets/counting/objects/telur.png does not exist',
      'assets/counting/objects/stray.png : not registered in assets/manifest.json',
    ]);
  });

  it('checks the house layout and its occluder and prop keys', () => {
    deliverAssets();
    const layout = houseFixture();
    first(layout.rooms).stand = [5, 5];
    putJson('assets/house/layout.json', layout);
    expect(errors(validateAssets(root))).toEqual(
      expect.arrayContaining([
        'assets/house/layout.json rooms[0].stand: stand must lie inside the walk polygon',
        'assets/house/layout.json occluders[0].key: house.occluders.railing is not in the manifest',
        'assets/house/layout.json props[0].key: house.props.dapur.kulkas is not in the manifest',
      ]),
    );
    putJson('assets/house/layout.json', { version: 1 });
    expect(errors(validateAssets(root))[0]).toMatch(/^assets\/house\/layout\.json size: /);
  });

  // ~0.6 s plain, but v8 coverage instruments the per-pixel loops: ~8 s on CI runners.
  it('decodes coloring pages and checks their line art', () => {
    deliverAssets();
    const m = manifestFixture();
    m.assets.push({
      key: 'coloring.ayam',
      type: 'coloring',
      path: 'coloring/ayam.png',
      room: 'ruang-keluarga',
    });
    putJson('assets/manifest.json', m);
    const art = gridPage({ width: 1920, height: 1200, cols: 1, rows: 1, line: 10 });
    put(
      'assets/coloring/ayam.png',
      encodePng(art.width, art.height, (x, y) => {
        const o = (y * art.width + x) * 4;
        return [art.rgba[o] ?? 0, art.rgba[o + 1] ?? 0, art.rgba[o + 2] ?? 0, 255];
      }),
    );
    expect(errors(validateAssets(root))).toEqual([
      // The one cell, and the 40 px side margins of the background.
      expect.stringMatching(/^assets\/coloring\/ayam\.png : 2 fillable regions/) as string,
    ]);
  }, 30_000);

  it('rejects symlinks', () => {
    deliverAssets();
    symlinkSync('/etc/hosts', join(root, 'assets', 'link.png'));
    expect(errors(validateAssets(root))).toEqual([
      'assets/link.png : symlinks are not allowed in a lane: they can point into reference/ or recordings/',
    ]);
  });

  it('rejects a registered path that is a symlink', () => {
    deliverAssets();
    rmSync(join(root, 'assets/ui/home.png'));
    symlinkSync(join(root, 'assets/counting/objects/apel.png'), join(root, 'assets/ui/home.png'));
    expect(errors(validateAssets(root))).toEqual([
      'assets/ui/home.png : symlinks are not allowed in a lane: they can point into reference/ or recordings/',
    ]);
  });

  it('never reads a registered file through a symlinked folder', () => {
    deliverAssets();
    mkdirSync(join(root, 'outside'));
    renameSync(join(root, 'assets/ui'), join(root, 'outside/ui'));
    symlinkSync(join(root, 'outside/ui'), join(root, 'assets/ui'));
    expect(errors(validateAssets(root))).toEqual([
      'assets/ui : symlinks are not allowed in a lane: they can point into reference/ or recordings/',
      'assets/ui/home.png : assets/ui/home.png goes through a symlink: copy the file in instead',
    ]);
  });

  it('reads nothing through a symlinked assets/ folder', () => {
    deliverAssets();
    renameSync(join(root, 'assets'), join(root, 'outside'));
    symlinkSync(join(root, 'outside'), join(root, 'assets'));
    expect(errors(validateAssets(root))).toEqual([
      'assets : symlinks are not allowed in a lane: they can point into reference/ or recordings/',
    ]);
  });

  it('reads nothing through a symlinked manifest, here or in validate:design', () => {
    deliverAssets();
    renameSync(join(root, 'assets/manifest.json'), join(root, 'manifest.json'));
    symlinkSync(join(root, 'manifest.json'), join(root, 'assets/manifest.json'));
    expect(errors(validateAssets(root))).toEqual([
      'assets/manifest.json : symlinks are not allowed in a lane: they can point into reference/ or recordings/',
    ]);
    expect(loadManifest(root)).toBeUndefined();
  });
});

const COMPONENT = `<script lang="ts">
  import type { BigButtonProps } from '../contracts/ui.ts';
  let { label, onpress }: BigButtonProps = $props();
</script>

<button aria-label={label} onclick={onpress} style="padding: var(--space-m)"></button>

<style>
  button { border-radius: var(--radius-button); width: 100%; margin: 0; }
</style>
`;

describe('lintUiComponent', () => {
  it('accepts a presentational component', () => {
    expect(lintUiComponent('ui/BigButton.svelte', COMPONENT)).toEqual([]);
  });

  it('rejects components the contract does not list', () => {
    expect(lintUiComponent('ui/Fancy.svelte', COMPONENT)[0]?.message).toMatch(
      /^Fancy is not a contracts\/ui\.ts component/,
    );
  });

  it('wants the props type from the contract', () => {
    const local = COMPONENT.replace("from '../contracts/ui.ts'", "from './types'");
    expect(lintUiComponent('ui/BigButton.svelte', local).map((i) => i.message)).toEqual([
      'declare props as BigButtonProps from contracts/ui.ts via $props()',
      './types: ui/ imports only svelte, sibling ui/ components and contracts/ui.ts',
    ]);
  });

  it('finds the props type among other imports, renamed or not', () => {
    const several = COMPONENT.replace(
      '{ BigButtonProps }',
      '{ InteractiveState, BigButtonProps as Props, }',
    ).replace(': BigButtonProps', ': Props');
    expect(lintUiComponent('ui/BigButton.svelte', several)).toEqual([]);
    const lookalike = COMPONENT.replace('{ BigButtonProps }', '{ BigButtonPropsDraft }');
    expect(lintUiComponent('ui/BigButton.svelte', lookalike).map((i) => i.message)).toEqual([
      'declare props as BigButtonProps from contracts/ui.ts via $props()',
    ]);
  });

  it('keeps src/, storage, network and globals out', () => {
    const bad = COMPONENT.replace(
      '</script>',
      "import { log } from '../src/log';\nlocalStorage.x = 1; fetch('/x'); window.state = 1;\n</script>",
    );
    const globals = '(use props, events, <svelte:window> or svelte/reactivity)';
    expect(lintUiComponent('ui/BigButton.svelte', bad).map((i) => i.message)).toEqual([
      '../src/log: ui/ must not import from src/',
      'ui/ must not use storage: localStorage',
      'ui/ must not use network: fetch',
      `ui/ must not use browser globals ${globals}: window`,
    ]);
    const sneaky = COMPONENT.replace(
      '</script>',
      [
        "import { getContext, onMount } from 'svelte';",
        "const game = getContext('game-state');",
        "const mods = import.meta.glob('../src/game/*.ts', { eager: true });",
        "self.x = 1; globalThis['y'] ||= 1; caches.open('x'); navigator.storage.persist();",
        "new Function('return this')();",
        '</script>',
        '{@html label}',
      ].join('\n'),
    );
    expect(lintUiComponent('ui/BigButton.svelte', sneaky).map((i) => i.message)).toEqual([
      'getContext from svelte: ui/ uses only onMount, onDestroy, tick, untrack, flushSync (context is shared state)',
      'ui/ must not use import.meta: files and settings come in as props',
      `ui/ must not use browser globals ${globals}: self`,
      `ui/ must not use browser globals ${globals}: globalThis`,
      'ui/ must not use storage: caches',
      `ui/ must not use browser globals ${globals}: navigator`,
      'ui/ must not use dynamic code: Function',
      'ui/ must not use {@html}: write the markup out, so it can be checked',
    ]);
  });

  it('is not fooled by regex literals or script attributes', () => {
    const regex = COMPONENT.replace(
      '</script>',
      "const re = /^https?:\\/\\//; fetch('/x');\nconst q = /['\"]/; localStorage.y = 1;\n</script>",
    );
    expect(lintUiComponent('ui/BigButton.svelte', regex).map((i) => i.message)).toEqual([
      'ui/ must not use network: fetch',
      'ui/ must not use storage: localStorage',
    ]);
    const generic = COMPONENT.replace(
      '<script lang="ts">',
      '<script lang="ts" generics="T extends Record<string, unknown>">',
    ).replace('</script>', 'const cdn = "https://cdn.example.com/x.js";\n</script>');
    expect(lintUiComponent('ui/BigButton.svelte', generic).map((i) => i.message)).toEqual([
      'remote URL https://cdn.example.com/x.js: ui/ ships no third-party requests',
    ]);
  });

  it('rejects markup that hides code or styles from the checks', () => {
    const hidden = COMPONENT.replace(
      '<button',
      [
        '<svelte:head><style>@import url(https://fonts.example.com/x); .a { color: red; }</style>',
        "<script>localStorage.setItem('a', 'b');</script></svelte:head>",
        '<a href="javascript:void(0)" onclick="localStorage.clear()">x</a>',
        '<svelte:element this="script">x</svelte:element>',
        '<svelte:element this={label}>y</svelte:element>',
        '<iframe title="t" src="/x.html"></iframe>',
        '<button',
      ].join('\n'),
    );
    expect(lintUiComponent('ui/BigButton.svelte', hidden).map((i) => i.message)).toEqual([
      'ui/ must not render <style>: styles go in the component <style>',
      'ui/ must not render <script>: code goes in the component <script>',
      'href="javascript:…": handle it with an event prop',
      'onclick="…": write handlers as onclick={…}',
      '<svelte:element> needs a fixed tag, so it can be checked',
      'ui/ must not render <iframe>: ui/ shows its own markup only',
    ]);
  });

  it('wants its own names to differ from browser globals, wherever they are declared', () => {
    const shadowing = COMPONENT.replace(
      '</script>',
      [
        'function load(fetch: () => void) { return fetch; }',
        "fetch('/api');",
        'const { parent } = { parent: 1 };',
        '</script>',
        '{#each [label] as item, history}<i>{item}{history}</i>{/each}',
      ].join('\n'),
    );
    // Markup is read first. A use of the each index counts as the global too; renaming fixes both.
    expect(lintUiComponent('ui/BigButton.svelte', shadowing).map((i) => i.message)).toEqual([
      'history is a browser global: give yours another name (a prop: { history: other })',
      'ui/ must not use browser globals (use props, events, <svelte:window> or svelte/reactivity): history',
      'fetch is a browser global: give yours another name (a prop: { fetch: other })',
      'ui/ must not use network: fetch',
      'parent is a browser global: give yours another name (a prop: { parent: other })',
    ]);
  });

  it('allows TypeScript for types only', () => {
    // Type positions are skipped (WebSocket here is a type); constructs that emit code are refused.
    const runtime = COMPONENT.replace(
      '</script>',
      [
        "enum E { A = fetch('/x') as never }",
        'namespace N { export const x = 1; }',
        'class C { constructor(private x = 1) {} }',
        'type T = { a: WebSocket };',
        '</script>',
      ].join('\n'),
    );
    expect(lintUiComponent('ui/BigButton.svelte', runtime).map((i) => i.message)).toEqual([
      'ui/ uses TypeScript for types only: no enum',
      'ui/ uses TypeScript for types only: no namespace',
      'ui/ uses TypeScript for types only: no parameter properties',
    ]);
  });

  it('wants tokens instead of literal colours and sizes', () => {
    const bad = COMPONENT.replace('margin: 0;', 'margin: 12px; color: #ff0000;').replace(
      'padding: var(--space-m)',
      'background: rgb(1, 2, 3); padding: 1.5rem',
    );
    expect(lintUiComponent('ui/BigButton.svelte', bad).map((i) => i.message)).toEqual([
      'literal size 12px: use a token variable',
      'literal colour #ff0000: use a token variable',
      'literal colour rgb(: use a token variable',
      'literal size 1.5rem: use a token variable',
    ]);
  });

  it('reads every way a component can write CSS', () => {
    const bad = COMPONENT.replace(
      'style="padding: var(--space-m)"',
      "style='color: #ff0000' style:height={'20px'} style:outline-color=\"red\"",
    ).replace(
      'margin: 0;',
      'margin: -8px; color: White; height: 10dvh; white-space: nowrap; color: var(--red);',
    );
    expect(lintUiComponent('ui/BigButton.svelte', bad).map((i) => i.message)).toEqual([
      'literal size -8px: use a token variable',
      'literal colour White: use a token variable',
      'literal size 10dvh: use a token variable',
      'literal colour #ff0000: use a token variable',
      'literal size 20px: use a token variable',
      'literal colour red: use a token variable',
    ]);
  });

  it('allows only svelte, sibling components and the ui contract as imports', () => {
    const imports = [
      "import { fade } from 'svelte/transition';",
      "import Swatch from './Swatch.svelte';",
      "import '../src/log/side-effect';",
      "import { writable } from 'svelte/store';",
      "export { x } from '../src';",
      "const later = await import('../src/game/state.ts');",
    ].join('\n');
    const bad = COMPONENT.replace('</script>', `${imports}\n</script>`);
    expect(lintUiComponent('ui/BigButton.svelte', bad).map((i) => i.message)).toEqual([
      '../src/log/side-effect: ui/ must not import from src/',
      'svelte/store: ui/ imports only svelte, sibling ui/ components and contracts/ui.ts',
      '../src: ui/ must not import from src/',
      'ui/ must not use dynamic import()',
    ]);
    const whole = COMPONENT.replace('</script>', "import * as svelte from 'svelte';\n</script>");
    expect(lintUiComponent('ui/BigButton.svelte', whole).map((i) => i.message)).toEqual([
      'svelte: import its functions by name',
    ]);
    const shared = COMPONENT.replace('<script lang="ts">', '<script lang="ts" module>');
    expect(lintUiComponent('ui/BigButton.svelte', shared).map((i) => i.message)).toEqual([
      // A module script is no instance script, so nothing reads the props either.
      'declare props as BigButtonProps from contracts/ui.ts via $props()',
      'ui/ must not use <script module>: it is state shared by every instance',
    ]);
  });

  it('keeps remote URLs out of markup, script and style', () => {
    const cdn = COMPONENT.replace(
      '<button',
      '<img src="https://cdn.example.com/x.png" alt="" />\n<button',
    );
    expect(lintUiComponent('ui/BigButton.svelte', cdn).map((i) => i.message)).toEqual([
      'remote URL https://cdn.example.com/x.png: ui/ ships no third-party requests',
    ]);
    const font = COMPONENT.replace(
      '<style>',
      "<style>\n  @import url('//fonts.googleapis.com/css2?family=Andika');",
    );
    expect(lintUiComponent('ui/BigButton.svelte', font).map((i) => i.message)).toEqual([
      'remote URL //fonts.googleapis.com: ui/ ships no third-party requests',
      '@import: styles come from tokens, not other stylesheets',
    ]);
  });

  it('ignores comments, properties, local names, namespaces and selectors', () => {
    const fine = COMPONENT.replace(
      '</script>',
      [
        "  import { onMount, type Snippet } from 'svelte';",
        '  // never touch localStorage here; see https://example.com/rules',
        '  /* fetch( happens in src/, not here */',
        '  const same = label == "x";',
        '  const url = "local//path";',
        "  const note = 'it\\'s // still a string';",
        '  const api = { fetch: () => 1 }; api.fetch();',
        '  const { history: past } = { history: [label] }; past.push(label);',
        '</script>',
        '<!-- https://example.com/mockup -->',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M0 0" /></svg>',
      ].join('\n'),
    ).replace(
      '<style>',
      [
        '<style>',
        '  /* #ff0000 was the old red, 12px the old size */',
        '  button:not(.white) { clip-path: url(#face); }',
        '  div :global(.red) { opacity: 0.5; }',
      ].join('\n'),
    );
    expect(lintUiComponent('ui/BigButton.svelte', fine)).toEqual([]);
  });

  it('reports a component that does not parse', () => {
    expect(
      lintUiComponent('ui/BigButton.svelte', '<script>let x = ;</script>')[0]?.message,
    ).toMatch(/^does not parse: /);
  });
});

function deliverDesign(): void {
  putJson('design/tokens.json', tokensFixture());
  putJson('design/motion.json', motionFixture());
  putJson('design/layouts/scr-trace.json', screenFixture('SCR-TRACE'));
  putJson('design/layouts/scr-count.json', screenFixture('SCR-COUNT'));
  put('design/mockups/SCR-TRACE/tablet.png', blank(4, 4));
  put('design/motion/celebrate.gif', 'GIF89a');
  put('ui/BigButton.svelte', COMPONENT);
  put('ui/BigButton.test.ts', 'export {};');
}

describe('validateDesign', () => {
  it('passes empty lanes', () => {
    expect(validateDesign(root)).toEqual({ lane: 'design+ui', files: 0, issues: [] });
  });

  it('accepts a full delivery, checking keys against the manifest', () => {
    deliverAssets();
    deliverDesign();
    const report = validateDesign(root);
    expect(report.issues).toEqual([]);
    expect(report.files).toBe(8);
  });

  it('warns when there is no manifest to check keys against', () => {
    deliverDesign();
    expect(warnings(validateDesign(root))).toEqual([
      'assets/manifest.json : no valid assets/manifest.json yet: asset and font keys are unchecked',
    ]);
    expect(errors(validateDesign(root))).toEqual([]);
  });

  it('reports schema, semantic and cross-lane problems', () => {
    deliverAssets();
    deliverDesign();
    const t = tokensFixture();
    t.color.parent.text = '#eeeeee';
    t.font.family.display = 'font.comic';
    putJson('design/tokens.json', t);
    putJson('design/motion.json', { version: 1, moments: {} });
    const count = screenFixture('SCR-COUNT');
    first(count.devices.tablet).asset = 'ui.missing';
    first(count.devices.tablet).bounds = [110, 1000, 140, 140];
    putJson('design/layouts/scr-count.json', count);
    putJson('design/layouts/scr-tidy.json', screenFixture('SCR-TRACE'));
    putJson('design/layouts/scr-boot.json', { version: 1 });
    expect(errors(validateDesign(root))).toEqual(
      expect.arrayContaining([
        'design/tokens.json color.parent.text: contrast against color.parent.surface is 1.16:1, needs 4.5:1',
        'design/tokens.json font.family.display: font.comic is not a font in assets/manifest.json',
        'design/motion.json moments: missing celebrate',
        'design/layouts/scr-count.json devices.tablet[0].asset: ui.missing is not in assets/manifest.json',
        'design/layouts/scr-tidy.json screen: SCR-TRACE belongs in design/layouts/scr-trace.json',
        expect.stringMatching(/^design\/layouts\/scr-boot\.json screen: /) as string,
        'design/layouts/ SCR-COUNT.devices.tablet.hud-home: hud-home must match SCR-TRACE',
      ]),
    );
  });

  it('rejects files that are not design artifacts', () => {
    put('design/notes.txt', 'hello');
    put('design/notes.md', '# Notes');
    // Notes next to the review material are fine (#27).
    put('design/concepts/M1/house/inventory.md', '# Inventory');
    put('design/mockups/SCR-TRACE/notes.md', '# Notes');
    put('design/mockups/SCR-TRACE/spec.pdf', 'pdf');
    put('design/layouts/old/scr-trace.json', '{}');
    put('ui/helpers.js', 'export {}');
    put('ui/Fancy.svelte', COMPONENT);
    expect(errors(validateDesign(root))).toEqual([
      expect.stringMatching(
        /^design\/layouts\/old\/scr-trace\.json : not a design artifact/,
      ) as string,
      expect.stringMatching(
        /^design\/mockups\/SCR-TRACE\/spec\.pdf : not a design artifact/,
      ) as string,
      expect.stringMatching(/^design\/notes\.md : not a design artifact/) as string,
      expect.stringMatching(/^design\/notes\.txt : not a design artifact/) as string,
      expect.stringMatching(
        /^ui\/Fancy\.svelte : Fancy is not a contracts\/ui\.ts component/,
      ) as string,
      'ui/helpers.js : ui/ holds <Component>.svelte and their tests only',
    ]);
  });

  it('rejects symlinks in design/ and ui/', () => {
    mkdirSync(join(root, 'ui'), { recursive: true });
    symlinkSync('/etc/hosts', join(root, 'ui', 'BigButton.svelte'));
    expect(errors(validateDesign(root))).toEqual([
      'ui/BigButton.svelte : symlinks are not allowed in a lane: they can point into reference/ or recordings/',
    ]);
  });
});

describe('printReport', () => {
  it('prints one JSON line per issue and a summary, and returns the exit code', () => {
    const out: string[] = [];
    const err: string[] = [];
    const failing: Report = {
      lane: 'assets',
      files: 2,
      issues: [
        { severity: 'error', path: 'a', message: 'bad', file: 'assets/x.png' },
        { severity: 'warning', path: '', message: 'later', file: 'assets/manifest.json' },
      ],
    };
    const push = (to: string[]) => (l: string) => {
      to.push(l);
    };
    expect(printReport(failing, push(out), push(err))).toBe(1);
    expect(err.map((l) => JSON.parse(l) as unknown)).toEqual([
      {
        level: 'error',
        event: 'validate.issue',
        lane: 'assets',
        file: 'assets/x.png',
        path: 'a',
        message: 'bad',
      },
      {
        level: 'error',
        event: 'validate.failed',
        lane: 'assets',
        files: 2,
        errors: 1,
        warnings: 1,
      },
    ]);
    expect(JSON.parse(out[0] ?? '')).toMatchObject({ level: 'warn', message: 'later' });
    expect(printReport({ lane: 'design+ui', files: 0, issues: [] }, push(out), push(err))).toBe(0);
    expect(JSON.parse(out.at(-1) ?? '')).toEqual({
      level: 'info',
      event: 'validate.ok',
      lane: 'design+ui',
      files: 0,
      errors: 0,
      warnings: 0,
    });
  });
});
