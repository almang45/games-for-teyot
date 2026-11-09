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

/**
 * Globals a component must not reach, by what they are. The component may not declare these
 * names either, so a use of one is always the global: no scope analysis to get wrong.
 */
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

/** The Identifier nodes a destructuring or parameter pattern binds. */
function patternIds(pattern: Node | undefined): Node[] {
  switch (pattern?.type) {
    case 'Identifier':
      return [pattern];
    case 'ObjectPattern':
      return nodes(pattern.properties).flatMap((p) =>
        patternIds(p.type === 'RestElement' ? asNode(p.argument) : asNode(p.value)),
      );
    case 'ArrayPattern':
      return nodes(pattern.elements).flatMap(patternIds);
    case 'AssignmentPattern':
      return patternIds(asNode(pattern.left));
    case 'RestElement':
      return patternIds(asNode(pattern.argument));
    default:
      return [];
  }
}

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const CLASSES = new Set(['ClassDeclaration', 'ClassExpression']);

/** The names `node` declares, as Identifier nodes; `{#each}` indexes are plain strings. */
function declaredIds(node: Node): Node[] {
  if (node.type === 'VariableDeclarator') return patternIds(asNode(node.id));
  if (FUNCTIONS.has(node.type))
    return [...patternIds(asNode(node.id)), ...nodes(node.params).flatMap(patternIds)];
  if (CLASSES.has(node.type)) return patternIds(asNode(node.id));
  if (node.type === 'CatchClause') return patternIds(asNode(node.param));
  if (node.type.startsWith('Import') && node.type.endsWith('Specifier'))
    return patternIds(asNode(node.local));
  if (node.type === 'EachBlock') return patternIds(asNode(node.context));
  if (node.type === 'AwaitBlock')
    return [...patternIds(asNode(node.value)), ...patternIds(asNode(node.error))];
  if (node.type === 'SnippetBlock')
    return [...patternIds(asNode(node.expression)), ...nodes(node.parameters).flatMap(patternIds)];
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

const IMPORT_FORMS = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
]);

const importSource = (node: Node): string | undefined => {
  if (!IMPORT_FORMS.has(node.type)) return undefined;
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

/**
 * Elements that run or pull in what the checks can't read: a nested `<script>` or `<style>` is
 * plain text to the parser, the others load other documents or stylesheets.
 */
const FOREIGN_ELEMENTS: ReadonlyMap<string, string> = new Map([
  ['script', 'code goes in the component <script>'],
  ['style', 'styles go in the component <style>'],
  ['link', 'styles come from tokens'],
  ['iframe', 'ui/ shows its own markup only'],
  ['object', 'ui/ shows its own markup only'],
  ['embed', 'ui/ shows its own markup only'],
]);

/** TypeScript that emits code; ui/ uses TypeScript for types only, which the checks skip. */
const RUNTIME_TS: ReadonlyMap<string, string> = new Map([
  ['TSEnumDeclaration', 'enum'],
  ['TSModuleDeclaration', 'namespace'],
  ['TSParameterProperty', 'parameter properties'],
  ['TSExportAssignment', 'export ='],
  ['TSImportEqualsDeclaration', 'import ='],
]);

const isNamespaceAttribute = (name: string): boolean =>
  name === 'xmlns' || name.startsWith('xmlns:');

/** One component's findings, by kind, so the report reads the same whatever the source order. */
class Findings {
  readonly imports: Issue[] = [];
  readonly script: Issue[] = [];
  readonly markup: Issue[] = [];
  readonly remote: Issue[] = [];
  readonly style: Issue[] = [];
  /** Identifier nodes that declare a name, so they aren't also read as uses of a global. */
  readonly declarations = new WeakSet<Node>();
  /** Set while walking the instance script: only it can take and read the props. */
  inInstance = false;
  private importsContractProps = false;
  private callsProps = false;

  constructor(private readonly props: string) {}

  visit(node: Node, parent: Node | undefined, key: string): void {
    this.declare(node);
    const spec = importSource(node);
    if (spec !== undefined) this.importDeclaration(node, spec);
    else if (node.type === 'Attribute') this.attribute(node);
    else if (node.type === 'StyleDirective') this.styleDirective(node);
    else if (node.type === 'Declaration' || node.type === 'Atrule') this.css(node);
    else if (node.type === 'RegularElement' || node.type === 'SvelteElement') this.element(node);
    else this.code(node, parent, key);
  }

  issues(hasModuleScript: boolean): Issue[] {
    const lead: Issue[] = [];
    if (!this.importsContractProps || !this.callsProps) {
      lead.push(error('props', `declare props as ${this.props} from contracts/ui.ts via $props()`));
    }
    if (hasModuleScript) {
      lead.push(
        error('script', 'ui/ must not use <script module>: it is state shared by every instance'),
      );
    }
    return [
      ...lead,
      ...this.imports,
      ...this.script,
      ...this.markup,
      ...this.remote,
      ...this.style,
    ];
  }

  /** A name of the component's own that reads like a browser global hides which one is meant. */
  private declare(node: Node): void {
    const names = declaredIds(node).map((id) => {
      this.declarations.add(id);
      return text(id.name);
    });
    if (node.type === 'EachBlock' && typeof node.index === 'string') names.push(node.index);
    for (const name of names.filter((n) => FORBIDDEN_GLOBALS.has(n))) {
      this.script.push(
        error(
          'script',
          `${name} is a browser global: give yours another name (a prop: { ${name}: other })`,
        ),
      );
    }
  }

  private importDeclaration(node: Node, spec: string): void {
    this.imports.push(...importIssues(node, spec));
    if (this.inInstance && node.type === 'ImportDeclaration' && UI_CONTRACT.test(spec)) {
      this.importsContractProps ||= nodes(node.specifiers).some(
        (s) => (isTypeOnly(node) || isTypeOnly(s)) && asNode(s.imported)?.name === this.props,
      );
    }
  }

  private attribute(node: Node): void {
    const name = text(node.name);
    if (isNamespaceAttribute(name)) return;
    const texts = nodes(node.value).filter((part) => part.type === 'Text');
    for (const part of texts) {
      const value = text(part.data);
      this.remote.push(...remoteIssues(value));
      if (/^\s*javascript:/i.test(value)) {
        this.markup.push(error('markup', `${name}="javascript:…": handle it with an event prop`));
      }
    }
    // A quoted handler is code the browser runs from a string, out of sight of every check.
    if (/^on/i.test(name) && texts.length > 0) {
      this.markup.push(error('markup', `${name}="…": write handlers as ${name}={…}`));
    }
    if (name === 'style') {
      for (const v of inlineCss(node.value, true)) this.style.push(...cssValueIssues(v));
    }
  }

  private styleDirective(node: Node): void {
    for (const v of inlineCss(node.value, false)) this.style.push(...cssValueIssues(v));
  }

  private css(node: Node): void {
    if (node.type === 'Declaration') {
      const value = text(node.value);
      this.remote.push(...remoteIssues(value));
      this.style.push(...cssValueIssues(value));
      return;
    }
    this.remote.push(...remoteIssues(text(node.prelude)));
    if (node.name === 'import') {
      this.style.push(error('style', '@import: styles come from tokens, not other stylesheets'));
    }
  }

  private element(node: Node): void {
    const tag = node.type === 'SvelteElement' ? asNode(node.tag)?.value : node.name;
    if (typeof tag !== 'string') {
      this.markup.push(error('markup', '<svelte:element> needs a fixed tag, so it can be checked'));
      return;
    }
    const why = FOREIGN_ELEMENTS.get(tag.toLowerCase());
    if (why) this.markup.push(error('markup', `ui/ must not render <${tag}>: ${why}`));
  }

  private code(node: Node, parent: Node | undefined, key: string): void {
    const runtimeTs = RUNTIME_TS.get(node.type);
    if (runtimeTs) {
      this.script.push(error('script', `ui/ uses TypeScript for types only: no ${runtimeTs}`));
    } else if (node.type === 'Identifier') {
      this.identifier(node, parent, key);
    } else if (node.type === 'Literal' && typeof node.value === 'string' && key !== 'source') {
      this.remote.push(...remoteIssues(node.value));
    } else if (node.type === 'TemplateElement') {
      this.remote.push(...stringsIn(node).flatMap(remoteIssues));
    } else if (node.type === 'ImportExpression') {
      this.imports.push(error('imports', 'ui/ must not use dynamic import()'));
    } else if (node.type === 'MetaProperty' && asNode(node.meta)?.name === 'import') {
      this.script.push(
        error('script', 'ui/ must not use import.meta: files and settings come in as props'),
      );
    } else if (node.type === 'HtmlTag') {
      this.markup.push(
        error('markup', 'ui/ must not use {@html}: write the markup out, so it can be checked'),
      );
    } else if (node.type === 'CallExpression' && asNode(node.callee)?.name === '$props') {
      this.callsProps ||= this.inInstance;
    }
  }

  private identifier(node: Node, parent: Node | undefined, key: string): void {
    if (this.declarations.has(node) || !isReference(parent, key)) return;
    const name = text(node.name);
    const what = FORBIDDEN_GLOBALS.get(name);
    if (what) this.script.push(error('script', `ui/ must not use ${what}: ${name}`));
  }
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
  const found = new Findings(`${name as UiComponent}Props`);
  // One pass over the whole file, part by part, so the instance script is known as such.
  for (const [key, part] of children(root)) {
    found.inInstance = key === 'instance';
    walk(
      part,
      (node, parent, at) => {
        found.visit(node, parent, at);
      },
      root,
      key,
    );
  }
  return unique(found.issues(root.module !== null && root.module !== undefined));
}
