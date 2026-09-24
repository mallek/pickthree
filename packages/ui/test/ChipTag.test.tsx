import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip, Tag, Term } from '../src/index.ts';

describe('Chip', () => {
  it('reports its pressed state when it has one', () => {
    render(
      <Chip on onClick={() => undefined}>
        You own
      </Chip>,
    );
    expect(screen.getByRole('button', { name: 'You own' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no pressed state when used as a plain action', () => {
    render(<Chip onClick={() => undefined}>Exclude</Chip>);
    expect(screen.getByRole('button', { name: 'Exclude' })).not.toHaveAttribute('aria-pressed');
  });
});

describe('Tag', () => {
  it('is read-only text: no button, not focusable', () => {
    render(<Tag tone="win">Worth building</Tag>);
    const tag = screen.getByText('Worth building');
    expect(tag.tagName).toBe('SPAN');
    expect(tag).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('button')).toBeNull();
    expect(tag).toHaveClass('ui-tag', 'ui-tag-win');
  });

  it('defaults to neutral', () => {
    render(<Tag>Shadow</Tag>);
    expect(screen.getByText('Shadow')).toHaveClass('ui-tag-neutral');
  });
});

describe('Term', () => {
  it('marks itself as an inline text control', () => {
    render(<Term term="ABB line">A team built so the back line beats the lead's counters.</Term>);
    expect(screen.getByRole('button', { name: 'ABB line' })).toHaveAttribute('data-inline-control');
  });
});
