import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Bar,
  ConfidenceDot,
  Pills,
  Segmented,
  SitePill,
  Sparkline,
  Sprite,
  SpriteStack,
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

const clodsire: SpeciesLite = {
  id: 'clodsire',
  name: 'Clodsire',
  short: 'Clodsire',
  dex: 980,
  types: ['poison', 'ground'],
  shadow: false,
};

describe('typeColor', () => {
  it('maps a type to its token and an unknown type to the neutral one', () => {
    expect(typeColor('water')).toBe('var(--type-water)');
    expect(typeColor('quantum')).toBe('var(--muted)');
  });
});

describe('SitePill', () => {
  it('links out with an accessible name that says where it goes', () => {
    render(<SitePill href="https://pick3.gg" label="pick3" name="pick3, the team builder" />);
    const link = screen.getByRole('link', { name: 'pick3, the team builder' });
    expect(link).toHaveAttribute('href', 'https://pick3.gg');
    // The visible label and the mark are both hidden from assistive tech: the aria-label above
    // is the one source of the accessible name, so it is never announced twice.
    expect(screen.getByText('pick3')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Sprite', () => {
  it('loads the pick3 sprite and labels it for a screen reader', () => {
    const { container } = render(<Sprite species={azumarill} />);
    // The accessible name now lives on the outer token span (fix 1), not the image itself,
    // so the image's own attributes are checked separately from the role query.
    const token = screen.getByRole('img', { name: 'Azumarill' });
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://pick3.gg/data/sprites/azumarill.webp');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(token).toContainElement(img);
  });

  it('renders a solid muted disc, with no "undefined" in the gradient, for a typeless species', () => {
    const { container } = render(<Sprite species={{ ...azumarill, types: [] }} />);
    const token = container.querySelector('.token') as HTMLElement;
    expect(token.style.background).not.toContain('undefined');
    expect(token.style.background).toBe(
      'linear-gradient(135deg, var(--muted) 0 50%, var(--muted) 50% 100%)',
    );
  });

  it('repeats the single type across both halves of a mono-type disc', () => {
    const { container } = render(<Sprite species={{ ...azumarill, types: ['fire'] }} />);
    const token = container.querySelector('.token') as HTMLElement;
    expect(token.style.background).toBe(
      'linear-gradient(135deg, var(--type-fire) 0 50%, var(--type-fire) 50% 100%)',
    );
  });

  it('falls back to the neutral colour for an unknown type rather than an invalid variable', () => {
    const { container } = render(<Sprite species={{ ...azumarill, types: ['quantum'] }} />);
    const token = container.querySelector('.token') as HTMLElement;
    expect(token.style.background).toBe(
      'linear-gradient(135deg, var(--muted) 0 50%, var(--muted) 50% 100%)',
    );
  });

  it('scales the sprite art 6px larger than the disc at a non-default size', () => {
    const { container } = render(<Sprite species={azumarill} size={64} />);
    const img = container.querySelector('img') as HTMLImageElement;
    // app.css pins .token .sprite at 46px; only the inline style (fix 3) actually wins here.
    expect(img.style.width).toBe('70px');
    expect(img.style.height).toBe('70px');
  });

  describe('onError', () => {
    it('hides the image and leaves the named, coloured disc', () => {
      const { container } = render(<Sprite species={azumarill} />);
      const img = container.querySelector('img') as HTMLImageElement;
      fireEvent.error(img);
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByRole('img', { name: 'Azumarill' })).toBeInTheDocument();
    });

    it('resets once the same instance renders a different species', () => {
      const { container, rerender } = render(<Sprite species={azumarill} />);
      fireEvent.error(container.querySelector('img') as HTMLImageElement);
      expect(container.querySelector('img')).toBeNull();
      rerender(<Sprite species={clodsire} />);
      expect(container.querySelector('img')).not.toBeNull();
      expect(screen.getByRole('img', { name: 'Clodsire' })).toBeInTheDocument();
    });
  });
});

describe('SpriteStack', () => {
  it('gives the group one accessible name and hides the individual sprites from it', () => {
    render(<SpriteStack species={[azumarill, clodsire]} />);
    expect(screen.getByRole('img', { name: 'Azumarill, Clodsire' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Azumarill' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Clodsire' })).toBeNull();
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

  it('floors a negative value at zero', () => {
    render(<Bar pct={-30} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('treats a non-finite value as zero rather than emitting NaN', () => {
    render(<Bar pct={NaN} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    const fill = bar.querySelector('span') as HTMLSpanElement;
    expect(fill.style.width).toBe('0%');
  });
});

describe('Sparkline', () => {
  it('renders nothing readable for zero values', () => {
    const { container } = render(<Sparkline values={[]} />);
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('renders nothing readable for a single point rather than a broken line', () => {
    const { container } = render(<Sparkline values={[1]} />);
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('draws a polyline once there are two points', () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} />);
    expect(container.querySelector('polyline')).not.toBeNull();
  });

  it('stretches to fill its box rather than centering a fixed-size drawing', () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
    const line = container.querySelector('polyline');
    // The non-uniform scale that comes with stretching would smear an unpinned stroke into a
    // band; this keeps the drawn line thin regardless of the box it is stretched into.
    expect(line).toHaveAttribute('vector-effect', 'non-scaling-stroke');
  });

  it('draws a flat line at mid height for two identical values, not NaN coordinates', () => {
    const { container } = render(<Sparkline values={[5, 5]} />);
    const line = container.querySelector('polyline') as SVGPolylineElement;
    const points = line
      .getAttribute('points')!
      .trim()
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(points.every(([, y]) => y === 20)).toBe(true);
    // A circular end marker cannot survive the non-uniform stretch (it becomes an ellipse), so
    // there is no circle any more; the point count is what actually matters here.
    expect(points).toHaveLength(2);
    expect(container.querySelector('circle')).toBeNull();
  });

  it('draws a flat line at mid height when every value is equal, not NaN coordinates', () => {
    const { container } = render(<Sparkline values={[7, 7, 7]} />);
    const line = container.querySelector('polyline') as SVGPolylineElement;
    const points = line
      .getAttribute('points')!
      .trim()
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(points.every(([, y]) => y === 20)).toBe(true);
    expect(points).toHaveLength(3);
    expect(container.querySelector('circle')).toBeNull();
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
