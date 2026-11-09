import { parse } from 'svelte/compiler';
import { error, type Issue } from '../../contracts/common.ts';
import { UI_COMPONENTS, type UiComponent } from '../../contracts/ui.ts';

/**
 * `ui/` stays presentational (AGENTS.md, WORKFLOW.md §3): props in, events out, no reach into
 * `src/`, storage, the network or browser globals, and tokens instead of literal colours and
 * sizes. ESLint checks the code style; this checks the lane rules ESLint can't see. It reads the
 * Svelte compiler's AST, so comments, strings, regex literals and selectors are never mistaken
 * for one another. Imports are an allowlist, so anything new (a store, a library) starts as a
 * contract change rather than slipping through.
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
/** Runtime functions from `svelte` itself; context (getContext, setContext…) reaches shared state. */
const SVELTE_RUNTIME = new Set(['onMount', 'onDestroy', 'tick', 'untrack', 'flushSync']);
const SIBLING_COMPONENT = /^\.\/[A-Z][A-Za-z0-9]*\.svelte$/;
const UI_CONTRACT = /^\.\.\/contracts\/ui(?:\.ts)?$/;
const INTO_SRC = /^(?:\.\.?\/)+src(?:\/|$)/;

const GLOBALS_HINT = 'use props, events, <svelte:window> or svelte/reactivity';

/** Globals a component must not reach, by what they are. A name the component declares is its own. */
const FORBIDDEN_GLOBALS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    storage: ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore'],
    network: [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'WebTransport',
      'EventSource',
      'RTCPeerConnection',
    ],
    workers: ['Worker', 'SharedWorker'],
    'dynamic code': ['eval', 'Function'],
    [`browser globals (${GLOBALS_HINT})`]: [
      'window',
      'self',
      'globalThis',
      'document',
      'navigator',
      'location',
      'history',
      'top',
      'parent',
      'frames',
      'opener',
      'open',
    ],
  }).flatMap(([what, names]) => names.map((name): [string, string] => [name, what])),
);

/** Absolute and protocol-relative URLs: ui/ ships no third-party requests (AGENTS.md). */
const REMOTE_URL =
  /\b(?:https?|wss?|ftp):\/\/[^\s'"`)]*|(?<![:\w/])\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}/gi;

/** XML namespace names look like URLs but are never fetched (inline SVG carries them). */
const NAMESPACES = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/2000/xmlns/',
]);

const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/;
/** Any non-zero length, negative ones too: sizes come from token CSS variables. `%`, `fr` are fine. */
const LITERAL_SIZE =
  /(?<![\w.-])-?(?:\d*\.)?\d*[1-9]\d*(?:px|rem|em|ex|ch|cap|ic|lh|rlh|vh|vw|vi|vb|vmin|vmax|[dsl]v[hwib]|[dsl]vmin|[dsl]vmax|cq[whib]|cqmin|cqmax|pt|pc|cm|mm|q|in)\b/i;
/** `url(#clip)` names a fragment, not a colour. */
const URL_FUNCTION = /url\([^)]*\)/gi;

/** CSS named colours (CSS Color 4). `transparent` and `currentcolor` carry no hue, so they stay. */
const NAMED_COLOURS = new Set(
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(
    ' ',
  ),
);

/** A node of the Svelte AST: template, CSS and the ESTree of the scripts. */
interface Node {
  readonly type: string;
  readonly [key: string]: unknown;
}

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';

const asNode = (v: unknown): Node | undefined => (isNode(v) ? v : undefined);
const nodes = (v: unknown): Node[] => (Array.isArray(v) ? v.filter(isNode) : [v].filter(isNode));
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Type annotations are erased at build time; comments are not code. */
const SKIPPED_KEYS = new Set([
  'loc',
  'metadata',
  'leadingComments',
  'trailingComments',
  'typeAnnotation',
  'returnType',
  'typeParameters',
  'typeArguments',
  'superTypeParameters',
  'implements',
]);

function children(node: Node): [string, Node][] {
  // TS wrappers (`x as T`, `x!`, `x satisfies T`) keep their runtime value under `expression`.
  const keys = node.type.startsWith('TS') ? ['expression'] : Object.keys(node);
  return keys
    .filter((key) => !SKIPPED_KEYS.has(key))
    .flatMap((key) => nodes(node[key]).map((child): [string, Node] => [key, child]));
}

type Visit = (node: Node, parent: Node | undefined, key: string) => void;

function walk(node: Node, visit: Visit, parent?: Node, key = ''): void {
  visit(node, parent, key);
  for (const [k, child] of children(node)) walk(child, visit, node, k);
}

/** Names a destructuring or parameter pattern binds. */
function patternNames(pattern: Node | undefined): string[] {
  switch (pattern?.type) {
    case 'Identifier':
      return [text(pattern.name)];
    case 'ObjectPattern':
      return nodes(pattern.properties).flatMap((p) =>
        patternNames(p.type === 'RestElement' ? asNode(p.argument) : asNode(p.value)),
      );
    case 'ArrayPattern':
      return nodes(pattern.elements).flatMap(patternNames);
    case 'AssignmentPattern':
      return patternNames(asNode(pattern.left));
    case 'RestElement':
      return patternNames(asNode(pattern.argument));
    default:
      return [];
  }
}

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function bindingsOf(node: Node): string[] {
  if (node.type === 'VariableDeclarator') return patternNames(asNode(node.id));
  if (FUNCTIONS.has(node.type))
    return [...patternNames(asNode(node.id)), ...nodes(node.params).flatMap(patternNames)];
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression')
    return patternNames(asNode(node.id));
  if (node.type === 'CatchClause') return patternNames(asNode(node.param));
  if (node.type.startsWith('Import') && node.type.endsWith('Specifier'))
    return patternNames(asNode(node.local));
  if (node.type === 'EachBlock') return patternNames(asNode(node.context));
  if (node.type === 'AwaitBlock')
    return [...patternNames(asNode(node.value)), ...patternNames(asNode(node.error))];
  if (node.type === 'SnippetBlock')
    return [
      ...patternNames(asNode(node.expression)),
      ...nodes(node.parameters).flatMap(patternNames),
    ];
  return [];
}

/** Whether an Identifier reads a variable, rather than naming a property, key, label or import. */
function isReference(parent: Node | undefined, key: string): boolean {
  if (!parent) return true;
  const computed = parent.computed === true;
  switch (parent.type) {
    case 'MemberExpression':
      return key !== 'property' || computed;
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
      return key !== 'key' || computed;
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'MetaProperty':
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'ExportSpecifier':
      return false;
    default:
      return true;
  }
}

/** String values in an expression: literals and the fixed parts of template literals. */
function stringsIn(expression: Node): string[] {
  const found: string[] = [];
  walk(expression, (node) => {
    if (node.type === 'Literal' && typeof node.value === 'string') found.push(node.value);
    if (node.type === 'TemplateElement') {
      const value = node.value as { cooked?: unknown; raw?: unknown } | undefined;
      found.push(text(value?.cooked ?? value?.raw));
    }
  });
  return found;
}

/** The values of `prop: value; …` declarations; a bare value (no colon) stands for itself. */
const declarationValues = (css: string): string[] =>
  css.includes(':')
    ? css
        .split(';')
        .filter((d) => d.includes(':'))
        .map((d) => d.slice(d.indexOf(':') + 1))
    : [css];

/** CSS values from a `style="…"` attribute or a `style:prop=…` directive. */
function inlineCss(value: unknown, declarations: boolean): string[] {
  return nodes(value).flatMap((part) => {
    if (part.type === 'Text')
      return declarations ? declarationValues(text(part.data)) : [text(part.data)];
    const expression = asNode(part.expression);
    if (!expression) return [];
    return stringsIn(expression).flatMap((s) => (declarations ? declarationValues(s) : [s]));
  });
}

/** The first bare word in a CSS value that names a colour; `var(--red)` and `red-ish` don't. */
function namedColour(value: string): string | undefined {
  for (const [word] of value.matchAll(/(?<![\w-])[a-z]+(?![\w-])/gi)) {
    if (NAMED_COLOURS.has(word.toLowerCase())) return word;
  }
  return undefined;
}

function cssValueIssues(value: string): Issue[] {
  const plain = value.replace(URL_FUNCTION, ' ');
  const issues: Issue[] = [];
  const colour = LITERAL_COLOUR.exec(plain)?.[0] ?? namedColour(plain);
  if (colour) issues.push(error('style', `literal colour ${colour}: use a token variable`));
  const length = LITERAL_SIZE.exec(plain)?.[0];
  if (length) issues.push(error('style', `literal size ${length}: use a token variable`));
  return issues;
}

const remoteUrls = (s: string): string[] =>
  [...s.matchAll(REMOTE_URL)].map((m) => m[0]).filter((url) => !NAMESPACES.has(url));

const remoteIssues = (s: string): Issue[] =>
  remoteUrls(s).map((url) =>
    error('remote', `remote URL ${url}: ui/ ships no third-party requests`),
  );

/** One component's findings, by kind, so the report reads the same whatever the source order. */
interface Findings {
  readonly imports: Issue[];
  readonly script: Issue[];
  readonly remote: Issue[];
  readonly style: Issue[];
}

const importSource = (node: Node): string | undefined => {
  if (!['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type))
    return undefined;
  const source = asNode(node.source)?.value;
  return typeof source === 'string' ? source : undefined;
};

const isTypeOnly = (node: Node): boolean =>
  node.importKind === 'type' || node.exportKind === 'type';

function svelteImportIssues(declaration: Node): Issue[] {
  if (declaration.type !== 'ImportDeclaration' || isTypeOnly(declaration)) return [];
  return nodes(declaration.specifiers).flatMap((spec) => {
    if (spec.type !== 'ImportSpecifier')
      return [error('imports', 'svelte: import its functions by name')];
    const name = text(asNode(spec.imported)?.name);
    return isTypeOnly(spec) || SVELTE_RUNTIME.has(name)
      ? []
      : [
          error(
            'imports',
            `${name} from svelte: ui/ uses only ${[...SVELTE_RUNTIME].join(', ')} (context is shared state)`,
          ),
        ];
  });
}

function importIssues(node: Node, spec: string): Issue[] {
  if (INTO_SRC.test(spec)) return [error('imports', `${spec}: ui/ must not import from src/`)];
  if (spec === 'svelte') return svelteImportIssues(node);
  if (ALLOWED_SVELTE.has(spec) || SIBLING_COMPONENT.test(spec) || UI_CONTRACT.test(spec)) return [];
  return [
    error(
      'imports',
      `${spec}: ui/ imports only svelte, sibling ui/ components and contracts/ui.ts`,
    ),
  ];
}

const isNamespaceAttribute = (name: string): boolean =>
  name === 'xmlns' || name.startsWith('xmlns:');

function attributeFindings(node: Node, found: Findings): void {
  const name = text(node.name);
  if (node.type === 'StyleDirective') {
    for (const v of inlineCss(node.value, false)) found.style.push(...cssValueIssues(v));
    return;
  }
  if (isNamespaceAttribute(name)) return;
  for (const part of nodes(node.value))
    if (part.type === 'Text') found.remote.push(...remoteIssues(text(part.data)));
  if (name === 'style') {
    for (const v of inlineCss(node.value, true)) found.style.push(...cssValueIssues(v));
  }
}

function cssFindings(node: Node, found: Findings): void {
  if (node.type === 'Declaration') {
    const value = text(node.value);
    found.remote.push(...remoteIssues(value));
    found.style.push(...cssValueIssues(value));
    return;
  }
  found.remote.push(...remoteIssues(text(node.prelude)));
  if (node.name === 'import') {
    found.style.push(error('style', '@import: styles come from tokens, not other stylesheets'));
  }
}

function codeFindings(
  node: Node,
  parent: Node | undefined,
  key: string,
  bound: ReadonlySet<string>,
  found: Findings,
): void {
  if (node.type === 'Identifier' && isReference(parent, key)) {
    const name = text(node.name);
    const what = FORBIDDEN_GLOBALS.get(name);
    if (what && !bound.has(name))
      found.script.push(error('script', `ui/ must not use ${what}: ${name}`));
  } else if (node.type === 'Literal' && typeof node.value === 'string' && key !== 'source') {
    found.remote.push(...remoteIssues(node.value));
  } else if (node.type === 'TemplateElement') {
    found.remote.push(...stringsIn(node).flatMap(remoteIssues));
  } else if (node.type === 'ImportExpression') {
    found.imports.push(error('imports', 'ui/ must not use dynamic import()'));
  } else if (node.type === 'MetaProperty' && asNode(node.meta)?.name === 'import') {
    found.script.push(
      error('script', 'ui/ must not use import.meta: files and settings come in as props'),
    );
  } else if (node.type === 'HtmlTag') {
    found.script.push(
      error('script', 'ui/ must not use {@html}: write the markup out, so it can be checked'),
    );
  }
}

const ATTRIBUTES = new Set(['Attribute', 'StyleDirective']);
const CSS_NODES = new Set(['Declaration', 'Atrule']);

function findings(root: Node): Findings {
  const bound = new Set<string>();
  walk(root, (node) => {
    for (const name of bindingsOf(node)) bound.add(name);
  });
  const found: Findings = { imports: [], script: [], remote: [], style: [] };
  walk(root, (node, parent, key) => {
    const spec = importSource(node);
    if (spec !== undefined) found.imports.push(...importIssues(node, spec));
    else if (ATTRIBUTES.has(node.type)) attributeFindings(node, found);
    else if (CSS_NODES.has(node.type)) cssFindings(node, found);
    else codeFindings(node, parent, key, bound, found);
  });
  return found;
}

/** Whether the instance script takes `<Name>Props` from the ui contract and reads `$props()`. */
function declaresContractProps(instance: Node | undefined, props: string): boolean {
  if (!instance) return false;
  const seen = { imported: false, called: false };
  walk(instance, (node) => {
    if (node.type === 'ImportDeclaration' && UI_CONTRACT.test(importSource(node) ?? '')) {
      seen.imported ||= nodes(node.specifiers).some(
        (s) => (isTypeOnly(node) || isTypeOnly(s)) && asNode(s.imported)?.name === props,
      );
    }
    if (node.type === 'CallExpression' && asNode(node.callee)?.name === '$props') {
      seen.called = true;
    }
  });
  return seen.imported && seen.called;
}

const componentName = (file: string): string =>
  file.slice(file.lastIndexOf('/') + 1).replace(/\.svelte$/, '');

/** The same finding repeated (one global read twice) is reported once. */
const unique = (issues: Issue[]): Issue[] => [
  ...new Map(issues.map((i) => [i.message, i])).values(),
];

/** Checks one `ui/<Name>.svelte` source. */
export function lintUiComponent(file: string, source: string): Issue[] {
  const name = componentName(file);
  if (!(UI_COMPONENTS as readonly string[]).includes(name)) {
    return [error('', `${name} is not a contracts/ui.ts component (${UI_COMPONENTS.join(', ')})`)];
  }
  let root: Node;
  try {
    root = parse(source, { modern: true }) as unknown as Node;
  } catch (err) {
    return [error('', `does not parse: ${err instanceof Error ? err.message : String(err)}`)];
  }
  const issues: Issue[] = [];
  const props = `${name as UiComponent}Props`;
  if (!declaresContractProps(asNode(asNode(root.instance)?.content), props)) {
    issues.push(error('props', `declare props as ${props} from contracts/ui.ts via $props()`));
  }
  if (root.module) {
    issues.push(
      error('script', 'ui/ must not use <script module>: it is state shared by every instance'),
    );
  }
  const found = findings(root);
  issues.push(...found.imports, ...found.script, ...found.remote, ...found.style);
  return unique(issues);
}
