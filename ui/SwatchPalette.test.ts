import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SwatchPalette from './SwatchPalette.svelte';

describe('SwatchPalette', () => {
  it('renders all 6 named swatches and reports picked index', async () => {
    const onpick = vi.fn();
    render(SwatchPalette, { selected: 2, onpick });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'biru' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(screen.getByRole('button', { name: 'ungu' }));
    expect(onpick).toHaveBeenCalledWith(5);
  });
});
