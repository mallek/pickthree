/**
 * The shell: current location, theme, static data, and which screen renders. Screens themselves
 * are Tasks 10 to 13; until each lands, its view renders a small placeholder here. Overview
 * (Task 10) has landed and renders for real.
 */
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { resolveWindow, type MetaSummaryV1, type SpeciesDetailV1 } from './api.js';
import type { Baseline } from './baseline.js';
import { speciesOf, type StaticData } from './data.js';
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
import { Header, Pills, Segmented, ThemeIcon } from './components.js';
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

/** Bottom tab bar icons, drawn in apps/web's own stroke style (apps/web/src/App.tsx's ICONS):
 * 22px, stroke-width 1.8, round caps and joins, no fill except the one dot that needs it.
 * Pokemon reuses pick3's own "Collection" shape, a pokeball (ring, two side strokes, a centre
 * dot): both screens are a list of Pokemon. Teams reuses pick3's own "Teams" shape (three
 * circles) for the same reason, a team of three. About has no equivalent in pick3's tab bar, so
 * it is drawn fresh: an info glyph, a ring with a stem and a dot. */
const TAB_ICONS = {
  pokemon: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h5M15.5 12h5" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ),
  teams: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="9" r="3.2" />
      <circle cx="16" cy="9" r="3.2" />
      <circle cx="12" cy="15.5" r="3.2" />
    </svg>
  ),
  about: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
};

type NavProps = (
  nextView: View,
  nextQuery: Query,
) => { href: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void };

/** The site's primary navigation, pinned to the bottom of the viewport (App.tsx's own `.tabs`,
 * not apps/web's: this site routes on real paths, so every tab is a real `<a href>`, not a
 * button). Species has no tab of its own; it counts toward Pokemon, the tab it drills down from,
 * so every screen always has exactly one current tab to mark with `aria-current`. */
function TabBar({
  view,
  activeLeague,
  query,
  navProps,
}: {
  view: View;
  activeLeague: string;
  query: Query;
  navProps: NavProps;
}): ReactNode {
  const onPokemon = view.name === 'overview' || view.name === 'species';
  const onTeams = view.name === 'teams';
  const onAbout = view.name === 'about';
  return (
    <nav className="tabs" aria-label="Sections">
      <a
        className={onPokemon ? 'on' : undefined}
        aria-current={onPokemon ? 'page' : undefined}
        {...navProps({ name: 'overview', league: activeLeague }, query)}
      >
        {TAB_ICONS.pokemon}
        Pokemon
      </a>
      <a
        className={onTeams ? 'on' : undefined}
        aria-current={onTeams ? 'page' : undefined}
        {...navProps({ name: 'teams', league: activeLeague }, query)}
      >
        {TAB_ICONS.teams}
        Teams
      </a>
      <a
        className={onAbout ? 'on' : undefined}
        aria-current={onAbout ? 'page' : undefined}
        {...navProps({ name: 'about' }, query)}
      >
        {TAB_ICONS.about}
        About
      </a>
    </nav>
  );
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

  const themeButton = (
    <button
      type="button"
      className="icon-btn"
      aria-label={appearanceLabel(theme)}
      onClick={() => setTheme((t) => nextTheme(t))}
    >
      <ThemeIcon choice={theme} />
    </button>
  );

  // Shown on the three tab-root screens (Overview, Teams, About), each reached straight from the
  // bottom tab bar. Species is a drill-down from Overview rather than a tab of its own, so its
  // sticky header's back link takes over this row's job instead ("how do I leave this page"),
  // and the wordmark is dropped there rather than duplicating it. Not sticky itself: only the
  // page header below it is, so the two never have to share row 0 of the sticky stack.
  const brandRow = (
    <header className="brand">
      <a
        className="wordmark"
        {...navProps({ name: 'overview', league: activeLeague }, DEFAULT_QUERY)}
      >
        <img className="wordmark-mark" src="/mark.svg" alt="" aria-hidden="true" />
        <span>meta</span>
        <span className="wordmark-accent">.pick3.gg</span>
      </a>
      <a className="brand-pick3" href={PICK3}>
        pick3
      </a>
    </header>
  );

  let content: ReactNode;
  if (staticData.state === 'loading') {
    content = (
      <div className="app">
        {brandRow}
        <p className="sub">Loading</p>
      </div>
    );
  } else if (staticData.state === 'error' || !staticData.data) {
    content = (
      <div className="app">
        {brandRow}
        <p>Could not load the site data. Try again in a moment.</p>
      </div>
    );
  } else {
    const leagues = staticData.data.leagues;
    const leagueInfo = leagues.find((l) => l.id === activeLeague) ?? null;
    const leagueTitle = leagueInfo?.title ?? activeLeague;
    const leagueShort = leagueInfo?.short ?? activeLeague;
    const showFilters = view.name === 'overview' || view.name === 'teams';
    // About is league-agnostic: withLeague is a no-op there, so showing the switcher would be a
    // control that does nothing when clicked.
    const showLeagueSwitch = view.name !== 'about';
    const showBrand = view.name !== 'species';

    let pageHeader: ReactNode;
    if (view.name === 'about') {
      pageHeader = <Header title="About the data" action={themeButton} />;
    } else if (view.name === 'teams') {
      pageHeader = (
        <Header
          title="Most run teams"
          sub={`${leagueTitle} - ${WINDOW_LABELS[query.w]} - teams reporters ran themselves`}
          action={themeButton}
        />
      );
    } else if (view.name === 'species') {
      pageHeader = (
        <Header
          title={speciesOf(staticData.data, view.speciesId).name}
          sub={leagueTitle}
          backHref={hrefFor({ name: 'overview', league: activeLeague }, query)}
          backLabel={leagueShort}
          action={themeButton}
        />
      );
    } else {
      pageHeader = (
        <Header
          title={leagueTitle}
          sub={`${WINDOW_LABELS[query.w]} - ${BAND_LABELS[query.band]}`}
          action={themeButton}
        />
      );
    }

    content = (
      <div className="app">
        {showBrand ? brandRow : null}
        {pageHeader}
        {showLeagueSwitch ? (
          <Segmented
            label="League"
            value={activeLeague}
            onChange={(id) => go(withLeague(view, id), query)}
            options={leagues.map((l) => ({ value: l.id, label: l.short }))}
          />
        ) : null}
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
        <TabBar view={view} activeLeague={activeLeague} query={query} navProps={navProps} />
      </div>
    );
  }

  return <DepsContext.Provider value={deps ?? {}}>{content}</DepsContext.Provider>;
}
