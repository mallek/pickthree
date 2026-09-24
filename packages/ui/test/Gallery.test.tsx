import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Gallery } from '../gallery/Gallery.tsx';

const SECTIONS = [
  'Tokens',
  'Button',
  'IconButton',
  'Chip',
  'Tag',
  'TypeChip',
  'LeagueSwitcher',
  'Select',
  'FilterButton',
  'Measured',
  'ProgressCard',
  'ExpandRow',
  'Term',
  'Header',
  'Sheet',
  'ConfirmSheet',
  'Toast',
  'States',
];

describe('Gallery', () => {
  it('shows a section for every foundation component', () => {
    const { container } = render(<Gallery />);
    const shown = [...container.querySelectorAll('section[data-gallery]')].map((s) =>
      s.getAttribute('data-gallery'),
    );
    expect(shown).toEqual(SECTIONS);
  });

  it('includes the long-text states', () => {
    render(<Gallery />);
    expect(screen.getAllByText(/Build from your Rookidee/).length).toBeGreaterThan(0);
  });
});
