import type { CounterEntry, CounterMatchup } from '@pickthree/engine';
import {
  Button,
  Chevron,
  Empty,
  ErrorState,
  FilterButton,
  Header,
  IconButton,
  InlineSelect,
  SiteLink,
  Term,
  type ChoiceOption,
} from '@pickthree/ui';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  CogGlyph,
  MetaTags,
  PokemonToken,
  Progress,
  TypeChips,
  useName,
  useScrollMemory,
  useSpecies,
  useSticky,
} from '../components.tsx';
import { ShieldGrid } from '../components/ShieldGrid.tsx';
import { LeagueSwitcher, useLeague } from '../components/LeagueSwitcher.tsx';
import { canGoBack } from '../state/history.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { CountersAgainst } from './CountersAgainst.tsx';
import { CountersFilters, OWN_DEFAULT, OWN_KEY, type CountersOwn } from './CountersFilters.tsx';

type Sort = 'best' | 'radar';
const SORTS: ChoiceOption<Sort>[] = [
  { value: 'best', label: 'Best' },
  // Strong against the meta but ranked lower overall than that suggests (the engine's gap).
  { value: 'radar', label: 'Under the radar' },
];

const SHIELDS_NOTE =
  "Each cell is one battle at PvPoke's movesets and default IVs: your shields down the side, theirs across the top. W is a win, L a loss; an outlined cell is close.";

/**
 * Counters, and Who Beats X: one page. The Against picker switches between the whole meta and
 * one opponent in place (replacing the history entry), so Back always leaves the page for where
 * the player came from. Opened by a jump (Your Meta's "Who beats it", marked `from` on the route)
 * with pick3 history behind it, the header is a sub header with Back; otherwise the tab's own.
 */
export function Counters() {
  const s = useAppState();
  const { back, loadCounters, navigate, openSheet, setPick, setLeague } = useActions();
  const league = useLeague();
  const name = useName();
  const species = useSpecies();
  const [ownPicked] = useSticky<CountersOwn>(OWN_KEY, OWN_DEFAULT);
  const [sort, setSort] = useSticky<Sort>('counters.sort', 'best');
  const [sheet, setSheet] = useState<'against' | 'filters' | null>(null);
  const labelId = useId();
  const valueId = useId();
  const route = s.route.screen === 'counters' ? s.route : null;
  /** Species to score against instead of the whole meta. */
  const vs = route?.vs ?? null;
  /** The back mark: opened by a jump from another screen. */
  const from = route?.from === true;
  /** League named on a link from meta.pick3.gg; the app's own links never carry one. */
  const routeLeague = route?.league ?? null;
  const knownRouteLeague =
    routeLeague !== null && (s.data?.leagues.some((l) => l.id === routeLeague) ?? false);
  const stale = s.counters === null || s.countersVs !== vs;
  /** The last run against this opponent (or the whole meta) failed: shown with Try again, and
   * not asked again on its own. */
  const failed = s.countersError !== null && s.countersVs === vs;

  // Switch to the league the link named, once. When it is in play the route lets go of it, so
  // the league switcher works again (a route that kept it would switch straight back). An unknown
  // league id is ignored silently: the link still works, in whatever league was in play.
  useEffect(() => {
    if (!knownRouteLeague || !routeLeague) {
      return;
    }
    if (s.leagueInfo?.id === routeLeague) {
      navigate(
        { screen: 'counters', ...(vs ? { vs } : {}), ...(from ? { from: true } : {}) },
        { replace: true },
      );
    } else if ((s.settings.league ?? 'great') !== routeLeague) {
      setLeague(routeLeague);
    }
  }, [
    knownRouteLeague,
    routeLeague,
    s.leagueInfo,
    s.settings.league,
    setLeague,
    navigate,
    vs,
    from,
  ]);

  // The collection only marks what you own; the meta itself needs no import. While a known
  // route league has not caught up in leagueInfo yet, hold off so the scores that load match it.
  const switchingLeague = knownRouteLeague && s.leagueInfo?.id !== routeLeague;
  useEffect(() => {
    if (
      s.boot === 'ready' &&
      s.leagueInfo &&
      stale &&
      !failed &&
      !s.countersLoading &&
      !switchingLeague
    ) {
      void loadCounters(vs);
    }
  }, [s.boot, s.leagueInfo, stale, failed, s.countersLoading, loadCounters, vs, switchingLeague]);

  const counters = stale ? null : s.counters;
  // Without a collection nothing is owned, so a filter left on from before would hide every row.
  const own: CountersOwn = s.collection ? ownPicked : 'all';
  let rows: CounterEntry[] = counters?.entries ?? [];
  if (own === 'have') {
    rows = rows.filter((c) => c.owned === 'have');
  }
  if (own === 'build') {
    rows = rows.filter((c) => c.owned !== 'none');
  }
  if (sort === 'radar') {
    rows = [...rows].sort((a, b) => b.gap - a.gap || a.antiRank - b.antiRank);
  }
  // One memory per list: the whole meta's offset must not land on an opponent's list, or the
  // reverse, when one is opened after the other.
  useScrollMemory(`counters.scroll.${vs ?? 'meta'}`, rows.length > 0);

  /** The species of the copy that is or becomes this counter, null when it is not in the
   * collection (none imported, or gone since the scores were computed). */
  const specimenSpecies = (id: string | null): string | null => {
    const sp = id ? s.collection?.specimens.find((x) => x.id === id) : undefined;
    return sp ? sp.speciesId : null;
  };
  const oppText = (m: CounterMatchup): string =>
    m.opponentRank ? `${name(m.opponent)} #${m.opponentRank}` : name(m.opponent);
  const pick = (next: string | null): void => {
    setSheet(null);
    navigate(
      { screen: 'counters', ...(next ? { vs: next } : {}), ...(from ? { from: true } : {}) },
      { replace: true },
    );
  };

  const settings = (
    <IconButton label="Settings" onClick={openSheet}>
      <CogGlyph />
    </IconButton>
  );
  const jumped = from && canGoBack();
  const header = jumped ? (
    <Header
      variant="sub"
      title="Counters"
      back={{ label: 'Back', onClick: () => back({ screen: 'meta' }) }}
      actions={settings}
    />
  ) : (
    <Header
      variant="top"
      title="Counters"
      actions={
        <>
          <SiteLink site="meta" />
          {settings}
        </>
      }
    />
  );

  const metaSize = s.leagueInfo?.metaSize;
  const against = vs
    ? name(vs)
    : metaSize !== undefined
      ? `The whole meta (${metaSize})`
      : 'The whole meta';
  /** The opponent PvPoke does not rank: no rows, and the empty state says why on its own. */
  const unranked =
    counters?.vs && !counters.vs.inMeta && counters.vs.simulated === undefined
      ? counters.vs.speciesId
      : null;
  let line: ReactNode;
  if (!s.collection) {
    line = (
      <>
        <a href={hashFor({ screen: 'import' })}>Import</a> your collection to mark the ones you own.
      </>
    );
  } else if (vs) {
    line = "PvPoke's movesets; your log doesn't apply";
  } else {
    line = counters?.facing ?? null;
  }
  const sortSelect = (
    <InlineSelect<Sort> label="Sort" value={sort} options={SORTS} onChange={setSort} />
  );
  // Without a collection there is no filter icon, and the Import line needs the line's full width
  // to stay one line at 390px, so Sort takes the icon's place beside the picker.
  const controls = (
    <>
      <LeagueSwitcher compact />
      <div className="counters-controls">
        <div className="field">
          <span className="field-l" id={labelId}>
            Against
          </span>
          <span className="select-wrap">
            {/* counters-pick has no CSS of its own: it is a hook for tests and screens.mjs, and
                the ui Select's rule in base.css (.select-wrap > button) draws the button. */}
            <button
              type="button"
              className="counters-pick"
              aria-haspopup="dialog"
              aria-labelledby={`${labelId} ${valueId}`}
              onClick={() => setSheet('against')}
            >
              <span id={valueId}>{against}</span>
            </button>
            <Chevron dir="down" />
          </span>
        </div>
        {s.collection ? (
          <FilterButton
            iconOnly
            count={own === 'all' ? 0 : 1}
            onClick={() => setSheet('filters')}
          />
        ) : unranked || failed ? null : (
          sortSelect
        )}
      </div>
      {/* Nothing to sort or qualify under an unranked opponent or a failed run: the Against row
          stays so another can be picked, and the state below explains itself. */}
      {unranked || failed ? null : (
        <div className="counters-line">
          <span className="meta">{line}</span>
          {s.collection ? sortSelect : null}
        </div>
      )}
    </>
  );

  let empty: string | null = null;
  if (counters && rows.length === 0 && (!s.countersLoading || counters.entries.length > 0)) {
    if (unranked) {
      empty = `PvPoke does not rank ${name(unranked)} in ${league.title}, so pick3 has no moveset to simulate it with.`;
    } else if (counters.entries.length > 0) {
      // Rows came back, and the ownership filter hid every one.
      empty = 'Nothing here yet. Try another filter.';
    } else if (vs) {
      empty = `Nothing in ${league.title} beats ${name(vs)} in any shield pairing.`;
    } else {
      empty = 'No counters to show.';
    }
  }

  return (
    <div className="screen">
      {jumped ? (
        <div className="counters-head">
          {header}
          <div className="page-head">{controls}</div>
        </div>
      ) : (
        <div className="page-head">
          {header}
          {controls}
        </div>
      )}
      <div className="scroll" style={{ gap: 0, paddingTop: 4 }}>
        {s.boot === 'loading' && !counters ? <Progress stage="boot" done={0} total={0} /> : null}
        {s.countersLoading ? (
          <Progress
            stage={s.countersProgress?.stage ?? 'counters'}
            done={s.countersProgress?.done ?? 0}
            total={s.countersProgress?.total ?? 0}
          />
        ) : null}
        {rows.map((c) => {
          const mine = c.owned === 'none' ? null : specimenSpecies(c.ownedSpecimenId);
          const view =
            mine && c.ownedSpecimenId
              ? {
                  href: hashFor({ screen: 'specimen', id: c.ownedSpecimenId }),
                  label: c.owned === 'have' ? 'View yours' : `View your ${name(mine)}`,
                }
              : null;
          return (
            <div className="counter-row" key={c.speciesId}>
              <PokemonToken speciesId={c.speciesId} size={44} />
              <span className="counter-main">
                <span className="spec-name">
                  {name(c.speciesId)}
                  <TypeChips types={species(c.speciesId)?.types ?? ['normal', 'none']} small />
                </span>
                <span className="meta counter-rank">
                  {vs ? `#${c.antiRank} vs ${name(vs)}` : `#${c.antiRank} vs meta`} ·{' '}
                  {/* A no-break space: "#63 overall" wraps as one piece, never stranding "overall". */}
                  {c.overallRank ? `#${c.overallRank}\u00a0overall` : 'unranked'}
                </span>
                <MetaTags speciesId={c.speciesId} overall={false} />
                {c.beats.length > 0 ? (
                  <span className="counter-line">Beats {c.beats.map(oppText).join(', ')}</span>
                ) : null}
                {c.losesTo.length > 0 ? (
                  <span className="counter-line muted">
                    Loses to {c.losesTo.map(oppText).join(', ')}
                  </span>
                ) : null}
              </span>
              {vs ? (
                <span className="counter-grid">
                  <ShieldGrid grid={c.grid} size="row" />
                  <Term term="shields">{SHIELDS_NOTE}</Term>
                </span>
              ) : (
                <span className="anti">
                  <b>{Math.round(c.antiMeta)}%</b>
                  <small>of the meta</small>
                </span>
              )}
              <span className="counter-links">
                <Button
                  variant="text"
                  onClick={() => {
                    setPick(0, { kind: 'species', id: c.speciesId });
                    navigate({ screen: 'build' });
                  }}
                >
                  Build a team around it &rsaquo;
                </Button>
                {view ? (
                  <Button variant="text" href={view.href}>
                    {view.label} &rsaquo;
                  </Button>
                ) : null}
              </span>
            </div>
          );
        })}
        {failed ? (
          <ErrorState
            line={s.countersError ?? ''}
            action={
              <Button variant="secondary" onClick={() => void loadCounters(vs)}>
                Try again
              </Button>
            }
          />
        ) : null}
        {empty ? <Empty line={empty} /> : null}
      </div>
      {sheet === 'against' ? (
        <CountersAgainst onClose={() => setSheet(null)} onPick={pick} />
      ) : null}
      {sheet === 'filters' ? <CountersFilters onClose={() => setSheet(null)} /> : null}
    </div>
  );
}
