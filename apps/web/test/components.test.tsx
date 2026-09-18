import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetaButton } from '../src/components.tsx';

describe('MetaButton', () => {
  it('links to the community meta site with an accessible name that says where it goes', () => {
    render(<MetaButton />);
    const link = screen.getByRole('link', { name: 'meta, the community meta' });
    expect(link).toHaveAttribute('href', 'https://meta.pick3.gg');
    // Icon-only, matching pick3's own head-row buttons (HeadCog, ShareButton): no visible text,
    // so the aria-label above is the one source of the accessible name.
    expect(link).toHaveClass('head-cog');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
