import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Bar,
  ConfidenceDot,
  Pills,
  Segmented,
  Sparkline,
  Sprite,
  TypeTags,
  typeColor,
} from '../src/components.js';
import type { SpeciesLite } from '../src/data.js';

const azumarill: SpeciesLite = {
  id: 'azumarill',
  name: 'Azumarill',
  short: 'Azumarill',
  dex: 184,
  types: ['water', 'fairy'],
  shadow: false,
};

describe('typeColor', () => {
  it('maps a type to its token and an unknown type to the neutral one', () => {
    expect(typeColor('water')).toBe('var(--type-water)');
    expect(typeColor('quantum')).toBe('var(--muted)');
  });
});

describe('Sprite', () => {
  it('loads the pick3 sprite and labels it for a screen reader', () => {
    render(<Sprite species={azumarill} />);
    const img = screen.getByRole('img', { name: 'Azumarill' });
    expect(img).toHaveAttribute('src', 'https://pick3.gg/data/sprites/azumarill.webp');
    expect(img).toHaveAttribute('loading', 'lazy');
  });
});

describe('TypeTags', () => {
  it('names every type in plain words', () => {
    render(<TypeTags types={['water', 'fairy']} />);
    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.getByText('Fairy')).toBeInTheDocument();
  });
});

describe('Bar', () => {
  it('clamps the fill and reports the value to assistive tech', () => {
    render(<Bar pct={140} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('Sparkline', () => {
  it('renders nothing readable for a single point rather than a broken line', () => {
    const { container } = render(<Sparkline values={[1]} />);
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('draws a polyline once there are two points', () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} />);
    expect(container.querySelector('polyline')).not.toBeNull();
  });
});

describe('ConfidenceDot', () => {
  it('says how much to trust a sample in words, not just colour', () => {
    render(<ConfidenceDot n={12} />);
    expect(screen.getByText('few')).toBeInTheDocument();
  });
});

describe('Segmented', () => {
  it('marks the chosen option and reports a change', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="League"
        value="great"
        onChange={onChange}
        options={[
          { value: 'great', label: 'Great' },
          { value: 'ultra', label: 'Ultra' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Great' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Ultra' }));
    expect(onChange).toHaveBeenCalledWith('ultra');
  });
});

describe('Pills', () => {
  it('works the same way as the segmented control', async () => {
    const onChange = vi.fn();
    render(
      <Pills
        label="Rank"
        value="all"
        onChange={onChange}
        options={[
          { value: 'all', label: 'All ranks' },
          { value: 'ace', label: 'Ace' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Ace' }));
    expect(onChange).toHaveBeenCalledWith('ace');
  });
});
