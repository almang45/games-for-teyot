import { error, type Issue } from '../../contracts/common.ts';
import { UI_COMPONENTS, type UiComponent } from '../../contracts/ui.ts';

/**
 * `ui/` stays presentational (AGENTS.md, WORKFLOW.md §3): props in, events out, no reach into
 * `src/`, storage, the network or globals, and tokens instead of literal colours and sizes. ESLint
 * checks the code style; this checks the lane rules ESLint can't see. Imports are an allowlist, so
 * anything new (a store, a library) starts as a contract change rather than slipping through.
 */

/** Svelte modules a presentational component may use; `svelte/store` is shared state, so it's out. */
const ALLOWED_SVELTE = new Set([
  'svelte',
  'svelte/animate',
  'svelte/easing',
  'svelte/events',
  'svelte/motion',
  'svelte/reactivity',
  'svelte/transition',
]);
const SIBLING_COMPONENT = /^\.\/[A-Z][A-Za-z0-9]*\.svelte$/;
const UI_CONTRACT = /^\.\.\/contracts\/ui(?:\.ts)?$/;
const INTO_SRC = /^(?:\.\.?\/)+src(?:\/|$)/;

const FORBIDDEN_APIS: readonly (readonly [RegExp, string])[] = [
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\.cookie\b/, 'storage'],
  [/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/, 'network'],
  [
    /\bimport\.meta\.env\b|\bglobalThis\b|\bwindow\s*(?:\.[a-zA-Z_$][\w$]*|\[[^\]]*\])\s*=(?!=)/,
    'global state',
  ],
];

/** Absolute and protocol-relative URLs: ui/ ships no third-party requests (AGENTS.md). */
const REMOTE_URL =
  /\b(?:https?|wss?|ftp):\/\/[^\s'"`)]*|(?<![:\w/])\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}/i;

const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/;
/** Any non-zero length, negative ones too: sizes come from token CSS variables. `%`, `fr` are fine. */
const LITERAL_SIZE =
  /(?<![\w.-])-?(?:\d*\.)?\d*[1-9]\d*(?:px|rem|em|ex|ch|cap|ic|lh|rlh|vh|vw|vi|vb|vmin|vmax|[dsl]v[hwib]|[dsl]vmin|[dsl]vmax|cq[whib]|cqmin|cqmax|pt|pc|cm|mm|q|in)\b/i;

/** CSS named colours (CSS Color 4). `transparent` and `currentcolor` carry no hue, so they stay. */
const NAMED_COLOURS = new Set(
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(
    ' ',
  ),
);

/** The first bare word in a CSS value that names a colour; `var(--red)` and `red-ish` don't. */
function namedColour(value: string): string | undefined {
  for (const [word] of value.matchAll(/(?<![\w-])[a-z]+(?![\w-])/gi)) {
    if (NAMED_COLOURS.has(word.toLowerCase())) return word;
  }
  return undefined;
}

/** Blanks out `//` and block comments, leaving string literals (which may hold URLs) intact. */
export function stripJsComments(code: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i] ?? '';
    const next = code[i + 1] ?? '';
    if (quote) {
      out += c;
      if (c === '\\') {
        out += next;
        i++;
      } else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') {
      const end = code.indexOf('\n', i);
      i = end === -1 ? code.length : end - 1;
      out += ' ';
    } else if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 1;
      out += ' ';
    } else {
      if (c === '"' || c === "'" || c === '`') quote = c;
      out += c;
    }
  }
  return out;
}

const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

interface Parts {
  readonly scripts: readonly { readonly attrs: string; readonly code: string }[];
  readonly styles: readonly string[];
  /** Template markup, without script and style blocks or HTML comments. */
  readonly markup: string;
}

function split(source: string): Parts {
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({
    attrs: m[1] ?? '',
    code: stripJsComments(m[2] ?? ''),
  }));
  const styles = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) =>
    stripCssComments(m[1] ?? ''),
  );
  const markup = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return { scripts, styles, markup };
}

const IMPORT_FORMS = [
  /\bimport\s+(?:type\s+)?[^'";]*?\bfrom\s*(['"])([^'"]+)\1/g,
  /\bexport\s+(?:type\s+)?[^'";]*?\bfrom\s*(['"])([^'"]+)\1/g,
  /\bimport\s*(['"])([^'"]+)\1/g,
];

function importIssues(code: string): Issue[] {
  const issues: Issue[] = [];
  if (/\bimport\s*\(/.test(code)) {
    issues.push(error('imports', 'ui/ must not use dynamic import()'));
  }
  const specifiers = new Set(
    IMPORT_FORMS.flatMap((re) => [...code.matchAll(re)].map((m) => m[2] ?? '')),
  );
  for (const spec of specifiers) {
    if (INTO_SRC.test(spec))
      issues.push(error('imports', `${spec}: ui/ must not import from src/`));
    else if (
      !ALLOWED_SVELTE.has(spec) &&
      !SIBLING_COMPONENT.test(spec) &&
      !UI_CONTRACT.test(spec)
    ) {
      issues.push(
        error(
          'imports',
          `${spec}: ui/ imports only svelte, sibling ui/ components and contracts/ui.ts`,
        ),
      );
    }
  }
  return issues;
}

const UI_TYPE_IMPORT =
  /import\s+type\s*\{([^}]*)\}\s*from\s*['"](?:\.\.\/)+contracts\/ui(?:\.ts)?['"]/g;

/** Names brought in by `import type { … } from '../contracts/ui'`, before any `as` rename. */
function typeImportsFromUiContract(code: string): Set<string> {
  const names = [...code.matchAll(UI_TYPE_IMPORT)].flatMap((m) =>
    (m[1] ?? '').split(',').map((spec) => spec.trim().split(/\s+/)[0] ?? ''),
  );
  return new Set(names);
}

/** CSS a component writes, as declaration values: `<style>`, `style=` and `style:prop=`. */
function cssValues(parts: Parts): string[] {
  const declarations = (css: string): string[] =>
    [...css.matchAll(/[\w-]+\s*:\s*([^;{}]+)/g)].map((m) => m[1] ?? '');
  const quoted = (m: RegExpMatchArray, from: number): string =>
    m[from] ?? m[from + 1] ?? m[from + 2] ?? '';
  const attributes = [
    ...parts.markup.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g),
  ].flatMap((m) => [...declarations(m[1] ?? m[2] ?? ''), m[3] ?? '']);
  const directives = [
    ...parts.markup.matchAll(
      /\bstyle:[\w-]+(?:\|important)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g,
    ),
  ].map((m) => quoted(m, 1));
  return [...parts.styles.flatMap(declarations), ...attributes, ...directives];
}

function styleIssues(parts: Parts): Issue[] {
  const issues: Issue[] = [];
  if (parts.styles.some((css) => /@import\b/.test(css))) {
    issues.push(error('style', '@import: styles come from tokens, not other stylesheets'));
  }
  for (const value of cssValues(parts)) {
    const colour = LITERAL_COLOUR.exec(value)?.[0] ?? namedColour(value);
    if (colour) issues.push(error('style', `literal colour ${colour}: use a token variable`));
    const length = LITERAL_SIZE.exec(value)?.[0];
    if (length) issues.push(error('style', `literal size ${length}: use a token variable`));
  }
  return issues;
}

const componentName = (file: string): string =>
  file.slice(file.lastIndexOf('/') + 1).replace(/\.svelte$/, '');

/** Checks one `ui/<Name>.svelte` source. */
export function lintUiComponent(file: string, source: string): Issue[] {
  const name = componentName(file);
  if (!(UI_COMPONENTS as readonly string[]).includes(name)) {
    return [error('', `${name} is not a contracts/ui.ts component (${UI_COMPONENTS.join(', ')})`)];
  }
  const parts = split(source);
  const code = parts.scripts.map((s) => s.code).join('\n');
  const issues: Issue[] = [];
  const props = `${name as UiComponent}Props`;
  if (!typeImportsFromUiContract(code).has(props) || !code.includes('$props()')) {
    issues.push(error('props', `declare props as ${props} from contracts/ui.ts via $props()`));
  }
  if (parts.scripts.some((s) => /\bmodule\b|\bcontext\s*=\s*["']module["']/.test(s.attrs))) {
    issues.push(
      error('script', 'ui/ must not use <script module>: it is state shared by every instance'),
    );
  }
  issues.push(...importIssues(code));
  const behaviour = `${code}\n${parts.markup}`;
  for (const [pattern, what] of FORBIDDEN_APIS) {
    if (pattern.test(behaviour)) issues.push(error('script', `ui/ must not use ${what}`));
  }
  const remote = REMOTE_URL.exec(`${behaviour}\n${parts.styles.join('\n')}`)?.[0];
  if (remote)
    issues.push(error('remote', `remote URL ${remote}: ui/ ships no third-party requests`));
  issues.push(...styleIssues(parts));
  return issues;
}
