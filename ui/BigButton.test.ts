import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import BigButton from './BigButton.svelte';

describe('BigButton', () => {
  it('renders an icon-only button with accessible label and calls onpress', async () => {
    const onpress = vi.fn();
    render(BigButton, {
      label: 'Mulai',
      icon: 'ui.play',
      size: 'boot',
      state: 'idle',
      onpress,
    });
    const btn = screen.getByRole('button', { name: 'Mulai' });
    expect(btn.textContent.trim()).toBe('');
    expect(btn.getAttribute('data-size')).toBe('boot');
    await fireEvent.click(btn);
    expect(onpress).toHaveBeenCalledOnce();
  });

  it('disables interaction in locked state', async () => {
    const onpress = vi.fn();
    render(BigButton, {
      label: 'Ulangi',
      icon: 'ui.undo',
      size: 'primary',
      state: 'locked',
      onpress,
    });
    const btn = screen.getByRole('button', { name: 'Ulangi' });
    expect(btn.hasAttribute('disabled')).toBe(true);
    await fireEvent.click(btn);
    expect(onpress).not.toHaveBeenCalled();
  });
});
