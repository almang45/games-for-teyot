import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Stepper from './Stepper.svelte';

describe('Stepper', () => {
  it('increments and decrements within min/max bounds', async () => {
    const onchange = vi.fn();
    render(Stepper, {
      label: 'Durasi sesi',
      value: 10,
      min: 5,
      max: 20,
      step: 5,
      unit: 'menit',
      onchange,
    });
    expect(screen.getByText('10 menit')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Tambah Durasi sesi' }));
    expect(onchange).toHaveBeenCalledWith(15);
    await fireEvent.click(screen.getByRole('button', { name: 'Kurangi Durasi sesi' }));
    expect(onchange).toHaveBeenCalledWith(5);
  });

  it('disables decrement button at min', () => {
    render(Stepper, {
      label: 'Durasi sesi',
      value: 5,
      min: 5,
      max: 20,
      step: 5,
      onchange: vi.fn(),
    });
    expect(
      screen.getByRole('button', { name: 'Kurangi Durasi sesi' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
