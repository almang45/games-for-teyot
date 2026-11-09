// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { getStrings } from '../../src/content/strings';

const strings = getStrings();
import { renderInstallScreen } from '../../src/install/installScreen';

describe('SCR-INSTALL (US-OFF-01)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    const app = document.getElementById('app');
    if (!app) throw new Error('fixture missing #app');
    root = app;
  });

  it('renders the steps for the detected platform', () => {
    renderInstallScreen(root, 'android', strings.install, new URL('https://rct.amns.my.id/'));
    const steps = [...root.querySelectorAll('li')].map((li) => li.textContent);
    expect(steps).toEqual(strings.install.steps.android);
    expect(root.querySelector('h1')?.textContent).toBe(strings.install.title);
    expect(document.body.dataset.scene).toBe('Install');
  });

  it('links "Lanjut di browser" to the same page with the override, keeping other params', () => {
    renderInstallScreen(root, 'safari-mac', strings.install, new URL('https://x.test/?a=1'));
    const link = root.querySelector<HTMLAnchorElement>('a.install__continue');
    expect(link?.getAttribute('href')).toBe('/?a=1&browser=1');
  });

  it('replaces whatever was in the root', () => {
    root.innerHTML = '<p>old</p>';
    renderInstallScreen(root, 'other', strings.install, new URL('https://x.test/'));
    expect(root.textContent).not.toContain('old');
  });
});
