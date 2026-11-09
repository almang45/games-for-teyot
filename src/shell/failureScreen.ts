import { markActiveScene } from '../game/services';

/**
 * Inline, not in content/strings.id.json: this screen has to render when that file is what failed.
 */
export const FAILURE_COPY = {
  title: 'Ups, ada yang macet.',
  retry: 'Coba lagi',
} as const;

export const FAILURE_SCENE = 'Failure';

/**
 * PRD §7.5: Theia never sees a blank screen. Shown when boot or the game start fails; the big
 * button reloads the app, which is also what fixes a stale chunk after a deploy.
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
  retry.textContent = FAILURE_COPY.retry;
  retry.addEventListener('click', reload, { once: true });

  section.append(title, retry);
  root.replaceChildren(section);
  markActiveScene(FAILURE_SCENE);
}
