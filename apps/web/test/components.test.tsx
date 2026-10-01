import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MoveChoice, VerdictLabel } from '@pickthree/engine';
import { MetaGlyph } from '@pickthree/ui';
import { MoveRows, Progress, NoCollection, CogGlyph, VerdictTag } from '../src/components.tsx';

describe('Progress', () => {
  it('announces the stage label through the shared Loading state', () => {
    render(<Progress stage="simulate" done={1} total={4} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Simulating battles with your exact Pokémon',
    );
    expect(document.querySelector('.ui-loading-bar')).not.toBeNull();
  });
});

describe('NoCollection', () => {
  it('offers four ways in as buttons, import as the main one, the live meta last', async () => {
    const calls: string[] = [];
    render(<NoCollection navigate={(r) => calls.push(r.screen)} />);
    const importBtn = screen.getByRole('button', { name: 'Import a CSV' });
    expect(importBtn).toHaveClass('ui-btn-primary');
    fireEvent.click(screen.getByRole('button', { name: 'Add a Pokémon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build a team' }));
    fireEvent.click(importBtn);
    fireEvent.click(screen.getByRole('button', { name: 'See the live meta' }));
    expect(calls).toEqual(['add', 'build', 'import', 'meta']);
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

describe('MoveRows', () => {
  const fast: MoveChoice = {
    moveId: 'counter',
    name: 'Counter',
    type: 'fighting',
    tm: 'tm',
    energy: 0,
    energyGain: 7,
    turns: 1,
    countFromFast: null,
    counts: null,
    effects: [],
    altType: null,
  };
  const charged: MoveChoice = {
    moveId: 'upper_hand',
    name: 'Upper Hand',
    type: 'fighting',
    tm: 'have',
    energy: 40,
    energyGain: 0,
    turns: 0,
    countFromFast: 6,
    counts: [6, 6, 6],
    effects: [{ who: 'opponent', stat: 'atk', stages: -1, chance: 0.3 }],
    altType: null,
  };

  it('renders the badge as a direct child of .move-row, apart from .move-line', () => {
    const { container } = render(<MoveRows fast={fast} charged={[charged]} />);
    const rows = container.querySelectorAll('.move-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const directBadge = Array.from(row.children).find((c) => c.classList.contains('tm'));
      expect(directBadge).not.toBeUndefined();
      const line = row.querySelector('.move-line');
      expect(line).not.toBeNull();
      expect(line?.querySelector('.tm')).toBeNull();
      expect(line?.querySelector('.move-name')).not.toBeNull();
      expect(line?.querySelector('.move-tags')).not.toBeNull();
    }
  });

  it('puts the counts line on the row itself, after the badge, so it can run under the badge column', () => {
    const { container } = render(<MoveRows fast={fast} charged={[charged]} />);
    const sub = container.querySelector('.move-sub');
    expect(sub).not.toBeNull();
    const row = sub?.parentElement;
    expect(row).toHaveClass('move-row');
    const kids = Array.from(row?.children ?? []);
    const badge = kids.findIndex((c) => c.classList.contains('tm'));
    expect(badge).toBeGreaterThan(-1);
    expect(kids.indexOf(sub as Element)).toBeGreaterThan(badge);
    expect(container.querySelector('.move-main .move-sub')).toBeNull();
  });
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
