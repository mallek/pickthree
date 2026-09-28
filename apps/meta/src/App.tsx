/**
 * The shell: current location, theme, static data, and which screen renders. Teams is the
 * league root (Task 11) and carries the team board (Task 12); Pokemon (the former Overview,
 * Task 10) lives at /<league>/pokemon, and Species is a real drill-down from it, not a
 * placeholder.
 */
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { resolveWindow, type MetaSummaryV1, type SpeciesDetailV1 } from './api.js';
import type { Baseline } from './baseline.js';
import type { StaticData } from './data.js';
import { epochFor, type Epoch } from './epochs.js';
import type { Legal } from './legal.js';
import { rankSpecies, type SpeciesRanking } from './rank.js';
import {
  SOURCES,
  WINDOWS,
  hrefFor,
  parseLocation,
  withLeague,
  type Query,
  type SourceKey,
  type View,
  type WindowKey,
} from './route.js';
import { buildBoard, type Board } from './teamRank.js';
import {
  applyTheme,
  Button,
  ErrorState,
  Header,
  Loading,
  SiteLink,
  storedTheme,
  Tag,
  type ThemeChoice,
} from '@pickthree/ui';
import { LeagueSwitcher, Select } from './components.js';
import { About } from './screens/About.js';
import { Pokemon } from './screens/Pokemon.js';
import { Species } from './screens/Species.js';
import { Teams } from './screens/Teams.js';
import {
  DepsContext,
  useBaseline,
  useEpochs,
  useGenerated,
  useLegal,
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

const SOURCE_LABELS: Record<SourceKey, string> = {
  all: 'All',
  prior: 'PvPoke',
  ladder: 'GBL',
  tournament: 'Tournaments',
};

/** The three tab-root screens' own page titles, the ui Header's `title` on the `variant="top"`
 * head; Species carries no title of its own (see `pageHeader` below). */
const VIEW_TITLES: Record<'teams' | 'pokemon' | 'about', string> = {
  teams: 'Top teams',
  pokemon: 'Pokémon',
  about: 'About',
};

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
        Top teams
      </a>
      <a
        className={onPokemon ? 'on' : undefined}
        aria-current={onPokemon ? 'page' : undefined}
        {...navProps({ name: 'pokemon', league: activeLeague }, query)}
      >
        {TAB_ICONS.pokemon}
        Pokémon
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
  sources: Record<string, number>,
  legal: Legal | null,
  theme: ThemeChoice,
  onTheme: (theme: ThemeChoice) => void,
  onRetryBoard: () => void,
  onRetryRanking: () => void,
  onRetryDetail: () => void,
): ReactNode {
  if (view.name === 'about') {
    return <About baseline={baseline} theme={theme} onTheme={onTheme} />;
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
        onRetry={onRetryRanking}
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
        legal={legal}
        now={now}
        href={href}
        onRetry={onRetryDetail}
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
      sources={sources}
      onRetry={onRetryBoard}
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

  /** A navigation: a new place, pushed onto history so the back button can undo it. The state
   * carries `{ meta: 1 }` (Ruling 8) so a page reached this way, most importantly a species page,
   * can tell a real in-app back-chain apart from a fresh navigation (a shared link opened in a
   * new tab, or a real browser reload) whose `history.state` is null. */
  function go(nextView: View, nextQuery: Query): void {
    const href = hrefFor(nextView, nextQuery);
    if (href !== `${loc.pathname}${loc.search}`) {
      window.history.pushState({ meta: 1 }, '', href);
    }
    setLoc(splitHref(href));
  }

  /** A filter change: a refinement of the page already on screen, so it replaces the current
   * history entry rather than adding one. Two filter clicks should not cost two back presses.
   * The current entry's own state rides along unchanged, so refining a filter never turns a
   * `{ meta: 1 }` entry into one with no state (or the reverse). */
  function refine(nextQuery: Query): void {
    const href = hrefFor(view, nextQuery);
    if (href !== `${loc.pathname}${loc.search}`) {
      window.history.replaceState(window.history.state, '', href);
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

  /** Fix round 1: every in-app way into a screen other than the tab bar and the league switcher
   * (a species row, "Seen next to", every other cross-reference this site draws) is a plain
   * `<a href>` with no click handler of its own, so before this a click there was a genuine full
   * page load: `history.state` was always null, and every Back press pushed another Pokemon-list
   * entry rather than unwinding one. One delegated listener on the page container catches those
   * clicks instead of teaching every screen to call `go()` itself: a plain click (not modified,
   * not already handled, `isPlainClick`/`e.defaultPrevented`) on an anchor whose resolved URL is
   * same-origin and whose path this app actually routes (`parseLocation` with the known leagues)
   * is sent through `go()`, exactly as if it had been a tab or a switcher segment; anything else,
   * an external link (pick3.gg, "Open in pick3") or a modified click, is left to behave like an
   * ordinary link. `e.defaultPrevented` being true means a more specific handler (`navProps`'s
   * own onClick) already dealt with this click, so it is skipped here rather than double-handled. */
  function onPageClick(e: MouseEvent<HTMLDivElement>): void {
    if (e.defaultPrevented || !isPlainClick(e)) {
      return;
    }
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor || !anchor.href || (anchor.target && anchor.target !== '_self')) {
      return;
    }
    let url: URL;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) {
      return;
    }
    const { view: nextView, query: nextQuery } = parseLocation(url.pathname, url.search, leagueIds);
    e.preventDefault();
    go(nextView, nextQuery);
  }

  const seasons = staticData.data?.seasons ?? [];
  const now = deps?.now?.() ?? new Date();
  // Called before resolveWindow (not down with the other Task 12 hooks below) because the default
  // "This meta" window needs the epoch list to compute `since`: an empty list here silently drops
  // every epoch and every "meta" window falls back to the season start regardless of what
  // epochs.json says, which is the bug fix round 2 reported. Still unconditional, same as every
  // other hook in this function, to keep hook order stable across views.
  const epochsData = useEpochs(deps);
  const w = resolveWindow(
    query.w,
    { league: activeLeague, seasons, epochs: epochsData.data ?? [] },
    now,
  );
  const meta = useMetaSummary(activeLeague, w, deps);
  const baseline = useBaseline(activeLeague, deps);
  // The Play! ban list, fetched lazily like the baseline.
  const legal = useLegal(activeLeague, deps);
  // Called unconditionally, same as meta and baseline above, to keep hook order stable across
  // views: on a non-species view there is no id to look up, so this fetches an empty one (the
  // stub, and the real worker, both answer it harmlessly) rather than skipping the hook.
  const speciesId = view.name === 'species' ? view.speciesId : '';
  const detail = useSpeciesDetail(activeLeague, speciesId, w, query.source, deps);

  // Task 12: the team board. `ranking` and `board` are computed once here, not inside Teams
  // itself, so Teams and Pokemon (Task 13) read the exact same blended weights and never quietly
  // disagree about them. Every hook below is called unconditionally, same as meta and baseline
  // above, to keep hook order stable across views even though only the Teams view reads them.
  const teamsData = useTeams(activeLeague, w, query.source, deps);
  const slice = useSlice(activeLeague, deps);
  const ranks = useRanks(activeLeague, deps);
  const generated = useGenerated(activeLeague, deps);
  const ranking = useMemo(
    () =>
      meta.data && baseline.data && ranks.data
        ? rankSpecies(meta.data, baseline.data, ranks.data, {
            source: query.source,
            // A failed or absent ban list degrades to "nothing banned" rather than blanking the
            // screen, the same way a failed matchup slice degrades to `projectionless`.
            legal: legal.data,
          })
        : null,
    [meta.data, baseline.data, ranks.data, query.source, legal.data],
  );
  // Task 13: under PvPoke there is nothing measured by definition, so the board is the generated
  // projections alone. The fetch is still the same cached `all` read, so switching to `prior`
  // costs no request; only the board's own observed rows get zeroed before it is built.
  const observed = useMemo(() => {
    if (!teamsData.data) {
      return null;
    }
    return query.source === 'prior'
      ? { ...teamsData.data, teams: [], cores: [] }
      : teamsData.data;
  }, [teamsData.data, query.source]);
  const board = useMemo(
    () =>
      observed && ranking
        ? buildBoard({
            teams: observed,
            ranking,
            generated: generated.data?.teams ?? [],
            view: slice.data?.view ?? null,
          })
        : null,
    [observed, ranking, generated.data, slice.data],
  );
  const epoch = epochsData.data ? epochFor(epochsData.data, activeLeague, now) : null;
  // Fix round 1, item 3: `ranking` needs meta, baseline AND ranks; a failure in any of those
  // three left `ranking` (and so `board`) null forever with no error surfaced, because the only
  // thing Teams used to check was `teamsData.state`. `slice` is excluded on purpose: a failed
  // matchup slice degrades to `board.projectionless` rather than blanking the screen.
  const boardError =
    teamsData.state === 'error' ||
    meta.state === 'error' ||
    baseline.state === 'error' ||
    ranks.state === 'error';
  // Teams' own "Try again": retries whichever of the four sources actually failed, rather than
  // reflying every request. Task 7 and Task 8 reuse the same four retries for their own errors.
  function retryBoard(): void {
    if (teamsData.state === 'error') {
      teamsData.retry();
    }
    if (meta.state === 'error') {
      meta.retry();
    }
    if (baseline.state === 'error') {
      baseline.retry();
    }
    if (ranks.state === 'error') {
      ranks.retry();
    }
  }
  // Task 13: Pokemon fails to render only when one of `ranking`'s own three sources is down, not
  // when the team board's own feed (teamsData) is: Pokemon never reads teamsData at all.
  const rankingError =
    meta.state === 'error' || baseline.state === 'error' || ranks.state === 'error';
  // Task 7's own "Try again": retries whichever of `ranking`'s three sources actually failed,
  // the same shape as `retryBoard` above but without `teamsData`, which Pokemon never reads.
  function retryRanking(): void {
    if (meta.state === 'error') {
      meta.retry();
    }
    if (baseline.state === 'error') {
      baseline.retry();
    }
    if (ranks.state === 'error') {
      ranks.retry();
    }
  }
  // Task 8's own "Try again": Species reads both the species detail and the meta summary (the
  // hero's own figure comes from `ranking`, which is built from `meta`), so its retry covers
  // whichever of the two actually failed, the same shape as `retryBoard` and `retryRanking` above.
  function retryDetail(): void {
    if (detail.state === 'error') {
      detail.retry();
    }
    if (meta.state === 'error') {
      meta.retry();
    }
  }

  let content: ReactNode;
  if (staticData.state === 'loading') {
    content = (
      <div className="page">
        <Loading label="Loading" />
      </div>
    );
  } else if (staticData.state === 'error' || !staticData.data) {
    content = (
      <div className="page">
        <ErrorState
          line="Could not load the site data. Try again in a moment."
          action={<Button onClick={staticData.retry}>Try again</Button>}
        />
      </div>
    );
  } else {
    const leagues = staticData.data.leagues;
    const showFilters = view.name === 'teams' || view.name === 'pokemon';
    // About is league-agnostic: withLeague is a no-op there, so showing the switcher would be a
    // control that does nothing when clicked.
    const showLeagueSwitch = view.name !== 'about';
    // Teams, Pokemon and About are tab roots, reached straight from the bottom tab bar, and share
    // one sticky block (Ruling 8/10): the ui Header's `top` variant (a title and the "meta" mark),
    // the league switcher and the filter row. Species is a drill-down from Pokemon rather than a
    // tab of its own, so it carries the `sub` variant instead, back on the left (Ruling 8) and no
    // title (the species name now lives in the page body, Species.tsx's own `headerTop`, so no
    // build of that screen ever hides the name).
    const isTabRoot = view.name !== 'species';

    const pageHeader: ReactNode =
      view.name === 'species' ? (
        <Header
          variant="sub"
          back={{
            label: 'Back',
            onClick: () => {
              // Ruling 8: a page reached through this app's own navigation (a tab, then a row)
              // carries `{ meta: 1 }` (go()'s own history state), so the real back chain is
              // still there to unwind. A page opened fresh, a shared link in a new tab or a
              // reload, carries no state at all, and `history.back()` there would either do
              // nothing or leave the site entirely; landing on the league's own Pokemon list
              // (Review Focus 1) is the one target that is always right.
              if ((window.history.state as { meta?: number } | null)?.meta === 1) {
                window.history.back();
              } else {
                go({ name: 'pokemon', league: activeLeague }, query);
              }
            },
          }}
          actions={<SiteLink site="pick3" />}
        />
      ) : (
        <Header
          variant="top"
          title={VIEW_TITLES[view.name]}
          mark={<Tag tone="accent">meta</Tag>}
          actions={<SiteLink site="pick3" />}
        />
      );

    const leagueSwitcher: ReactNode = showLeagueSwitch ? (
      <LeagueSwitcher
        label="League"
        value={activeLeague}
        onChange={(id) => go(withLeague(view, id), query)}
        options={leagues.map((l) => ({ value: l.id, label: l.short }))}
      />
    ) : null;
    // The Window select and the Source select, replacing the retired rank band select: the two
    // are asked and worked out the same way, so there is no reason for one to write to the url
    // and not the other.
    const filters: ReactNode = showFilters ? (
      <div className="filter-row">
        <Select
          label="Window"
          value={query.w}
          onChange={(wk) => refine({ ...query, w: wk })}
          options={WINDOWS.map((k) => ({ value: k, label: WINDOW_LABELS[k] }))}
        />
        <Select
          label="Source"
          value={query.source}
          onChange={(s) => refine({ ...query, source: s })}
          options={SOURCES.map((k) => ({ value: k, label: SOURCE_LABELS[k] }))}
        />
      </div>
    ) : null;

    content = (
      <div className="page" onClick={onPageClick}>
        {isTabRoot ? (
          <div className="top-bar">
            {pageHeader}
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
          teamsData.data?.sources ?? {},
          legal.data,
          theme,
          setTheme,
          retryBoard,
          retryRanking,
          retryDetail,
        )}
        <TabBar view={view} activeLeague={activeLeague} query={query} navProps={navProps} />
      </div>
    );
  }

  return <DepsContext.Provider value={deps ?? {}}>{content}</DepsContext.Provider>;
}
