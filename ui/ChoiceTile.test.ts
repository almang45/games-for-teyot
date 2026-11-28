import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ChoiceTile from './ChoiceTile.svelte';

describe('ChoiceTile', () => {
  it('renders text content and calls onpick', async () => {
    const onpick = vi.fn();
    render(ChoiceTile, {
      label: 'Tiga',
      content: { kind: 'text', text: '3' },
      state: 'idle',
      onpick,
    });
    const btn = screen.getByRole('button', { name: 'Tiga' });
    expect(btn.textContent.trim()).toBe('3');
    await fireEvent.click(btn);
    expect(onpick).toHaveBeenCalledOnce();
  });

  it('renders asset content slot and respects locked state', async () => {
    const onpick = vi.fn();
    render(ChoiceTile, {
      label: 'Tiga titik',
      content: { kind: 'asset', key: 'counting.dots.3' },
      state: 'locked',
      onpick,
    });
    const btn = screen.getByRole('button', { name: 'Tiga titik' });
    expect(btn.querySelector('[data-asset-key="counting.dots.3"]')).not.toBeNull();
    await fireEvent.click(btn);
    expect(onpick).not.toHaveBeenCalled();
  });
});
