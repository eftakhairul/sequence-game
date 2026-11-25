import { BOARD, cellsFor, type TeamId } from '@lineup/rules';
import { fireEvent, render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';
import { Board, type BoardProps } from './Board';

const chips = (): (TeamId | null)[] => Array.from({ length: 100 }, () => null);
const renderBoard = (p: Partial<BoardProps> = {}) =>
  render(
    <LazyMotion features={domAnimation}>
      <Board view={{ chips: chips(), lines: [] }} targets={null} actionable={false} {...p} />
    </LazyMotion>,
  );

describe('Board', () => {
  it('renders a 10×10 grid with accessible labels and star corners', () => {
    renderBoard();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(100);
    expect(cells[0]).toHaveTextContent('Free corner');
    const c1 = BOARD[1] as string;
    expect(cells[1]?.textContent).toMatch(/ of (hearts|spades|diamonds|clubs), empty/);
    expect(c1).toBeTruthy();
  });

  it('labels chips, locked chips and highlights targets', () => {
    const c = chips();
    for (const i of [11, 12, 13, 14, 15]) c[i] = 0;
    c[40] = 1;
    const [t1, t2] = cellsFor('5H') as [number, number];
    const onActivate = vi.fn();
    renderBoard({
      view: { chips: c, lines: [{ team: 0, dir: 'H', cells: [11, 12, 13, 14, 15] }] },
      targets: [t1, t2],
      actionable: true,
      onActivate,
    });
    const cells = screen.getAllByRole('gridcell');
    expect(cells[12]?.textContent).toMatch(/blue circle chip, locked/);
    expect(cells[40]?.textContent).toMatch(/green triangle chip/);
    expect(cells[t1]).toHaveAttribute('data-target', 'true');
    expect(cells[50]).toHaveAttribute('data-dim', 'true');
    fireEvent.click(cells[50] as HTMLElement);
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent.click(cells[t1] as HTMLElement);
    expect(onActivate).toHaveBeenCalledWith(t1, false);
    expect(document.querySelectorAll('[data-line]')).toHaveLength(1);
  });

  it('does not activate when not actionable', () => {
    const [t1] = cellsFor('5H') as [number];
    const onActivate = vi.fn();
    renderBoard({ targets: [t1], actionable: false, onActivate });
    fireEvent.click(screen.getAllByRole('gridcell')[t1] as HTMLElement);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('supports roving tabindex with arrow keys and Enter', () => {
    const onActivate = vi.fn();
    renderBoard({ targets: [11], actionable: true, onActivate });
    const cells = screen.getAllByRole('gridcell');
    expect(cells[0]).toHaveAttribute('tabindex', '0');
    expect(cells[1]).toHaveAttribute('tabindex', '-1');
    const grid = screen.getByRole('grid');
    (cells[0] as HTMLElement).focus();
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(cells[11]).toHaveFocus();
    expect(cells[11]).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledWith(11, false);
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(cells[0]).toHaveFocus();
  });

  it('shows a preview chip', () => {
    renderBoard({ previewCell: 22, previewTeam: 1, targets: [22], actionable: true });
    expect(document.querySelector('[data-cell="22"] [data-preview]')).not.toBeNull();
  });
});
