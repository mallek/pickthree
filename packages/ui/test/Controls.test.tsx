import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterButton, LeagueList, LeagueSwitcher, Select } from '../src/index.ts';

/**
 * jsdom never lays out real pixels, so scrollWidth and clientWidth are both 0 by default (never
 * clipped). To exercise LeagueSwitcher's fit measurement, stub Element.prototype for the
 * duration of the test, then restore the original descriptors so other tests see jsdom's real
 * (0/0) behaviour again. The getters are spies (`scrollWidthSpy`/`clientWidthSpy`), so a test can
 * prove the layout effect actually read the DOM rather than just happening to match jsdom's
 * always-not-clipped default.
 */
function stubWidths(scrollWidth: number, clientWidth: number) {
  const scrollWidthSpy = vi.fn(() => scrollWidth);
  const clientWidthSpy = vi.fn(() => clientWidth);
  const scrollDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
  const clientDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
  Object.defineProperty(Element.prototype, 'scrollWidth', { configurable: true, get: scrollWidthSpy });
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: clientWidthSpy });
  return {
    scrollWidthSpy,
    clientWidthSpy,
    restore: () => {
      if (scrollDesc) {
        Object.defineProperty(Element.prototype, 'scrollWidth', scrollDesc);
      }
      if (clientDesc) {
        Object.defineProperty(Element.prototype, 'clientWidth', clientDesc);
      }
    },
  };
}

function withMeasuredWidths<T>(scrollWidth: number, clientWidth: number, fn: () => T): T {
  const stub = stubWidths(scrollWidth, clientWidth);
  try {
    return fn();
  } finally {
    stub.restore();
  }
}

/**
 * Stubs `document.fonts` with a minimal `loadingdone`/`ready` implementation a test can fire by
 * hand, for LeagueSwitcher's font-arrives-late re-measurement. jsdom has no `document.fonts` at
 * all, so this defines it on the instance for the duration of the test only.
 */
function stubFonts() {
  const listeners: Array<() => void> = [];
  const fakeFonts = {
    addEventListener: (event: string, cb: () => void) => {
      if (event === 'loadingdone') {
        listeners.push(cb);
      }
    },
    removeEventListener: (event: string, cb: () => void) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) {
        listeners.splice(i, 1);
      }
    },
    ready: Promise.resolve(),
  } as unknown as FontFaceSet;
  const original = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', { configurable: true, value: fakeFonts });
  return {
    fireLoadingDone: () => listeners.forEach((l) => l()),
    restore: () => {
      if (original) {
        Object.defineProperty(document, 'fonts', original);
      } else {
        Reflect.deleteProperty(document, 'fonts');
      }
    },
  };
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

  it('fits the cup name next to the open leagues, keeps their names, and proves it measured', () => {
    const stub = stubWidths(80, 80);
    let container: HTMLElement;
    try {
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
    } finally {
      stub.restore();
    }
    // Not a coincidence with jsdom's always-0 default: the layout effect read the real DOM.
    expect(stub.scrollWidthSpy).toHaveBeenCalled();
    expect(stub.clientWidthSpy).toHaveBeenCalled();
    expect(container.querySelector('.league-row')).not.toHaveClass('collapsed');
    const label = screen.getByRole('radio', { name: 'Great' }).querySelector('.ui-league-label');
    expect(label).not.toHaveClass('vh');
  });

  it('re-measures once the web font finishes loading, and does not oscillate', () => {
    let scrollWidth = 80;
    const clientWidth = 80;
    const scrollDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
    const clientDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
    Object.defineProperty(Element.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth });
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
    const fonts = stubFonts();
    try {
      const { container } = render(
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
      );
      // The fallback font's metrics said the cup's name fit.
      expect(container.querySelector('.league-row')).not.toHaveClass('collapsed');
      // The real font (once it loads) needs more room than the row has.
      scrollWidth = 400;
      act(() => fonts.fireLoadingDone());
      expect(container.querySelector('.league-row')).toHaveClass('collapsed');
      // Fonts can report `loadingdone` more than once; reading the same layout again must not
      // flip the decision back.
      act(() => fonts.fireLoadingDone());
      expect(container.querySelector('.league-row')).toHaveClass('collapsed');
    } finally {
      fonts.restore();
      if (scrollDesc) {
        Object.defineProperty(Element.prototype, 'scrollWidth', scrollDesc);
      }
      if (clientDesc) {
        Object.defineProperty(Element.prototype, 'clientWidth', clientDesc);
      }
    }
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

  it('has an icon-only form with the same accessible name and a count badge when on', async () => {
    const onClick = vi.fn();
    const { container } = render(<FilterButton iconOnly count={1} onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Filters, 1 on' });
    expect(button).toHaveClass('ui-icon-btn', 'ui-filter-icon', 'on');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    // No visible label: the glyph and the badge only.
    expect(button.textContent).toBe('1');
    expect(container.querySelector('.ui-filter-badge')?.textContent).toBe('1');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('icon-only with nothing on: named Filters, no badge, not on', () => {
    const { container } = render(<FilterButton iconOnly count={0} onClick={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Filters' });
    expect(button).not.toHaveClass('on');
    expect(container.querySelector('.ui-filter-badge')).toBeNull();
    expect(button.textContent).toBe('');
  });
});
