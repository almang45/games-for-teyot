import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Swatch from './Swatch.svelte';

describe('Swatch', () => {
  it('reflects selected state and triggers onpick', async () => {
    const onpick = vi.fn();
    render(Swatch, { label: 'merah', swatch: 0, selected: true, onpick });
    const btn = screen.getByRole('button', { name: 'merah' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('data-swatch')).toBe('0');
    await fireEvent.click(btn);
    expect(onpick).toHaveBeenCalledOnce();
  });
});
