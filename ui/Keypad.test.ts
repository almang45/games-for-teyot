import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Keypad from './Keypad.svelte';

describe('Keypad', () => {
  it('displays the 3-digit prompt and forwards digit taps and cancel', async () => {
    const ondigit = vi.fn();
    const oncancel = vi.fn();
    render(Keypad, {
      prompt: [7, 2, 9],
      entered: [7],
      state: 'idle',
      ondigit,
      oncancel,
    });
    expect(screen.getByText('Ketuk 7, 2, 9')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(ondigit).toHaveBeenCalledWith(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(oncancel).toHaveBeenCalledOnce();
  });
});
