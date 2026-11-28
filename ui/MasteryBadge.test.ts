import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import MasteryBadge from './MasteryBadge.svelte';

describe('MasteryBadge', () => {
  it('renders 5 pips with box count filled', () => {
    const { container } = render(MasteryBadge, { box: 4, label: 'Garis tegak' });
    const badge = screen.getByRole('img', { name: 'Garis tegak: 4 / 5' });
    expect(badge.getAttribute('data-box')).toBe('4');
    expect(container.querySelectorAll('.pip')).toHaveLength(5);
    expect(container.querySelectorAll('.pip.filled')).toHaveLength(4);
  });
});
