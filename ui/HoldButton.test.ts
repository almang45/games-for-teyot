import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import HoldButton from './HoldButton.svelte';

describe('HoldButton', () => {
  it('fires onholdstart on pointerdown and onholdcancel on early release', async () => {
    const onholdstart = vi.fn();
    const onholdcancel = vi.fn();
    const oncomplete = vi.fn();
    render(HoldButton, {
      label: 'Pulang',
      icon: 'ui.home',
      holdMs: 1000,
      progress: 0.4,
      quiet: false,
      onholdstart,
      onholdcancel,
      oncomplete,
    });
    const btn = screen.getByRole('button', { name: 'Pulang' });
    await fireEvent.pointerDown(btn);
    expect(onholdstart).toHaveBeenCalledOnce();
    await fireEvent.pointerUp(btn);
    expect(onholdcancel).toHaveBeenCalledOnce();
    expect(oncomplete).not.toHaveBeenCalled();
  });

  it('fires oncomplete when released at full progress', async () => {
    const onholdstart = vi.fn();
    const onholdcancel = vi.fn();
    const oncomplete = vi.fn();
    render(HoldButton, {
      label: 'Orang tua',
      icon: 'ui.parent',
      holdMs: 1000,
      progress: 1,
      quiet: true,
      onholdstart,
      onholdcancel,
      oncomplete,
    });
    const btn = screen.getByRole('button', { name: 'Orang tua' });
    expect(btn.getAttribute('data-quiet')).toBe('true');
    await fireEvent.pointerUp(btn);
    expect(oncomplete).toHaveBeenCalledOnce();
  });
});
