import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { THEME_KEY } from '../src/theme.js';
import { stubFetch } from './stubs/stubFetch.js';

const now = (): Date => new Date('2026-09-18T12:00:00.000Z');

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('data-theme');
  // jsdom keeps localStorage across cases in this file; the theme test would otherwise leak
  // its stored choice into whichever case runs after it.
  localStorage.clear();
});

describe('App', () => {
  it('lands on the first league and names the site', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText('meta')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
  });

  it('carries a pill to pick3 in the brand row', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByRole('link', { name: 'pick3, the team builder' }),
    ).toHaveAttribute('href', 'https://pick3.gg');
  });

  it('switches league through the segmented control and puts it in the url', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Ultra' }));
    await waitFor(() => expect(window.location.pathname).toBe('/ultra'));
  });

  it('moves between the three tabs', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('link', { name: 'Teams' }));
    await waitFor(() => expect(window.location.pathname).toBe('/great/teams'));
    await userEvent.click(screen.getByRole('link', { name: 'About' }));
    await waitFor(() => expect(window.location.pathname).toBe('/about'));
  });

  it('keeps the filters in the url and reads them back', async () => {
    window.history.replaceState(null, '', '/great?w=7&band=legend');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('radio', { name: '7 days' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Legend' })).toHaveAttribute('aria-checked', 'true');
  });

  it('answers the back button', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('link', { name: 'About' }));
    await waitFor(() => expect(window.location.pathname).toBe('/about'));
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
  });

  it('cycles the theme and remembers it', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('button', { name: /appearance/i }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
    // "remembers it" means the choice survives a reload, not just the in-page attribute, so
    // read the storage back rather than trusting the DOM alone.
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('names the appearance control by its current and next choice, and cycles through all three', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    // Asserting the accessible name, not the icon: a screen reader user cannot see that the
    // glyph changed, and the icon's own path data is an implementation detail, not the contract.
    await userEvent.click(
      await screen.findByRole('button', { name: 'Appearance: system. Switch to dark.' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Appearance: dark. Switch to light.' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Appearance: light. Switch to system.' }),
    ).toBeInTheDocument();
  });

  // The "says so, without blanking the page, when the api is down" case from the brief asserts
  // on Overview's real copy ("Could not load the shared battles. PvPoke's list is below; try
  // again in a moment." and a "PvPoke's meta group" heading), which is Task 10's content, not
  // this shell's placeholder. That assertion now lives in Task 10's own overview.test.tsx
  // (see task-10-brief.md, "Overview, when the api is down"), which will run against the real
  // screen once it exists.
});

describe('App, deep links', () => {
  // Fix round 1: the initial route was derived before the league list existed, so every
  // non-first league fell back to Great and had the address bar rewritten out from under it,
  // permanently for the session (nothing ever re-parsed the location once static data arrived).
  // These reproduce that failure against a URL other than the one the six tests above happen to
  // use.

  it('opens a non-first league at its own path and does not rewrite the url', async () => {
    window.history.replaceState(null, '', '/ultra');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('radio', { name: 'Ultra' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Task 10 replaced the overview placeholder with the real screen, which never says
    // "Most faced in ultra" (that string does not exist in the real copy). The below-threshold
    // banner and the baseline sub-line both name "Ultra League" here, so this checks for the
    // section heading instead of matching that text, which would otherwise find two elements.
    expect(await screen.findByRole('heading', { name: "PvPoke's meta group" })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ultra');
  });

  it('opens a species page in a non-first league and does not rewrite the url', async () => {
    window.history.replaceState(null, '', '/master/p/registeel');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('radio', { name: 'Master' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Task 12 replaced the species placeholder ("registeel in master") with the real screen.
    // Registeel has no shared battles and is not in the stub baseline for any league, so its
    // page is just the header and the no-data line. The species name is App.tsx's sticky header
    // title now (a plain span, matching apps/web's own Header, not a heading), so this checks
    // the text rather than a heading role.
    expect(await screen.findByText('Registeel')).toBeInTheDocument();
    expect(
      screen.getByText('No shared battles mention it in this window.'),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/master/p/registeel');
  });

  it('keeps the league, the view and both filters together', async () => {
    window.history.replaceState(null, '', '/ultra/teams?w=7&band=ace');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('radio', { name: 'Ultra' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Task 11 replaced the teams placeholder ("Teams in ultra") with the real screen, whose
    // sub-line names the league and window instead.
    expect(await screen.findByText(/Ultra League - 7 days/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Ace' })).toHaveAttribute('aria-checked', 'true');
    expect(window.location.pathname).toBe('/ultra/teams');
    expect(window.location.search).toBe('?w=7&band=ace');
  });

  it('still canonicalises the root to the first league', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
  });

  it('still falls back a genuinely unknown league to the first one', async () => {
    window.history.replaceState(null, '', '/premier');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
  });
});

describe('App, filter history', () => {
  it('replaces the history entry for a filter change instead of pushing a new one', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    await userEvent.click(await screen.findByRole('radio', { name: '7 days' }));
    await waitFor(() => expect(window.location.search).toContain('w=7'));
    await userEvent.click(screen.getByRole('radio', { name: 'Ace' }));
    await waitFor(() => expect(window.location.search).toContain('band=ace'));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(2);
    pushSpy.mockRestore();
    replaceSpy.mockRestore();
  });

  it('leaves the page in one back press no matter how many filters changed first', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
    await userEvent.click(await screen.findByRole('radio', { name: '7 days' }));
    await waitFor(() => expect(window.location.search).toContain('w=7'));
    await userEvent.click(screen.getByRole('radio', { name: 'Ace' }));
    await waitFor(() => expect(window.location.search).toContain('band=ace'));
    // Neither filter click pushed a history entry, so a single real navigation still undoes in
    // a single back press, landing on the page with its filters (not on an intermediate filter
    // state, which pushing would have created).
    await userEvent.click(screen.getByRole('link', { name: 'About' }));
    await waitFor(() => expect(window.location.pathname).toBe('/about'));
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
    expect(window.location.search).toBe('?w=7&band=ace');
  });
});
