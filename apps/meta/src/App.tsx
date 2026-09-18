/**
 * The shell: current location, theme, static data, and which screen renders. Screens themselves
 * are Tasks 10 to 13; until each lands, its view renders a small placeholder here.
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { resolveWindow, type MetaSummaryV1 } from './api.js';
import type { Baseline } from './baseline.js';
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
import { Pills, Segmented } from './components.js';
import {
  DepsContext,
  useBaseline,
  useMetaSummary,
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

/** Views that carry a league at all; About does not. */
function leagueOf(view: View): string | null {
  return 'league' in view ? view.league : null;
}

function isPlainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** Placeholder content for a view whose real screen has not landed yet (Tasks 10 to 13). */
function renderView(
  view: View,
  league: string,
  meta: Loaded<MetaSummaryV1>,
  baseline: Loaded<Baseline>,
): ReactNode {
  if (view.name === 'about') {
    // Task 13 replaces this with the real about page.
    return (
      <main>
        <p className="sub">About meta.pick3.gg. Task 13 replaces this placeholder.</p>
      </main>
    );
  }
  if (view.name === 'teams') {
    // Task 11 replaces this with the real teams screen.
    return (
      <main>
        <p className="sub">Teams in {league}. Task 11 replaces this placeholder.</p>
      </main>
    );
  }
  if (view.name === 'species') {
    // Task 12 replaces this with the real species screen.
    return (
      <main>
        <p className="sub">
          {view.speciesId} in {league}. Task 12 replaces this placeholder.
        </p>
      </main>
    );
  }
  // Overview. Task 10 replaces this with the real screen. Until then this placeholder still
  // says, plainly, when the shared-battles fetch failed, rather than blanking the page; the
  // exact reader-facing copy and the PvPoke fallback section belong to Task 10.
  return (
    <main>
      {meta.state === 'error' ? <p>Could not load the shared battles.</p> : null}
      <p className="sub">
        Most faced in {league}. Task 10 replaces this placeholder.
        {baseline.state === 'ready' ? ' PvPoke list loaded.' : ''}
      </p>
    </main>
  );
}

export function App(props?: { deps?: Deps }): ReactNode {
  const deps = props?.deps;
  const staticData = useStatic(deps);

  const [loc, setLoc] = useState<{ view: View; query: Query }>(() =>
    parseLocation(window.location.pathname, window.location.search, []),
  );
  const [theme, setTheme] = useState<ThemeChoice>(() => storedTheme());
  const [activeLeague, setActiveLeague] = useState<string>(() => leagueOf(loc.view) ?? 'great');
  const leagueIdsRef = useRef<string[]>([]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    leagueIdsRef.current = staticData.data ? staticData.data.leagues.map((l) => l.id) : [];
  }, [staticData.data]);

  useEffect(() => {
    const l = leagueOf(loc.view);
    if (l) {
      setActiveLeague(l);
    }
  }, [loc.view]);

  // Mount-only: turn a non-canonical entry path (e.g. "/") into its canonical one ("/great").
  useEffect(() => {
    const href = hrefFor(loc.view, loc.query);
    const current = window.location.pathname + window.location.search;
    if (href !== current) {
      window.history.replaceState(null, '', href);
    }
    // Deliberately empty: this normalizes only the path the page was opened with.
  }, []);

  useEffect(() => {
    function onPopState(): void {
      setLoc(
        parseLocation(window.location.pathname, window.location.search, leagueIdsRef.current),
      );
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function go(view: View, query: Query): void {
    const href = hrefFor(view, query);
    const current = window.location.pathname + window.location.search;
    if (href !== current) {
      window.history.pushState(null, '', href);
    }
    setLoc({ view, query });
  }

  function navProps(view: View, query: Query): { href: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void } {
    return {
      href: hrefFor(view, query),
      onClick: (e) => {
        if (isPlainClick(e)) {
          e.preventDefault();
          go(view, query);
        }
      },
    };
  }

  const seasons = staticData.data?.seasons ?? [];
  const now = deps?.now?.() ?? new Date();
  const w = resolveWindow(loc.query.w, seasons, now);
  const meta = useMetaSummary(activeLeague, w, loc.query.band, deps);
  const baseline = useBaseline(activeLeague, deps);

  const header = (
    <header className="hdr sticky">
      <a
        className="wordmark"
        {...navProps({ name: 'overview', league: activeLeague }, DEFAULT_QUERY)}
      >
        <span>meta</span>
        <span>.pick3.gg</span>
      </a>
      <div className="hdr-actions">
        <a href={PICK3}>pick3</a>
        <button
          type="button"
          className="icon-btn"
          aria-label="Appearance"
          onClick={() => setTheme((t) => nextTheme(t))}
        >
          <span aria-hidden="true">*</span>
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
    const showFilters = loc.view.name === 'overview' || loc.view.name === 'teams';
    content = (
      <div className="app">
        {header}
        <Segmented
          label="League"
          value={activeLeague}
          onChange={(id) => go(withLeague(loc.view, id), loc.query)}
          options={leagues.map((l) => ({ value: l.id, label: l.short }))}
        />
        <nav className="tabs" aria-label="Sections">
          <a
            className={loc.view.name === 'overview' ? 'on' : undefined}
            {...navProps({ name: 'overview', league: activeLeague }, loc.query)}
          >
            Pokemon
          </a>
          <a
            className={loc.view.name === 'teams' ? 'on' : undefined}
            {...navProps({ name: 'teams', league: activeLeague }, loc.query)}
          >
            Teams
          </a>
          <a
            className={loc.view.name === 'about' ? 'on' : undefined}
            {...navProps({ name: 'about' }, loc.query)}
          >
            About
          </a>
        </nav>
        {showFilters ? (
          <>
            <Pills
              label="Window"
              value={loc.query.w}
              onChange={(wk) => go(loc.view, { ...loc.query, w: wk })}
              options={WINDOWS.map((k) => ({ value: k, label: WINDOW_LABELS[k] }))}
            />
            <Pills
              label="Rank band"
              value={loc.query.band}
              onChange={(b) => go(loc.view, { ...loc.query, band: b })}
              options={BANDS.map((k) => ({ value: k, label: BAND_LABELS[k] }))}
            />
          </>
        ) : null}
        {renderView(loc.view, activeLeague, meta, baseline)}
      </div>
    );
  }

  return <DepsContext.Provider value={deps ?? {}}>{content}</DepsContext.Provider>;
}
