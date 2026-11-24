import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Hand } from './Hand';

describe('Hand', () => {
  it('renders cards as buttons with wild/cutter badges', () => {
    const onSelect = vi.fn();
    render(
      <Hand
        hand={['TH', 'JD', 'JS', '2C']}
        selected={1}
        dead={[false, false, false, false]}
        canSwap
        onSelect={onSelect}
        onSwap={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(screen.getByRole('button', { name: '10 of hearts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jack of diamonds, wild' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Jack of spades, cutter' })).toBeInTheDocument();
    expect(screen.getByText('Wild')).toBeInTheDocument();
    expect(screen.getByText('Cutter')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2 of clubs' }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('dims dead cards and offers Swap only when allowed', () => {
    const onSwap = vi.fn();
    const { rerender } = render(
      <Hand
        hand={['TH', '2C']}
        selected={null}
        dead={[true, false]}
        canSwap
        onSelect={vi.fn()}
        onSwap={onSwap}
      />,
    );
    expect(screen.getByRole('button', { name: '10 of hearts, dead card' })).toHaveAttribute(
      'data-dead',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Swap dead 10 of hearts' }));
    expect(onSwap).toHaveBeenCalledWith(0);
    rerender(
      <Hand
        hand={['TH', '2C']}
        selected={null}
        dead={[true, false]}
        canSwap={false}
        onSelect={vi.fn()}
        onSwap={onSwap}
      />,
    );
    expect(screen.queryByRole('button', { name: /Swap/ })).toBeNull();
  });

  it('handles an empty hand', () => {
    render(
      <Hand
        hand={[]}
        selected={null}
        dead={[]}
        canSwap={false}
        onSelect={vi.fn()}
        onSwap={vi.fn()}
      />,
    );
    expect(screen.getByText('No cards in hand.')).toBeInTheDocument();
  });
});
