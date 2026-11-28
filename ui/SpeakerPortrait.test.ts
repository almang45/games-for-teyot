import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SpeakerPortrait from './SpeakerPortrait.svelte';

describe('SpeakerPortrait', () => {
  it('maps talking mouth frames to #48 spritesheet indices', () => {
    render(SpeakerPortrait, { speaker: 'mama', mouth: 2, state: 'talking' });
    const el = screen.getByRole('img', { name: 'mama' });
    expect(el.getAttribute('data-frame')).toBe('4');
    expect(el.getAttribute('data-state')).toBe('talking');
  });

  it('hides from accessibility tree when state is hidden', () => {
    const { container } = render(SpeakerPortrait, { speaker: 'papa', mouth: 0, state: 'hidden' });
    const el = container.querySelector('.speaker-portrait');
    expect(el?.getAttribute('aria-hidden')).toBe('true');
    expect(el?.classList.contains('hidden')).toBe(true);
  });
});
