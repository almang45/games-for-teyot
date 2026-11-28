import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Toggle from './Toggle.svelte';

describe('Toggle', () => {
  it('toggles checked state and emits onchange', async () => {
    const onchange = vi.fn();
    render(Toggle, { label: 'Buka T1', checked: false, onchange });
    const sw = screen.getByRole('switch', { name: 'Buka T1' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(sw);
    expect(onchange).toHaveBeenCalledWith(true);
  });

  it('ignores clicks when disabled', async () => {
    const onchange = vi.fn();
    render(Toggle, { label: 'Buka T1', checked: true, disabled: true, onchange });
    const sw = screen.getByRole('switch', { name: 'Buka T1' });
    await fireEvent.click(sw);
    expect(onchange).not.toHaveBeenCalled();
  });
});
