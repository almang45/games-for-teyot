import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FileImport from './FileImport.svelte';

describe('FileImport', () => {
  it('forwards selected file to onfile and renders status message', async () => {
    const onfile = vi.fn();
    render(FileImport, {
      label: 'Impor cadangan',
      accept: '.json',
      state: 'error',
      message: 'Berkas tidak dikenali.',
      onfile,
    });
    expect(screen.getByRole('alert').textContent.trim()).toBe('Berkas tidak dikenali.');
    const input = screen.getByLabelText('Impor cadangan');
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });
    await fireEvent.change(input, { target: { files: [file] } });
    expect(onfile).toHaveBeenCalledWith(file);
  });
});
