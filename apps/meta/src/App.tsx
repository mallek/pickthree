/**
 * The shell: current location, theme, static data, and which screen renders. Teams is the
 * league root (Task 11) and carries the team board (Task 12); Pokemon (the former Overview,
 * Task 10) lives at /<league>/pokemon, and Species is a real drill-down from it, not a
 * placeholder.
 */
import lockupDark from '@pickthree/ui/brand/lockup.svg';
import lockupLight from '@pickthree/ui/brand/lockup-light.svg';
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { resolveWindow, type MetaSummaryV1, type SpeciesDetailV1 } from './api.js';
import type { Baseline } from './baseline.js';
import { speciesOf, type StaticData } from './data.js';
import { epochFor, type Epoch } from './epochs.js';
import { PICK3 } from './links.js';
import { rankSpecies, type SpeciesRanking } from './rank.js';
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
import { buildBoard, type Board } from './teamRank.js';
import { applyTheme, nextTheme, storedTheme, type ThemeChoice } from '@pickthree/ui';
import { Header, LeagueSwitcher, Select, SitePill, ThemeIcon } from './components.js';
import { About } from './screens/About.js';
import { Pokemon } from './screens/Pokemon.js';
import { Species } from './screens/Species.js';
import { Teams } from './screens/Teams.js';
import {
  DepsContext,
  useBaseline,
  useEpochs,
  useGenerated,
  useMetaSummary,
  useRanks,
  useSlice,
  useSpeciesDetail,
  useStatic,
  useTeams,
  type Deps,
  type Loaded,
} from './useMeta.js';

const WINDOW_LABELS: Record<WindowKey, string> = {
  meta: 'This meta',
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
  const onTeams = view.name === 'teams';
  const onPokemon = view.name === 'pokemon' || view.name === 'species';
  const onAbout = view.name === 'about';
  return (
    <nav className="tabs" aria-label="Sections">
      <a
        className={onTeams ? 'on' : undefined}
        aria-current={onTeams ? 'page' : undefined}
        {...navProps({ name: 'teams', league: activeLeague }, query)}
      >
        {TAB_ICONS.teams}
        Teams
      </a>
      <a
        className={onPokemon ? 'on' : undefined}
        aria-current={onPokemon ? 'page' : undefined}
        {...navProps({ name: 'pokemon', league: activeLeague }, query)}
      >
        {TAB_ICONS.pokemon}
        Pokemon
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

/** Teams is the league root, so it is also the default: a view name renderView does not
 * otherwise recognize (there is none today, but this is the same fallback the old Overview
 * default was) lands on Teams rather than 404ing. Species is a drill-down from Pokemon (Tasks
 * 12 to 13); the real Pokemon screen (Task 10, moved here in Task 11) renders for `pokemon`. */
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
  boardError: boolean,
  board: Board | null,
  ranking: SpeciesRanking | null,
  rankingError: boolean,
  epoch: Epoch | null,
): ReactNode {
  if (view.name === 'about') {
    return <About baseline={baseline} />;
  }
  if (view.name === 'pokemon') {
    // Task 13: Pokemon reads the same blended ranking Teams does (computed once below, from the
    // meta summary, the baseline and the rank order together) rather than recomputing its own, so
    // the two screens can never quietly disagree about a row's weight.
    return (
      <Pokemon
        league={league}
        data={data}
        rankingError={rankingError}
        ranking={ranking}
        href={href}
      />
    );
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
        ranking={ranking}
        now={now}
        href={href}
      />
    );
  }
  return (
    <Teams
      league={league}
      data={data}
      boardError={boardError}
      board={board}
      ranking={ranking}
      epoch={epoch}
      bakedCommit={baseline.data?.pvpokeCommit ?? null}
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
  // Epochs land properly in Task 11; an empty list here just means every "meta" window falls
  // back to the season start, which is exactly what it already did before this task.
  const w = resolveWindow(query.w, { league: activeLeague, seasons, epochs: [] }, now);
  const meta = useMetaSummary(activeLeague, w, query.band, deps);
  const baseline = useBaseline(activeLeague, deps);
  // Called unconditionally, same as meta and baseline above, to keep hook order stable across
  // views: on a non-species view there is no id to look up, so this fetches an empty one (the
  // stub, and the real worker, both answer it harmlessly) rather than skipping the hook.
  const speciesId = view.name === 'species' ? view.speciesId : '';
  const detail = useSpeciesDetail(activeLeague, speciesId, w, query.band, deps);

  // Task 12: the team board. `ranking` and `board` are computed once here, not inside Teams
  // itself, so Teams and Pokemon (Task 13) read the exact same blended weights and never quietly
  // disagree about them. Every hook below is called unconditionally, same as meta and baseline
  // above, to keep hook order stable across views even though only the Teams view reads them.
  const epochs = useEpochs(deps);
  const teamsData = useTeams(activeLeague, w, query.band, deps);
  const slice = useSlice(activeLeague, deps);
  const ranks = useRanks(activeLeague, deps);
  const generated = useGenerated(activeLeague, deps);
  const ranking = useMemo(
    () =>
      meta.data && baseline.data && ranks.data
        ? rankSpecies(meta.data, baseline.data, ranks.data)
        : null,
    [meta.data, baseline.data, ranks.data],
  );
  const board = useMemo(
    () =>
      teamsData.data && ranking
        ? buildBoard({
            teams: teamsData.data,
            ranking,
            generated: generated.data?.teams ?? [],
            view: slice.data?.view ?? null,
          })
        : null,
    [teamsData.data, ranking, generated.data, slice.data],
  );
  const epoch = epochs.data ? epochFor(epochs.data, activeLeague, now) : null;
  // Fix round 1, item 3: `ranking` needs meta, baseline AND ranks; a failure in any of those
  // three left `ranking` (and so `board`) null forever with no error surfaced, because the only
  // thing Teams used to check was `teamsData.state`. `slice` is excluded on purpose: a failed
  // matchup slice degrades to `board.projectionless` rather than blanking the screen.
  const boardError =
    teamsData.state === 'error' ||
    meta.state === 'error' ||
    baseline.state === 'error' ||
    ranks.state === 'error';
  // Task 13: Pokemon fails to render only when one of `ranking`'s own three sources is down, not
  // when the team board's own feed (teamsData) is: Pokemon never reads teamsData at all.
  const rankingError =
    meta.state === 'error' || baseline.state === 'error' || ranks.state === 'error';

  // A1: pick3's tab roots carry the settings cog in their one header row, not a row of its own,
  // so the appearance toggle now sits in the brand row too (see brandRow below), drawn as pick3's
  // own .head-cog rather than this app's plainer .icon-btn (which nothing else used once this
  // moved, so it is gone from app.css).
  const themeButton = (
    <button
      type="button"
      className="head-cog"
      aria-label={appearanceLabel(theme)}
      onClick={() => setTheme((t) => nextTheme(t))}
    >
      <ThemeIcon choice={theme} />
    </button>
  );

  // Shown on the three tab-root screens (Teams, Pokemon, About), each reached straight from the
  // bottom tab bar. Species is a drill-down from Pokemon rather than a tab of its own, so its
  // sticky header's back link takes over this row's job instead ("how do I leave this page"),
  // and the wordmark is dropped there rather than duplicating it. Not sticky itself: only the
  // filters/switcher below it are, so the two never have to share row 0 of the sticky stack.
  //
  // G: the wordmark is now built from pick3's own lockup rather than this app's own bare "3"
  // mark, so the two sites read as one brand: "meta." in this app's own ink, pick3's outlined
  // "pick3" lockup sized to the surrounding text's cap height (the .hero-lockup metrics trick,
  // ported byte for byte from apps/web/src/app.css so the baseline math is not re-derived here),
  // then ".gg" in the muted colour. Both lockup colourways are always in the DOM; .only-dark/
  // .only-light (ported the same way) pick the one that matches the active theme, system or
  // explicit, exactly as apps/web/src/screens/Welcome.tsx already does for its own hero.
  const brandRow = (
    <header className="brand">
      <a className="wordmark" {...navProps({ name: 'teams', league: activeLeague }, DEFAULT_QUERY)}>
        <span>meta.</span>
        <img className="only-dark hero-lockup" src={lockupDark} alt="" aria-hidden="true" />
        <img className="only-light hero-lockup" src={lockupLight} alt="" aria-hidden="true" />
        <span className="wordmark-muted">.gg</span>
      </a>
      <span className="brand-actions">
        <SitePill href={PICK3} name="pick3, the team builder" />
        {themeButton}
      </span>
    </header>
  );

  let content: ReactNode;
  if (staticData.state === 'loading') {
    content = (
      <div className="page">
        <div className="top-bar">{brandRow}</div>
        <p className="sub">Loading</p>
      </div>
    );
  } else if (staticData.state === 'error' || !staticData.data) {
    content = (
      <div className="page">
        <div className="top-bar">{brandRow}</div>
        <p>Could not load the site data. Try again in a moment.</p>
      </div>
    );
  } else {
    const leagues = staticData.data.leagues;
    const leagueInfo = leagues.find((l) => l.id === activeLeague) ?? null;
    const leagueShort = leagueInfo?.short ?? activeLeague;
    const showFilters = view.name === 'teams' || view.name === 'pokemon';
    // About is league-agnostic: withLeague is a no-op there, so showing the switcher would be a
    // control that does nothing when clicked.
    const showLeagueSwitch = view.name !== 'about';
    const showBrand = view.name !== 'species';

    // A1: Teams, Pokemon and About are tab roots now told apart by the brand row above them,
    // the league switcher and the filter chips below them, and (for Teams and About) an `h2`
    // inside the screen's own body (Teams.tsx's "Most run teams", About.tsx's section headings),
    // not by a second, centred title row here. Species is still a drill-in with a back link, so
    // it keeps the one place that row belongs: its title is just the species name, since the
    // league it belongs to is already named by the switcher rendered under this header.
    const pageHeader: ReactNode =
      view.name === 'species' ? (
        <Header
          title={speciesOf(staticData.data, view.speciesId).name}
          backHref={hrefFor({ name: 'pokemon', league: activeLeague }, query)}
          backLabel={leagueShort}
          action={themeButton}
        />
      ) : null;

    const leagueSwitcher: ReactNode = showLeagueSwitch ? (
      <LeagueSwitcher
        label="League"
        value={activeLeague}
        onChange={(id) => go(withLeague(view, id), query)}
        options={leagues.map((l) => ({ value: l.id, label: l.short }))}
      />
    ) : null;
    const filters: ReactNode = showFilters ? (
      <div className="filter-row">
        <Select
          label="Window"
          value={query.w}
          onChange={(wk) => refine({ ...query, w: wk })}
          options={WINDOWS.map((k) => ({ value: k, label: WINDOW_LABELS[k] }))}
        />
        <Select
          label="Rank band"
          value={query.band}
          onChange={(b) => refine({ ...query, band: b })}
          options={BANDS.map((k) => ({ value: k, label: BAND_LABELS[k] }))}
        />
      </div>
    ) : null;

    content = (
      <div className="page">
        {showBrand ? (
          <div className="top-bar">
            {brandRow}
            {leagueSwitcher}
            {filters}
          </div>
        ) : (
          <>
            {pageHeader}
            {leagueSwitcher}
          </>
        )}
        {renderView(
          view,
          activeLeague,
          query,
          staticData.data,
          meta,
          baseline,
          detail,
          now,
          (v) => hrefFor(v, query),
          boardError,
          board,
          ranking,
          rankingError,
          epoch,
        )}
        <TabBar view={view} activeLeague={activeLeague} query={query} navProps={navProps} />
      </div>
    );
  }

  return <DepsContext.Provider value={deps ?? {}}>{content}</DepsContext.Provider>;
}
