import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SegmentedControl from './SegmentedControl.svelte';

describe('SegmentedControl', () => {
  it('marks selected option and emits new value on click', async () => {
    const onchange = vi.fn();
    render(SegmentedControl, {
      label: 'Suara',
      options: [
        { value: 'mama', label: 'Mama' },
        { value: 'papa', label: 'Papa' },
        { value: 'alt', label: 'Bergantian' },
      ],
      value: 'mama',
      onchange,
    });
    expect(screen.getByRole('radio', { name: 'Mama' }).getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(screen.getByRole('radio', { name: 'Papa' }));
    expect(onchange).toHaveBeenCalledWith('papa');
  });
});
