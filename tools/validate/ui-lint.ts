import { error, type Issue } from '../../contracts/common.ts';
import { UI_COMPONENTS, type UiComponent } from '../../contracts/ui.ts';

/**
 * `ui/` stays presentational (AGENTS.md, WORKFLOW.md §3): props in, events out, no reach into
 * `src/`, storage, the network or globals, and tokens instead of literal colours and sizes. ESLint
 * checks the code style; this checks the lane rules ESLint can't see.
 */
const FORBIDDEN_APIS: readonly (readonly [RegExp, string])[] = [
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\.cookie\b/, 'storage'],
  [/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/, 'network'],
  [/\bimport\.meta\.env\b|\bglobalThis\b|\bwindow\.[a-zA-Z_$]+\s*=/, 'global state'],
];

const FROM_SRC = /\bfrom\s+['"](?:\.\.\/)+src\//;

const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\(/;
/** Any non-zero length: sizes come from token CSS variables. Percentages and unitless are fine. */
const LITERAL_SIZE = /(?<![\w.-])(?:\d*\.)?\d*[1-9]\d*(?:px|rem|em|vh|vw|vmin|vmax|pt|cm|mm|in)\b/;

/** The CSS a component writes: `<style>` blocks and inline `style="…"` attributes. */
function styles(source: string): string[] {
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');
  const inline = [...source.matchAll(/\bstyle(?::[\w-]+)?\s*=\s*"([^"]*)"/g)].map(
    (m) => m[1] ?? '',
  );
  return [...blocks, ...inline];
}

const UI_TYPE_IMPORT =
  /import\s+type\s*\{([^}]*)\}\s*from\s*['"](?:\.\.\/)+contracts\/ui(?:\.ts)?['"]/g;

/** Names brought in by `import type { … } from '../contracts/ui'`, before any `as` rename. */
function typeImportsFromUiContract(source: string): Set<string> {
  const names = [...source.matchAll(UI_TYPE_IMPORT)].flatMap((m) =>
    (m[1] ?? '').split(',').map((spec) => spec.trim().split(/\s+/)[0] ?? ''),
  );
  return new Set(names);
}

const componentName = (file: string): string =>
  file.slice(file.lastIndexOf('/') + 1).replace(/\.svelte$/, '');

/** Checks one `ui/<Name>.svelte` source. */
export function lintUiComponent(file: string, source: string): Issue[] {
  const name = componentName(file);
  if (!(UI_COMPONENTS as readonly string[]).includes(name)) {
    return [error('', `${name} is not a contracts/ui.ts component (${UI_COMPONENTS.join(', ')})`)];
  }
  const issues: Issue[] = [];
  const props = `${name as UiComponent}Props`;
  if (!typeImportsFromUiContract(source).has(props) || !source.includes('$props()')) {
    issues.push(error('props', `declare props as ${props} from contracts/ui.ts via $props()`));
  }
  if (FROM_SRC.test(source)) issues.push(error('imports', 'ui/ must not import from src/'));
  for (const [pattern, what] of FORBIDDEN_APIS) {
    if (pattern.test(source)) issues.push(error('script', `ui/ must not use ${what}`));
  }
  for (const css of styles(source)) {
    const colour = LITERAL_COLOUR.exec(css)?.[0];
    if (colour) issues.push(error('style', `literal colour ${colour}: use a token variable`));
    const length = LITERAL_SIZE.exec(css)?.[0];
    if (length) issues.push(error('style', `literal size ${length}: use a token variable`));
  }
  return issues;
}
