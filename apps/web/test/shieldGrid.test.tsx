import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShieldGrid, CLOSE_MARGIN } from '../src/components/ShieldGrid.tsx';

describe('ShieldGrid', () => {
  it('is the same 100-point margin Log a Battle and Counters both read', () => {
    expect(CLOSE_MARGIN).toBe(100);
  });

  it('fills a decisive result and outlines a close one, the letters never faded', () => {
    // 0-0, 0-1, 0-2 / 1-0, 1-1, 1-2 / 2-0, 2-1, 2-2
    const grid = [900, 560, 440, 100, 700, 500, 610, 390, 300];
    const { container } = render(<ShieldGrid grid={grid} />);
    const el = container.querySelector('.fo-grid');
    expect(el).toHaveAttribute('data-audit-contrast', 'static');
    const cells = [...container.querySelectorAll('.fo-grid i.w, .fo-grid i.l')];
    expect(cells.map((c) => `${c.className}:${c.textContent}`)).toEqual([
      'w:W',
      'w close:W',
      'l close:L',
      'l:L',
      'w:W',
      'l close:L',
      'w:W',
      'l:L',
      'l:L',
    ]);
  });

  it('renders an empty placeholder for a null cell, no letter', () => {
    const grid = [600, null, 400, 700, null, 300, 900, null, 200];
    const { container } = render(<ShieldGrid grid={grid} />);
    const empties = [...container.querySelectorAll('.fo-grid i.empty')];
    expect(empties).toHaveLength(3);
    for (const e of empties) {
      expect(e.textContent).toBe('');
    }
    // The other six cells still render their letter.
    expect(container.querySelectorAll('.fo-grid i.w, .fo-grid i.l')).toHaveLength(6);
  });

  it('renders nine empty placeholders for a null grid, still filling', () => {
    const { container } = render(<ShieldGrid grid={null} />);
    expect(container.querySelectorAll('.fo-grid i.empty')).toHaveLength(9);
    expect(container.querySelectorAll('.fo-grid i.w, .fo-grid i.l')).toHaveLength(0);
  });

  it('summarizes wins out of nine in the aria-label, unresolved cells not counted as wins', () => {
    const grid = [600, 400, null, 700, 300, 550, null, 450, 800];
    const { container } = render(<ShieldGrid grid={grid} />);
    const el = container.querySelector('.fo-grid');
    expect(el).toHaveAttribute('aria-label', 'Wins 4 of 9 shield pairings');
    expect(el).toHaveAttribute('role', 'img');
  });

  it('defaults to the card size and takes the larger row size for Counters', () => {
    const { container: card } = render(<ShieldGrid grid={null} />);
    expect(card.querySelector('.fo-grid')).not.toHaveClass('row');
    const { container: row } = render(<ShieldGrid grid={null} size="row" />);
    expect(row.querySelector('.fo-grid')).toHaveClass('row');
  });
});
