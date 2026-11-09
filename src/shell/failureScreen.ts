import { markActiveScene } from '../game/services';

/**
 * Inline, not in content/strings.id.json: this screen has to render when that file is what failed.
 * The title is for a parent; Theia gets the icon button (NFR-UX-01: no text-only instructions).
 */
export const FAILURE_COPY = {
  title: 'Ups, ada yang macet.',
  retry: 'Coba lagi',
} as const;

export const FAILURE_SCENE = 'Failure';

const SVG_NS = 'http://www.w3.org/2000/svg';
// A circular "go again" arrow, drawn in code: no text and no image file to fail loading.
const RETRY_ICON_PATH =
  'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z';

function retryIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', RETRY_ICON_PATH);
  svg.append(path);
  return svg;
}

/**
 * PRD §7.5: Theia never sees a blank or frozen screen. Shown when boot, the game start, or the
 * running game fails. The caller reloads on its own after AUTO_RELOAD_DELAY_MS; the big button is
 * for a failure that survived that reload. A reload also fixes a stale chunk after a deploy.
 */
export function renderFailureScreen(root: HTMLElement, reload: () => void): void {
  const doc = root.ownerDocument;
  const section = doc.createElement('section');
  section.className = 'failure';
  section.setAttribute('role', 'alert');

  const title = doc.createElement('h1');
  title.textContent = FAILURE_COPY.title;

  const retry = doc.createElement('button');
  retry.type = 'button';
  retry.className = 'failure__retry';
  retry.setAttribute('aria-label', FAILURE_COPY.retry);
  retry.append(retryIcon(doc));
  retry.addEventListener('click', reload, { once: true });

  section.append(retry, title);
  root.replaceChildren(section);
  markActiveScene(FAILURE_SCENE);
}
