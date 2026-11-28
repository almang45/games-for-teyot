import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Slider from './Slider.svelte';

describe('Slider', () => {
  it('emits numeric value on input change', async () => {
    const onchange = vi.fn();
    render(Slider, { label: 'Toleransi', value: 3, min: 1, max: 5, step: 1, onchange });
    const input = screen.getByRole('slider', { name: 'Toleransi' });
    await fireEvent.input(input, { target: { value: '4' } });
    expect(onchange).toHaveBeenCalledWith(4);
  });
});
