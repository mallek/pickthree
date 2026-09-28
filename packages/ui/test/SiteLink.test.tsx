import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteLink } from '../src/index.ts';

describe('SiteLink', () => {
  it('links to meta.pick3.gg with its label', () => {
    render(<SiteLink site="meta" />);
    const a = screen.getByRole('link', { name: 'meta.pick3.gg, the community meta' });
    expect(a.getAttribute('href')).toBe('https://meta.pick3.gg');
    expect(a.className).toContain('ui-icon-btn');
  });
  it('links to pick3 with the pick3 mark', () => {
    render(<SiteLink site="pick3" />);
    const a = screen.getByRole('link', { name: 'pick3, the team builder' });
    expect(a.getAttribute('href')).toBe('https://pick3.gg');
    expect(a.querySelector('img')?.getAttribute('alt')).toBe('');
  });
});
