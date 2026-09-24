import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterButton, LeagueList, LeagueSwitcher, Select } from '../src/index.ts';

/**
 * jsdom never lays out real pixels, so scrollWidth and clientWidth are both 0 by default (never
 * clipped). To exercise LeagueSwitcher's fit measurement, stub Element.prototype for the
 * duration of `fn`, then restore the original descriptors so other tests see jsdom's real (0/0)
 * behaviour again.
 */
function withMeasuredWidths<T>(scrollWidth: number, clientWidth: number, fn: () => T): T {
  const scrollDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
  const clientDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
  Object.defineProperty(Element.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
  try {
    return fn();
  } finally {
    if (scrollDesc) {
      Object.defineProperty(Element.prototype, 'scrollWidth', scrollDesc);
    }
    if (clientDesc) {
      Object.defineProperty(Element.prototype, 'clientWidth', clientDesc);
    }
  }
}

describe('Select', () => {
  it('always prints its label', () => {
    render(
      <Select
        label="Window"
        value="meta"
        onChange={() => undefined}
        options={[
          { value: 'meta', label: 'This meta' },
          { value: '7', label: '7 days' },
        ]}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Window' });
    const caption = select.closest('.field')?.querySelector('.field-l');
    expect(caption?.textContent).toBe('Window');
    expect(caption).not.toHaveClass('vh');
  });
});

describe('LeagueSwitcher', () => {
  const options = [
    { value: 'great', label: 'Great' },
    { value: 'ultra', label: 'Ultra' },
    { value: 'master', label: 'Master' },
  ];

  it('renders no overflow control unless asked', () => {
    render(<LeagueSwitcher label="League" value="great" onChange={() => undefined} options={options} />);
    expect(screen.queryByRole('button', { name: 'More leagues and cups' })).toBeNull();
  });

  it('adds an overflow control outside the radio group', async () => {
    const onMore = vi.fn();
    render(
      <LeagueSwitcher
        label="League"
        value="great"
        onChange={() => undefined}
        options={options}
        more={{ label: 'More leagues and cups', onClick: onMore }}
      />,
    );
    const more = screen.getByRole('button', { name: 'More leagues and cups' });
    expect(screen.getByRole('radiogroup', { name: 'League' })).not.toContainElement(more);
    await userEvent.click(more);
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('shows the current cup in the overflow slot instead of "..."', async () => {
    const onMore = vi.fn();
    render(
      <LeagueSwitcher
        label="League"
        value="great"
        onChange={() => undefined}
        options={options}
        more={{
          label: 'More leagues and cups',
          onClick: onMore,
          current: { id: 'championshipseries', label: 'Tournament', srLabel: 'Tournament' },
        }}
      />,
    );
    const more = screen.getByRole('button', { name: 'Tournament League, More leagues and cups' });
    expect(more).toHaveClass('on');
    expect(more).toHaveAttribute('title', 'Tournament');
    expect(more.textContent).toContain('Tournament');
    await userEvent.click(more);
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('fits the cup name next to the open leagues and keeps their names', () => {
    let container: HTMLElement | null = null;
    withMeasuredWidths(80, 80, () => {
      ({ container } = render(
        <LeagueSwitcher
          label="League"
          value="great"
          onChange={() => undefined}
          options={options}
          more={{
            label: 'More leagues and cups',
            onClick: () => undefined,
            current: { id: 'championshipseries', label: 'Tournament', srLabel: 'Tournament' },
          }}
        />,
      ));
    });
    expect(container!.querySelector('.league-row')).not.toHaveClass('collapsed');
    const label = screen.getByRole('radio', { name: 'Great' }).querySelector('.ui-league-label');
    expect(label).not.toHaveClass('vh');
  });

  it('collapses the open leagues to shields only when the cup name is clipped', () => {
    let container: HTMLElement | null = null;
    withMeasuredWidths(400, 80, () => {
      ({ container } = render(
        <LeagueSwitcher
          label="League"
          value="great"
          onChange={() => undefined}
          options={options}
          more={{
            label: 'More leagues and cups',
            onClick: () => undefined,
            current: { id: 'championshipseries', label: 'Championship Series', srLabel: 'Championship Series' },
          }}
        />,
      ));
    });
    expect(container!.querySelector('.league-row')).toHaveClass('collapsed');
    // The label hides visually (the `vh` class) but the radio's accessible name still says the
    // full league, so a screen reader hears "Great League" even with the text out of view.
    const label = screen.getByRole('radio', { name: 'Great' }).querySelector('.ui-league-label');
    expect(label).toHaveClass('vh');
    expect(label?.textContent).toBe('Great');
  });

  it('never collapses when there is no current cup', () => {
    const { container } = withMeasuredWidths(400, 80, () =>
      render(
        <LeagueSwitcher
          label="League"
          value="great"
          onChange={() => undefined}
          options={options}
          more={{ label: 'More leagues and cups', onClick: () => undefined }}
        />,
      ),
    );
    expect(container.querySelector('.league-row')).not.toHaveClass('collapsed');
  });
});

describe('LeagueList', () => {
  const options = [
    { value: 'great', label: 'Great League' },
    { value: 'championshipseries', label: 'Tournament' },
  ];

  it('checks the current league among full-width radio rows', () => {
    render(<LeagueList label="Leagues" value="championshipseries" onChange={() => undefined} options={options} />);
    expect(screen.getByRole('radiogroup', { name: 'Leagues' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Great League' })).toHaveAttribute('aria-checked', 'false');
    const current = screen.getByRole('radio', { name: 'Tournament' });
    expect(current).toHaveAttribute('aria-checked', 'true');
    expect(current).toHaveClass('on');
  });

  it('calls onChange with the picked value', async () => {
    const onChange = vi.fn();
    render(<LeagueList label="Leagues" value="great" onChange={onChange} options={options} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Tournament' }));
    expect(onChange).toHaveBeenCalledWith('championshipseries');
  });
});

describe('FilterButton', () => {
  it('names the count for a screen reader', () => {
    render(<FilterButton count={2} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Filters, 2 on' })).toHaveClass('on');
  });

  it('says only Filters when none are on', () => {
    render(<FilterButton count={0} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Filters' })).not.toHaveClass('on');
  });
});
