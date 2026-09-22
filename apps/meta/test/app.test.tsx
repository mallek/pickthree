import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY } from '@pickthree/ui';
import { App } from '../src/App.js';
import { resetEpochs } from '../src/epochs.js';
import { stubFetch } from './stubs/stubFetch.js';

const now = (): Date => new Date('2026-09-18T12:00:00.000Z');

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('data-theme');
  // jsdom keeps localStorage across cases in this file; the theme test would otherwise leak
  // its stored choice into whichever case runs after it.
  localStorage.clear();
  // epochs.ts memoises the fetched list at module scope (one real fetch per page load in
  // production); without resetting it here, whichever test in this file renders <App> first
  // permanently caches its stub's epochs for every test that runs after it in this file.
  resetEpochs();
});

describe('App', () => {
  it('lands on the first league and names the site', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    // G: the wordmark reads "meta." then the pick3 lockup image then ".gg", not one plain "meta"
    // text node any more.
    expect(await screen.findByText('meta.')).toBeInTheDocument();
    expect(screen.getByText('.gg')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
  });

  it('lands on Teams', async () => {
    window.history.replaceState(null, '', '/great');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('heading', { name: /teams/i })).toBeInTheDocument();
  });

  it('puts Teams first in the tab bar', async () => {
    window.history.replaceState(null, '', '/great');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    const tabs = within(await screen.findByRole('navigation', { name: 'Sections' })).getAllByRole(
      'link',
    );
    expect(tabs.map((t) => t.textContent)).toEqual(['Teams', 'Pokemon', 'About']);
  });

  it('carries a pill to pick3 in the brand row', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('link', { name: 'pick3, the team builder' })).toHaveAttribute(
      'href',
      'https://pick3.gg',
    );
  });

  // A1: the appearance toggle used to live in a centred title row of its own; it is drawn as
  // pick3's own head-cog and sits in the brand row now, next to the pick3 pill.
  it('draws the appearance toggle as a round head-cog like pick3 in the brand row', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    const button = await screen.findByRole('button', { name: /appearance/i });
    expect(button).toHaveClass('head-cog');
  });

  it('switches league through the segmented control and puts it in the url', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Ultra' }));
    await waitFor(() => expect(window.location.pathname).toBe('/ultra'));
  });

  it('moves between the three tabs', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('link', { name: 'Pokemon' }));
    await waitFor(() => expect(window.location.pathname).toBe('/great/pokemon'));
    await userEvent.click(screen.getByRole('link', { name: 'About' }));
    await waitFor(() => expect(window.location.pathname).toBe('/about'));
  });

  // The window is the one native select in the filter row until Task 13 adds a Source select
  // beside it. The underlying `source` query key already round-trips through the url (Task 11):
  // an old `band=` link is dead and lands on the default (`all`), which writes nothing back.
  it('keeps the window filter in the url and reads it back, and drops a dead band= link', async () => {
    window.history.replaceState(null, '', '/great?w=7&source=ladder');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('combobox', { name: 'Window' })).toHaveValue('7');
    await waitFor(() => expect(window.location.search).toBe('?w=7&source=ladder'));
  });

  // The filter caption was taken off the screen, not deleted: the select's own value already
  // says what the field is, and the caption costs a row above the fold on a phone. The test
  // above is what pins the accessible name surviving (it finds the select by that name); this
  // pins the other half, that the name is off the screen rather than printed.
  it('keeps the filter label for a screen reader and off the screen', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    const select = await screen.findByRole('combobox', { name: 'Window' });
    const caption = select.closest('.field')?.querySelector('.field-l');
    expect(caption?.textContent).toBe('Window');
    expect(caption?.classList.contains('vh')).toBe(true);
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
  // on Pokemon's real copy ("Could not load the shared battles. PvPoke's list is below; try
  // again in a moment." and a "PvPoke's meta group" heading), which is Task 10's content, not
  // this shell's placeholder. That assertion now lives in Task 10's own pokemon.test.tsx
  // (see task-10-brief.md, "Overview, when the api is down"; the screen and its test moved and
  // were renamed in Task 11), which will run against the real screen once it exists.
});

describe('App, deep links', () => {
  // Fix round 1: the initial route was derived before the league list existed, so every
  // non-first league fell back to Great and had the address bar rewritten out from under it,
  // permanently for the session (nothing ever re-parsed the location once static data arrived).
  // These reproduce that failure against a URL other than the one the six tests above happen to
  // use.

  it('opens a non-first league at its own path and does not rewrite the url', async () => {
    // Teams is the league root now (Task 11); the real screen this test exercises (Task 10's
    // Pokemon, formerly Overview) lives at /<league>/pokemon.
    window.history.replaceState(null, '', '/ultra/pokemon');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('radio', { name: 'Ultra' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Task 10 replaced the overview placeholder with the real screen, which never says
    // "Most faced in ultra" (that string does not exist in the real copy). Task 13 collapsed the
    // screen's two sections (and their "PvPoke's meta group" heading) into the one blended list
    // under "What you face", so that is the heading this checks for now.
    expect(await screen.findByRole('heading', { name: 'What you face' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ultra/pokemon');
  });

  // Fix round 1 (task-11-report.md): retargeting the test above to /ultra/pokemon left the
  // league root itself, now the front door and the shape of a shared link to a non-default
  // league, with no regression coverage of its own. This is the same class of bug the fix-round-1
  // tests above guard against (a non-first league canonicalised away before the league list has
  // loaded), aimed at the route that matters most today: bare /<league>.
  it('opens a non-first league at its bare root and does not rewrite the url', async () => {
    window.history.replaceState(null, '', '/ultra');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('radio', { name: 'Ultra' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await screen.findByRole('heading', { name: 'Teams' })).toBeInTheDocument();
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
    expect(screen.getByText('No shared battles mention it in this window.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/master/p/registeel');
  });

  it('keeps the league and the window filter together across the old teams path, dropping the dead band', async () => {
    // The old /<league>/teams path (kept working by parseLocation) canonicalises to the league
    // root, and the window filter in its query string rides along untouched. `band=` is dead
    // (Task 11 retired the rank band axis): an old link carrying it lands on the default source,
    // `all`, which writes nothing back into the url.
    window.history.replaceState(null, '', '/ultra/teams?w=7&band=ace');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('radio', { name: 'Ultra' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // A1 dropped the centred title row (which used to name the league and window in its own
    // sub-line) in favour of the switcher and filter chips saying so directly: the "Ultra" and
    // "7 days" checks above and below already cover that, and Teams' own left-aligned heading
    // is what is left to identify the screen itself.
    expect(await screen.findByRole('heading', { name: 'Teams' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Window' })).toHaveValue('7');
    await waitFor(() => expect(window.location.pathname).toBe('/ultra'));
    expect(window.location.search).toBe('?w=7');
  });

  it('canonicalises the old teams path to the league root', async () => {
    window.history.replaceState(null, '', '/great/teams');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await screen.findByRole('heading', { name: /teams/i });
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
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

// Fix round 1, item 3 (Task 13): the old pokemon.test.tsx asserted this against a full <App>
// render, which is this invariant's proper home (it is App.tsx's own hook, `useSpeciesDetail`,
// called unconditionally on every view to keep hook order stable, that short-circuits to no
// request at all when there is no species id; `Pokemon.tsx`'s own tests render the screen in
// isolation and cannot see App.tsx's hooks at all). The rewrite of pokemon.test.tsx for Task 13
// dropped this along with the rest of the old file's App-level coverage; re-added here so a
// regression in that short-circuit costs three list views (Teams, Pokemon, About) an extra round
// trip and a test catches it rather than a review comment.
describe('App, epochs', () => {
  // Fix 2: the epoch list App.tsx passed to resolveWindow was hard-coded to [], so a "This meta"
  // window (the default, DEFAULT_QUERY.w = 'meta') always fell back to the season start no matter
  // what epochs.json said. The stub's default epoch (EPOCHS_FILE) sits exactly on the season
  // start, which is why that coincidence let the bug through undetected: since = season start
  // either way. This epoch starts a week AFTER the season start (2026-09-08T20:00:00.000Z), so it
  // only moves `since` if the epoch is actually wired through. If App.tsx's `epochs: []` regresses,
  // this test fails: `since` would come back as the season start instead.
  it('moves the default window since to an epoch that starts after the season', async () => {
    const laterEpoch = { at: '2026-09-15T00:00:00.000Z', note: 'mid-season rebalance' };
    const fetcher = vi.fn(stubFetch({ epochs: [laterEpoch] }));
    window.history.replaceState(null, '', '/great');
    render(<App deps={{ fetcher, now }} />);
    await screen.findByRole('heading', { name: 'Teams' });
    await waitFor(() => {
      // The window recomputes as static data and the epoch list each arrive, refetching each
      // time (useMetaSummary's effect keys include w.since), so the LAST call is the one that
      // matters: an earlier render's fallback (before either has loaded) is expected and ignored.
      const metaCalls = fetcher.mock.calls.filter((call) =>
        String(call[0]).startsWith('/api/v1/meta'),
      );
      expect(metaCalls.length).toBeGreaterThan(0);
      const lastCall = metaCalls[metaCalls.length - 1];
      const since = new URL(String(lastCall?.[0]), 'http://localhost').searchParams.get('since');
      expect(since).toBe('2026-09-15T00:00:00.000Z');
    });
  });
});

describe('App, request cost', () => {
  it('never asks for a species detail on the Pokemon list', async () => {
    const fetcher = vi.fn(stubFetch({}));
    window.history.replaceState(null, '', '/great/pokemon');
    render(<App deps={{ fetcher, now }} />);
    expect(await screen.findByRole('heading', { name: 'What you face' })).toBeInTheDocument();
    const urls = fetcher.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes('/api/v1/species/'))).toBe(false);
  });
});

describe('App, filter history', () => {
  it('replaces the history entry for a filter change instead of pushing a new one', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Window' }), '7');
    await waitFor(() => expect(window.location.search).toContain('w=7'));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    pushSpy.mockRestore();
    replaceSpy.mockRestore();
  });

  it('leaves the page in one back press no matter how many filter changes came first', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Window' }), '7');
    await waitFor(() => expect(window.location.search).toContain('w=7'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Window' }), '30');
    await waitFor(() => expect(window.location.search).toContain('w=30'));
    // Neither filter click pushed a history entry, so a single real navigation still undoes in
    // a single back press, landing on the page with its filter (not on an intermediate filter
    // state, which pushing would have created).
    await userEvent.click(screen.getByRole('link', { name: 'About' }));
    await waitFor(() => expect(window.location.pathname).toBe('/about'));
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
    expect(window.location.search).toBe('?w=30');
  });
});
