// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAILURE_COPY, FAILURE_SCENE, renderFailureScreen } from '../../src/shell/failureScreen';

describe('failure screen (PRD §7.5: never a blank screen)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"><canvas></canvas></main>';
    const app = document.getElementById('app');
    if (!app) throw new Error('fixture missing #app');
    root = app;
  });

  it('replaces the root with a retry screen and marks the scene', () => {
    renderFailureScreen(root, () => undefined);
    expect(root.querySelector('canvas')).toBeNull();
    expect(root.querySelector('[role="alert"] h1')?.textContent).toBe(FAILURE_COPY.title);
    expect(document.body.dataset.scene).toBe(FAILURE_SCENE);
  });

  it('reloads once when the retry button is tapped', () => {
    const reload = vi.fn();
    renderFailureScreen(root, reload);
    const button = root.querySelector<HTMLButtonElement>('button.failure__retry');
    expect(button?.textContent).toBe(FAILURE_COPY.retry);
    button?.click();
    button?.click();
    expect(reload).toHaveBeenCalledOnce();
  });
});
