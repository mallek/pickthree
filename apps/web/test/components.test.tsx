import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VerdictLabel } from '@pickthree/engine';
import {
  MetaButton,
  Progress,
  NoCollection,
  CogGlyph,
  MetaGlyph,
  VerdictTag,
} from '../src/components.tsx';

describe('MetaButton', () => {
  it('links to the community meta site with an accessible name that says where it goes', () => {
    render(<MetaButton />);
    const link = screen.getByRole('link', { name: 'meta, the community meta' });
    expect(link).toHaveAttribute('href', 'https://meta.pick3.gg');
    // Icon-only, matching pick3's own head-row buttons (HeadCog, the ShareGlyph IconButton): no
    // visible text, so the aria-label above is the one source of the accessible name.
    expect(link).toHaveClass('head-cog');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Progress', () => {
  it('announces the stage label through the shared Loading state', () => {
    render(<Progress stage="simulate" done={1} total={4} />);
    expect(screen.getByRole('status')).toHaveTextContent('Simulating battles with your exact Pokémon');
    expect(document.querySelector('.ui-loading-bar')).not.toBeNull();
  });
});

describe('NoCollection', () => {
  it('offers the three ways in as buttons, import as the main one', async () => {
    const calls: string[] = [];
    render(<NoCollection navigate={(r) => calls.push(r.screen)} />);
    const importBtn = screen.getByRole('button', { name: 'Import a CSV' });
    expect(importBtn).toHaveClass('ui-btn-primary');
    fireEvent.click(screen.getByRole('button', { name: 'Add a Pokémon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build a team' }));
    fireEvent.click(importBtn);
    expect(calls).toEqual(['add', 'build', 'import']);
  });
});

describe('VerdictTag', () => {
  const tones: Record<VerdictLabel, string> = {
    Built: 'ui-tag-win',
    'Worth building': 'ui-tag-accent',
    'Wait for better IVs': 'ui-tag-neutral',
    'Not eligible': 'ui-tag-neutral',
    'Needs rescan': 'ui-tag-warn',
  };

  for (const [label, tone] of Object.entries(tones) as [VerdictLabel, string][]) {
    it(`renders ${label} as a read-only Tag toned ${tone}`, () => {
      const { container } = render(<VerdictTag label={label} />);
      const wrap = container.querySelector('.verdict-tag');
      expect(wrap).not.toBeNull();
      expect(wrap).toHaveAttribute('data-verdict', label);
      const tag = screen.getByText(label);
      expect(tag).toHaveClass('ui-tag', tone);
      expect(tag.tagName).toBe('SPAN');
    });
  }
});

describe('glyphs', () => {
  it('render as hidden decorative SVGs', () => {
    const { container } = render(
      <>
        <MetaGlyph />
        <CogGlyph />
      </>,
    );
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(svgs.length).toBe(2);
  });
});
