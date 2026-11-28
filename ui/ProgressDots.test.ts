import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProgressDots from './ProgressDots.svelte';

describe('ProgressDots', () => {
  it('renders total dots with done count filled', () => {
    const { container } = render(ProgressDots, { total: 3, done: 2 });
    const group = screen.getByRole('img', { name: '2 / 3' });
    expect(group.getAttribute('data-done')).toBe('2');
    expect(container.querySelectorAll('.dot')).toHaveLength(3);
    expect(container.querySelectorAll('.dot.filled')).toHaveLength(2);
  });
});
