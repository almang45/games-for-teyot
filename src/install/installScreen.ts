import type { Strings } from '../content/strings';
import { markActiveScene } from '../game/services';
import { BROWSER_OVERRIDE_PARAM, type InstallPlatform } from '../platform/launch';

/**
 * SCR-INSTALL placeholder (parent-facing, plain DOM). Antigravity's illustrated version replaces the
 * markup later; the copy stays in content/strings.id.json.
 */
export function renderInstallScreen(
  root: HTMLElement,
  platform: InstallPlatform,
  copy: Strings['install'],
  currentUrl: URL,
): void {
  const doc = root.ownerDocument;
  const section = doc.createElement('section');
  section.className = 'install';
  section.dataset.platform = platform;

  const title = doc.createElement('h1');
  title.textContent = copy.title;

  const lead = doc.createElement('p');
  lead.textContent = copy.lead;

  const steps = doc.createElement('ol');
  for (const step of copy.steps[platform]) {
    const item = doc.createElement('li');
    item.textContent = step;
    steps.append(item);
  }

  const warning = doc.createElement('p');
  warning.className = 'install__warning';
  warning.textContent = copy.browserWarning;

  const browserUrl = new URL(currentUrl);
  browserUrl.searchParams.set(BROWSER_OVERRIDE_PARAM, '1');
  const continueLink = doc.createElement('a');
  continueLink.className = 'install__continue';
  continueLink.href = browserUrl.pathname + browserUrl.search;
  continueLink.textContent = copy.continueInBrowser;

  section.append(title, lead, steps, warning, continueLink);
  root.replaceChildren(section);
  markActiveScene('Install');
}
