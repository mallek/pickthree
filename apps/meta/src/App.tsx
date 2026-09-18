/**
 * The shell: current location, theme, static data, and which screen renders. Screens themselves
 * are Tasks 10 to 13; until each lands, its view renders a small placeholder here. Overview
 * (Task 10) has landed and renders for real.
 */
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { resolveWindow, type MetaSummaryV1, type SpeciesDetailV1 } from './api.js';
import type { Baseline } from './baseline.js';
import type { StaticData } from './data.js';
import { PICK3 } from './links.js';
import {
  BANDS,
  DEFAULT_QUERY,
  WINDOWS,
  hrefFor,
  parseLocation,
  withLeague,
  type BandKey,
  type Query,
  type View,
  type WindowKey,
} from './route.js';
import { applyTheme, nextTheme, storedTheme, type ThemeChoice } from './theme.js';
import { Pills, Segmented, ThemeIcon } from './components.js';
import { About } from './screens/About.js';
import { Overview } from './screens/Overview.js';
import { Species } from './screens/Species.js';
import { Teams } from './screens/Teams.js';
import {
  DepsContext,
  useBaseline,
  useMetaSummary,
  useSpeciesDetail,
  useStatic,
  type Deps,
  type Loaded,
} from './useMeta.js';

const WINDOW_LABELS: Record<WindowKey, string> = {
  season: 'This season',
  '30': '30 days',
  '7': '7 days',
};

const BAND_LABELS: Record<BandKey, string> = {
  all: 'All ranks',
  below: 'Below Ace',
  ace: 'Ace',
  veteran: 'Veteran',
  expert: 'Expert',
  legend: 'Legend',
};

const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'system',
  light: 'light',
  dark: 'dark',
};

/** Built from the current and next choice, not three separate sentences, so the three states
 * cannot drift out of step with each other or with what a click actually does. */
function appearanceLabel(theme: ThemeChoice): string {
  return `Appearance: ${THEME_LABELS[theme]}. Switch to ${THEME_LABELS[nextTheme(theme)]}.`;
}

/** Views that carry a league at all; About does not. */
function leagueOf(view: View): string | null {
  return 'league' in view ? view.league : null;
}

function isPlainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function splitHref(href: string): { pathname: string; search: string } {
  const [pathname, search] = href.split('?');
  return { pathname: pathname ?? '/', search: search ? `?${search}` : '' };
}

/** Placeholder content for a view whose real screen has not landed yet (Tasks 11 to 13), or the
 * real Overview screen (Task 10) for the one view that has landed. */
function renderView(
  view: View,
  league: string,
  query: Query,
  data: StaticData,
  meta: Loaded<MetaSummaryV1>,
  baseline: Loaded<Baseline>,
  detail: Loaded<SpeciesDetailV1>,
  now: Date,
  href: (v: View) => string,
): ReactNode {
  if (view.name === 'about') {
    return <About baseline={baseline} />;
  }
  if (view.name === 'teams') {
    return <Teams league={league} query={query} data={data} meta={meta} now={now} />;
  }
  if (view.name === 'species') {
    return (
      <Species
        league={league}
        speciesId={view.speciesId}
        query={query}
        data={data}
        detail={detail}
        meta={meta}
        baseline={baseline}
        now={now}
        href={href}
      />
    );
  }
  return (
    <Overview
      league={league}
      query={query}
      data={data}
      meta={meta}
      baseline={baseline}
      now={now}
      href={href}
    />
  );
}

export function App(props?: { deps?: Deps }): ReactNode {
  const deps = props?.deps;
  const staticData = useStatic(deps);

  // The RAW location, not the parsed route: parsing needs the league list, which is not known
  // until the static data arrives. Deriving the route eagerly (with an empty league list) was
  // the bug: every non-first league would fail to resolve and get canonicalised away for good.
  const [loc, setLoc] = useState<{ pathname: string; search: string }>(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));
  const [theme, setTheme] = useState<ThemeChoice>(() => storedTheme());

  const leagueIds = staticData.data ? staticData.data.leagues.map((l) => l.id) : [];
  // A primitive, not the array itself, as the memo key: a fresh `.map()` result every render
  // would otherwise defeat the memo and re-derive the route (and re-run its effects) each time.
  const leagueIdsKey = leagueIds.join(',');
  const { view, query } = useMemo(
    () => parseLocation(loc.pathname, loc.search, leagueIds),
    [loc.pathname, loc.search, leagueIdsKey],
  );

  // The league to show in the switcher and the tabs: the current view's own league, or (on the
  // league-agnostic About view) whichever one was last seen. About carries no league, so the
  // switcher needs the last one seen. Adjusting state during render keeps that synchronous with
  // the URL without a ref, which a discarded concurrent render could otherwise leave holding a
  // value no commit ever matched.
  const [lastLeague, setLastLeague] = useState('great');
  const viewLeague = leagueOf(view);
  if (viewLeague && viewLeague !== lastLeague) {
    setLastLeague(viewLeague);
  }
  const activeLeague = viewLeague ?? lastLeague;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Canonicalise only once the league list is known, so an unrecognised path never gets
  // rewritten purely because the leagues have not loaded yet. Settles in one extra render: once
  // rewritten, `loc` matches the canonical string, the route re-derives to the same view/query,
  // and `hrefFor(view, query)` computes the same canonical string again, so the guard is false
  // and this effect becomes a no-op. Checked directly (see task-9-report.md, "Fix round 1").
  useEffect(() => {
    if (!staticData.data) {
      return;
    }
    const canonical = hrefFor(view, query);
    if (`${loc.pathname}${loc.search}` !== canonical) {
      window.history.replaceState(null, '', canonical);
      setLoc(splitHref(canonical));
    }
  }, [staticData.data, loc.pathname, loc.search, view, query]);

  useEffect(() => {
    function onPopState(): void {
      setLoc({ pathname: window.location.pathname, search: window.location.search });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /** A navigation: a new place, pushed onto history so the back button can undo it. */
  function go(nextView: View, nextQuery: Query): void {
    const href = hrefFor(nextView, nextQuery);
    if (href !== `${loc.pathname}${loc.search}`) {
      window.history.pushState(null, '', href);
    }
    setLoc(splitHref(href));
  }

  /** A filter change: a refinement of the page already on screen, so it replaces the current
   * history entry rather than adding one. Two filter clicks should not cost two back presses. */
  function refine(nextQuery: Query): void {
    const href = hrefFor(view, nextQuery);
    if (href !== `${loc.pathname}${loc.search}`) {
      window.history.replaceState(null, '', href);
    }
    setLoc(splitHref(href));
  }

  function navProps(
    nextView: View,
    nextQuery: Query,
  ): { href: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void } {
    return {
      href: hrefFor(nextView, nextQuery),
      onClick: (e) => {
        if (isPlainClick(e)) {
          e.preventDefault();
          go(nextView, nextQuery);
        }
      },
    };
  }

  const seasons = staticData.data?.seasons ?? [];
  const now = deps?.now?.() ?? new Date();
  const w = resolveWindow(query.w, seasons, now);
  const meta = useMetaSummary(activeLeague, w, query.band, deps);
  const baseline = useBaseline(activeLeague, deps);
  // Called unconditionally, same as meta and baseline above, to keep hook order stable across
  // views: on a non-species view there is no id to look up, so this fetches an empty one (the
  // stub, and the real worker, both answer it harmlessly) rather than skipping the hook.
  const speciesId = view.name === 'species' ? view.speciesId : '';
  const detail = useSpeciesDetail(activeLeague, speciesId, w, query.band, deps);

  const header = (
    <header className="hdr sticky">
      <a
        className="wordmark"
        {...navProps({ name: 'overview', league: activeLeague }, DEFAULT_QUERY)}
      >
        <span>meta</span>
        <span className="wordmark-accent">.pick3.gg</span>
      </a>
      <div className="hdr-actions">
        <a href={PICK3}>pick3</a>
        <button
          type="button"
          className="icon-btn"
          aria-label={appearanceLabel(theme)}
          onClick={() => setTheme((t) => nextTheme(t))}
        >
          <ThemeIcon choice={theme} />
        </button>
      </div>
    </header>
  );

  let content: ReactNode;
  if (staticData.state === 'loading') {
    content = (
      <div className="app">
        {header}
        <p className="sub">Loading</p>
      </div>
    );
  } else if (staticData.state === 'error' || !staticData.data) {
    content = (
      <div className="app">
        <p>Could not load the site data. Try again in a moment.</p>
      </div>
    );
  } else {
    const leagues = staticData.data.leagues;
    const showFilters = view.name === 'overview' || view.name === 'teams';
    // About is league-agnostic: withLeague is a no-op there, so showing the switcher would be a
    // control that does nothing when clicked.
    const showLeagueSwitch = view.name !== 'about';
    content = (
      <div className="app">
        {header}
        {showLeagueSwitch ? (
          <Segmented
            label="League"
            value={activeLeague}
            onChange={(id) => go(withLeague(view, id), query)}
            options={leagues.map((l) => ({ value: l.id, label: l.short }))}
          />
        ) : null}
        <nav className="tabs" aria-label="Sections">
          <a
            className={view.name === 'overview' ? 'on' : undefined}
            {...navProps({ name: 'overview', league: activeLeague }, query)}
          >
            Pokemon
          </a>
          <a
            className={view.name === 'teams' ? 'on' : undefined}
            {...navProps({ name: 'teams', league: activeLeague }, query)}
          >
            Teams
          </a>
          <a
            className={view.name === 'about' ? 'on' : undefined}
            {...navProps({ name: 'about' }, query)}
          >
            About
          </a>
        </nav>
        {showFilters ? (
          <>
            <Pills
              label="Window"
              value={query.w}
              onChange={(wk) => refine({ ...query, w: wk })}
              options={WINDOWS.map((k) => ({ value: k, label: WINDOW_LABELS[k] }))}
            />
            <Pills
              label="Rank band"
              value={query.band}
              onChange={(b) => refine({ ...query, band: b })}
              options={BANDS.map((k) => ({ value: k, label: BAND_LABELS[k] }))}
            />
          </>
        ) : null}
        {renderView(view, activeLeague, query, staticData.data, meta, baseline, detail, now, (v) =>
          hrefFor(v, query),
        )}
      </div>
    );
  }

  return <DepsContext.Provider value={deps ?? {}}>{content}</DepsContext.Provider>;
}
