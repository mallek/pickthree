import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SitePill } from '../src/components.tsx';

describe('SitePill', () => {
  it('links to the community meta site with an accessible name that says where it goes', () => {
    render(<SitePill />);
    const link = screen.getByRole('link', { name: 'meta, the community meta' });
    expect(link).toHaveAttribute('href', 'https://meta.pick3.gg');
    // The visible label is "meta" alone; the glyph and label are both hidden from assistive
    // tech, so the aria-label above is the one source of the accessible name.
    expect(screen.getByText('meta')).toHaveAttribute('aria-hidden', 'true');
  });
});
