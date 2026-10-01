import type { Specimen, VerdictLabel } from '@pickthree/engine';
import {
  Chevron,
  Empty,
  ErrorState,
  FilterButton,
  Header,
  IconButton,
  InlineSelect,
  Loading,
  Tag,
  type ChoiceOption,
} from '@pickthree/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Chip,
  CogGlyph,
  HundoTag,
  MetaRankTags,
  PokemonToken,
  Progress,
  VerdictTag,
  useName,
  useScrollMemory,
  useSpecies,
  useSticky,
} from '../components.tsx';
import { judgeFailedLine, META_CUTOFF, num, ownSpeciesId, rankLabel, SEP } from '../format.ts';
import { LeagueSwitcher, useLeague } from '../components/LeagueSwitcher.tsx';
import { shareEnabled } from '../metaShare.ts';
import { matchesQuery, parseQuery } from '../search.ts';
import { specimenRecord, speciesRecord } from '../searchRecords.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { useMetaRanking } from '../state/useMeta.ts';
import { CollectionFilters } from './CollectionFilters.tsx';

type Sort = 'verdict' | 'rank' | 'meta' | 'name';
const SORTS: ChoiceOption<Sort>[] = [
  { value: 'verdict', label: 'Verdict' },
  { value: 'rank', label: 'IV rank' },
  { value: 'meta', label: 'Meta rank' },
  { value: 'name', label: 'Name' },
];

/** A plus, the Add a Pokémon glyph for an IconButton: 20px, drawn like ShareGlyph. */
function PlusGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

/** An arrow down into a tray, the Import a collection glyph: 20px, drawn like PlusGlyph. */
function ImportGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  );
}

/** The tab's own header: its title, Add a Pokémon, Import while nothing is collected, and
 * Settings. */
function CollectionHeader({ openSheet, empty }: { openSheet: () => void; empty: boolean }) {
  return (
    <Header
      variant="top"
      title="Collection"
      actions={
        <>
          <IconButton label="Add a Pokémon" href={hashFor({ screen: 'add' })}>
            <PlusGlyph />
          </IconButton>
          {empty ? (
            <IconButton label="Import a collection" href={hashFor({ screen: 'import' })}>
              <ImportGlyph />
            </IconButton>
          ) : null}
          <IconButton label="Settings" onClick={openSheet}>
            <CogGlyph />
          </IconButton>
        </>
      }
    />
  );
}

/** Quick pills: short labels so all four fit without scrolling. Ineligible rows hide by default. */
const PILLS: { label: VerdictLabel; short: string }[] = [
  { label: 'Built', short: 'Built' },
  { label: 'Worth building', short: 'Worth it' },
  { label: 'Wait for better IVs', short: 'Wait for IVs' },
  { label: 'Needs rescan', short: 'Rescan' },
];
const ORDER: Record<VerdictLabel, number> = {
  Built: 0,
  'Worth building': 1,
  'Wait for better IVs': 2,
  'Not eligible': 3,
  'Needs rescan': 4,
};

/** Sorts after every species in the blended order: those go by PvPoke's overall rank. */
const UNRANKED = 100_000;

/**
 * Not-collected rows list the species the blended order ranks (PvPoke's meta group plus anything
 * sighted or picked) and PvPoke's overall top 200, not every species the league admits (about
 * 1,500 in Great League, Caterpie included). A search reaches the whole league.
 */
const NOT_COLLECTED_TOP = 200;

const NO_PILLS: VerdictLabel[] = [];

/** One line of the list: a group of your own Pokémon, or a species you have none of. */
type Item =
  | { kind: 'mine'; key: string; best: Specimen; others: Specimen[] }
  | { kind: 'missing'; key: string; id: string };

export function Collection() {
  const s = useAppState();
  const { loadVerdicts, openSheet } = useActions();
  const name = useName();
  const species = useSpecies();
  const league = useLeague();
  const info = s.leagueInfo;
  // Collection opens all the time, so its community read is automatic and follows the sharing
  // switch: off ranks by PvPoke alone, with no read and no trend.
  const ranked = useMetaRanking(league.id, {
    window: 'meta',
    source: 'all',
    community: shareEnabled(s.settings),
  });
  // For one render after a league switch the hook still holds the last league's order; never
  // mix it with this league's rows.
  const meta = ranked.data && info && ranked.data.league === info.id ? ranked.data : null;
  // Settled once the read is done for this league: a result for another league is still loading.
  const rankSettled =
    ranked.state === 'error' ||
    (ranked.state === 'ready' && (ranked.data === null || meta !== null));
  const blended = useMemo(
    () => new Map((meta?.order ?? []).map((id, i) => [id, i + 1] as const)),
    [meta],
  );
  const metaRanks = info?.metaRanks;
  const empty = (s.collection?.specimens.length ?? 0) === 0;
  const [query, setQuery] = useSticky('collection.query', '');
  // Verdict pills are a multi-select; nothing picked means everything.
  const [verdicts, setVerdicts] = useSticky<VerdictLabel[]>('collection.verdicts', []);
  // The Filters sheet writes these same keys; useSticky shares one value between the two.
  const [showIneligible] = useSticky('collection.showIneligible', false);
  const [shadowsOnly] = useSticky('collection.shadows', false);
  const [recentOnly] = useSticky('collection.recent', false);
  const [metaOnly] = useSticky('collection.meta', false);
  const [hideNotCollected] = useSticky('collection.hideNotCollected', false);
  // Null until the player picks one: Meta rank with nothing collected, Verdict otherwise.
  const [sortPick, setSort] = useSticky<Sort | null>('collection.sort', null);
  const sort: Sort = sortPick ?? (empty ? 'meta' : 'verdict');
  const [grouped] = useSticky('collection.grouped', true);
  const [open, setOpen] = useSticky<Set<string>>('collection.open', new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  // A row is excluded when the Pokémon it battles as (its verdict's build) is left out of teams,
  // or, until legacy per-copy ids convert, when this very copy was.
  const excludedSpecies = new Set(s.settings.excludedSpecies ?? []);
  const legacyExcluded = new Set(s.settings.excludedSpecimenIds ?? []);
  const isExcluded = (id: string): boolean => {
    const battles = s.verdicts[id]?.build?.speciesId;
    return (battles !== undefined && excludedSpecies.has(battles)) || legacyExcluded.has(id);
  };

  useEffect(() => {
    if (
      s.boot === 'ready' &&
      s.leagueInfo &&
      s.collection &&
      Object.keys(s.verdicts).length === 0 &&
      !s.verdictsLoading &&
      !s.verdictsError
    ) {
      void loadVerdicts();
    }
  }, [
    s.boot,
    s.leagueInfo,
    s.collection,
    s.verdicts,
    s.verdictsLoading,
    s.verdictsError,
    loadVerdicts,
  ]);

  /** The blended rank (1-based), or null outside the blended order. */
  const rankOf = useCallback((id: string): number | null => blended.get(id) ?? null, [blended]);
  /** Sort key: the blended rank, then everything outside it by PvPoke's overall rank. */
  const metaKey = useCallback(
    (id: string): number =>
      blended.get(id) ?? UNRANKED + (metaRanks?.[id]?.overall ?? UNRANKED - 1),
    [blended, metaRanks],
  );
  /** Top 50 meta: the blended rank or PvPoke's role rank inside the cutoff. */
  const inTop = useCallback(
    (id: string): boolean => {
      const rank = blended.get(id);
      const role = metaRanks?.[id];
      return (
        (rank !== undefined && rank <= META_CUTOFF) ||
        (role?.roleRank !== null && role?.roleRank !== undefined && role.roleRank <= META_CUTOFF)
      );
    },
    [blended, metaRanks],
  );
  // Meta rank follows the stage the verdict is about, so a Swinub row ranks as Mamoswine.
  const metaSpecies = useCallback(
    (sp: Specimen): string => s.verdicts[sp.id]?.build?.speciesId ?? sp.speciesId,
    [s.verdicts],
  );
  // The pills are verdicts, so they never apply with nothing to judge.
  const pills = empty ? NO_PILLS : verdicts;

  const rows = useMemo(() => {
    if (!s.collection) {
      return [];
    }
    const parsed = parseQuery(query);
    const moves = s.data?.moves;
    const newest = s.collection.report.newestScan ?? '';
    const cutoff = newest ? new Date(newest.replace(' ', 'T')).getTime() - 14 * 86_400_000 : 0;
    const metaOf = (sp: Specimen): number => metaKey(metaSpecies(sp));
    let list = s.collection.specimens.filter((sp) => {
      const v = s.verdicts[sp.id];
      if (
        parsed.length > 0 &&
        !matchesQuery(parsed, specimenRecord(sp, name(sp.speciesId), species(sp.speciesId), moves))
      ) {
        return false;
      }
      if (pills.length > 0 && (!v || !pills.includes(v.label))) {
        return false;
      }
      if (!showIneligible && v?.label === 'Not eligible') {
        return false;
      }
      if (shadowsOnly && !sp.shadow) {
        return false;
      }
      if (recentOnly && new Date(sp.scannedAt.replace(' ', 'T')).getTime() < cutoff) {
        return false;
      }
      if (metaOnly && !inTop(metaSpecies(sp))) {
        return false;
      }
      return true;
    });
    const ivRankOf = (sp: Specimen): number => {
      const v = s.verdicts[sp.id];
      return v?.build ? v.build.ivRank.rank : 99_999;
    };
    // The name as the row shows it: a Shadow sorts under its own name, the flag beside it.
    const shownName = (sp: Specimen): string => name(sp.speciesId).replace(/^Shadow /, '');
    list = [...list].sort((a, b) => {
      if (sort === 'name') {
        return shownName(a).localeCompare(shownName(b)) || ivRankOf(a) - ivRankOf(b);
      }
      if (sort === 'rank') {
        return ivRankOf(a) - ivRankOf(b);
      }
      if (sort === 'meta') {
        return metaOf(a) - metaOf(b) || ivRankOf(a) - ivRankOf(b);
      }
      const va = s.verdicts[a.id]?.label;
      const vb = s.verdicts[b.id]?.label;
      const oa = va ? ORDER[va] : 9;
      const ob = vb ? ORDER[vb] : 9;
      return oa - ob || ivRankOf(a) - ivRankOf(b);
    });
    return list;
  }, [
    s.collection,
    s.verdicts,
    s.data,
    query,
    pills,
    showIneligible,
    shadowsOnly,
    recentOnly,
    metaOnly,
    sort,
    name,
    species,
    metaKey,
    metaSpecies,
    inTop,
  ]);

  /**
   * Every species the league admits that the collection has none of, in meta order. A specimen
   * covers its own species (Shadow forms are their own ids) and the one its verdict battles as,
   * so an owned Swinub building as Mamoswine collects Mamoswine. A verdict pill shows your own
   * Pokémon only, and nothing here was ever scanned.
   */
  const missing = useMemo(() => {
    if (!info || hideNotCollected || pills.length > 0 || recentOnly) {
      return [];
    }
    const have = new Set<string>();
    for (const sp of s.collection?.specimens ?? []) {
      // A Shadow copy owns its Shadow id only, so plain Azumarill stays listed as not collected.
      have.add(ownSpeciesId(sp));
      const battles = s.verdicts[sp.id]?.build?.speciesId;
      if (battles) {
        have.add(battles);
      }
    }
    const parsed = parseQuery(query);
    const shownName = (id: string): string => name(id).replace(/^Shadow /, '');
    // Without a search, only the ranked part of the league; a search reaches all of it.
    const listed = (id: string): boolean =>
      blended.has(id) || (metaRanks?.[id]?.overall ?? Infinity) <= NOT_COLLECTED_TOP;
    return info.legal
      .filter(
        (id) =>
          !have.has(id) &&
          (parsed.length === 0
            ? listed(id)
            : matchesQuery(parsed, speciesRecord(id, name(id), species(id)))) &&
          (!shadowsOnly || id.endsWith('_shadow')) &&
          (!metaOnly || inTop(id)),
      )
      .sort((a, b) => metaKey(a) - metaKey(b) || shownName(a).localeCompare(shownName(b)));
  }, [
    info,
    hideNotCollected,
    pills,
    recentOnly,
    s.collection,
    s.verdicts,
    query,
    shadowsOnly,
    metaOnly,
    name,
    species,
    inTop,
    metaKey,
    blended,
    metaRanks,
  ]);

  /**
   * Same species and shadow status folded together. Each group shows the copy that earned its
   * place in the list: the first one in the active sort (the best verdict under Verdict, the best
   * IVs under IV rank), with the others after it in the same order. Travis, 2026-09-27: a "Wait
   * for better IVs" row sat among the Worth building rows because it showed the best-IV copy.
   */
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; best: Specimen; others: Specimen[] }>();
    for (const sp of rows) {
      const key = grouped ? `${sp.speciesId}|${sp.shadow ? 1 : 0}` : sp.id;
      const g = byKey.get(key);
      if (!g) {
        byKey.set(key, { key, best: sp, others: [] });
      } else {
        g.others.push(sp);
      }
    }
    return [...byKey.values()];
  }, [rows, grouped]);

  /** Your groups and the species you have none of: interleaved by meta rank under Meta rank,
   * otherwise yours first in the active sort and the rest after, in meta order. */
  const items = useMemo((): Item[] => {
    const mine: Item[] = groups.map((g) => ({ kind: 'mine', ...g }));
    const rest: Item[] = missing.map((id) => ({ kind: 'missing', key: `missing|${id}`, id }));
    if (sort !== 'meta') {
      return [...mine, ...rest];
    }
    const keyOf = (it: Item): number =>
      it.kind === 'mine' ? metaKey(metaSpecies(it.best)) : metaKey(it.id);
    const out: Item[] = [];
    let i = 0;
    let j = 0;
    while (i < mine.length || j < rest.length) {
      const a = mine[i];
      const b = rest[j];
      if (a && (!b || keyOf(a) <= keyOf(b))) {
        out.push(a);
        i += 1;
      } else if (b) {
        out.push(b);
        j += 1;
      }
    }
    return out;
  }, [groups, missing, sort, metaKey, metaSpecies]);

  /** The tag line's rank pills for a species: blended rank, trend, PvPoke's role tag. */
  const rankTags = (id: string) => (
    <MetaRankTags rank={rankOf(id)} delta={meta?.trend.get(id)} role={metaRanks?.[id]} />
  );

  // Restore the scroll only against the final order: the blended ranking reorders the rows when
  // it lands, so an offset restored before then would point at different Pokémon.
  useScrollMemory('collection.scroll', items.length > 0 && !s.verdictsLoading && rankSettled);
  // Ruling 4: every switch that differs from its default counts, Group same Pokémon (on by
  // default) included.
  const filtersOn = [
    hideNotCollected,
    showIneligible,
    shadowsOnly,
    recentOnly,
    metaOnly,
    !grouped,
  ].filter(Boolean).length;
  const notCollected = missing.length > 0 ? `${SEP}${num(missing.length)} not collected` : '';
  const count = empty
    ? `${num(missing.length)} Pokémon in ${league.title}`
    : grouped
      ? `${num(rows.length)} Pokémon${SEP}${num(groups.length)} ${groups.length === 1 ? 'kind' : 'kinds'}${notCollected}`
      : `${num(rows.length)} shown${notCollected}`;
  // With nothing collected the list is the league's, so it waits for the league's data; your own
  // Pokémon filtered to nothing is "nothing matches" whatever the league data is doing.
  const leagueWait = empty && info === null;
  const nothing = items.length === 0 && !s.verdictsLoading && !leagueWait;
  return (
    <div className="screen">
      <div className="page-head flow">
        <CollectionHeader openSheet={openSheet} empty={empty} />
        <LeagueSwitcher />
      </div>
      <div className="sticky-bar">
        <div className="search-row">
          <div className="search-wrap">
            <input
              className="search"
              type="search"
              enterKeyHint="search"
              placeholder="Search Pokémon"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              inputMode="search"
            />
            {query ? (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                &times;
              </button>
            ) : null}
          </div>
          <FilterButton iconOnly count={filtersOn} onClick={() => setFiltersOpen(true)} />
        </div>
      </div>
      <div className="page-head flow under">
        {empty ? null : (
          <div className="chips tight">
            {PILLS.map((pill) => (
              <Chip
                key={pill.label}
                on={verdicts.includes(pill.label)}
                onClick={() =>
                  setVerdicts((cur) =>
                    cur.includes(pill.label)
                      ? cur.filter((x) => x !== pill.label)
                      : [...cur, pill.label],
                  )
                }
              >
                {pill.short}
              </Chip>
            ))}
          </div>
        )}
        <div className="sort-row">
          {/* Nothing matching reads as the empty state below, not as "0 Pokémon"; while judging,
              the count stays. The span stays too, so Sort keeps its place on the right. */}
          <span className="meta">{nothing || leagueWait ? null : count}</span>
          <InlineSelect<Sort> label="Sort" value={sort} options={SORTS} onChange={setSort} />
        </div>
      </div>
      <div className="scroll" style={{ gap: 0, paddingTop: 4 }}>
        {s.verdictsLoading ? (
          <Progress
            stage="verdicts"
            done={s.progress?.stage === 'verdicts' ? s.progress.done : 0}
            total={s.progress?.stage === 'verdicts' ? s.progress.total : 0}
          />
        ) : null}
        {s.verdictsError ? <ErrorState line={judgeFailedLine(s.verdictsError)} /> : null}
        {leagueWait ? <Loading label={`Loading ${league.title}`} /> : null}
        {items.map((g) => {
          if (g.kind === 'missing') {
            return (
              <div className="spec-group" key={g.key}>
                <a className="spec-row" href={hashFor({ screen: 'species', id: g.id })}>
                  <PokemonToken speciesId={g.id} size={44} />
                  <span style={{ minWidth: 0 }}>
                    <span className="spec-name">
                      {name(g.id).replace(/^Shadow /, '')}
                      {g.id.endsWith('_shadow') ? (
                        <span className="shadow-flag">Shadow</span>
                      ) : null}
                    </span>
                    <span className="mtags">{rankTags(g.id)}</span>
                  </span>
                  {/* With nothing collected every row would say it, so none does. */}
                  {empty ? <span /> : <Tag tone="neutral">Not collected</Tag>}
                </a>
              </div>
            );
          }
          const sp = g.best;
          const v = s.verdicts[sp.id];
          const isOpen = open.has(g.key);
          const nextBest = g.others[0];
          const nextRaw = nextBest ? rankLabel(nextBest, s.verdicts[nextBest.id]) : null;
          const nextLabel = nextRaw && nextRaw.startsWith('Top ') ? nextRaw : null;
          return (
            <div className="spec-group" key={g.key}>
              <a
                className={`spec-row${v?.ineligible === 'banned' ? ' banned' : ''}`}
                href={hashFor({ screen: 'specimen', id: sp.id })}
              >
                <PokemonToken
                  speciesId={sp.speciesId}
                  size={44}
                  markedMega={Boolean(sp.megaForm)}
                />
                <span style={{ minWidth: 0 }}>
                  <span className="spec-name">
                    {name(sp.speciesId).replace(/^Shadow /, '')}
                    {sp.shadow ? <span className="shadow-flag">Shadow</span> : null}
                    {v?.ineligible === 'banned' ? <span className="ban-flag">Banned</span> : null}
                  </span>
                  <span className="meta" style={{ display: 'block' }}>
                    CP {sp.cp} · {rankLabel(sp, v)}
                  </span>
                  <span className="mtags">
                    {rankTags(v?.build?.speciesId ?? sp.speciesId)}
                    <HundoTag delta={v?.perfectDelta ?? null} />
                    {isExcluded(sp.id) ? <Tag tone="neutral">Excluded</Tag> : null}
                  </span>
                </span>
                {v ? <VerdictTag label={v.label} /> : <span className="meta">...</span>}
              </a>
              {g.others.length > 0 ? (
                <button
                  type="button"
                  className={`more-btn${isOpen ? ' on' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((cur) => {
                      const next = new Set(cur);
                      if (next.has(g.key)) {
                        next.delete(g.key);
                      } else {
                        next.add(g.key);
                      }
                      return next;
                    })
                  }
                >
                  {isOpen
                    ? 'Hide the others'
                    : `${g.others.length} more${nextLabel ? `, next ${nextLabel}` : ''}`}
                  <Chevron dir={isOpen ? 'up' : 'down'} />
                </button>
              ) : null}
              {isOpen
                ? g.others.map((o) => {
                    const ov = s.verdicts[o.id];
                    return (
                      <a
                        className="spec-row sub"
                        key={o.id}
                        href={hashFor({ screen: 'specimen', id: o.id })}
                      >
                        <span />
                        <span style={{ minWidth: 0 }}>
                          <span className="meta" style={{ display: 'block' }}>
                            CP {o.cp} · {rankLabel(o, ov)} · Level {o.level.max}
                            {o.lucky ? ' · Lucky' : ''}
                          </span>
                          {isExcluded(o.id) ? (
                            <span className="mtags">
                              <Tag tone="neutral">Excluded</Tag>
                            </span>
                          ) : null}
                        </span>
                        {ov ? <VerdictTag label={ov.label} /> : <span className="meta">...</span>}
                      </a>
                    );
                  })
                : null}
            </div>
          );
        })}
        {nothing ? <Empty line="Nothing matches. Try another name or clear a filter." /> : null}
      </div>
      {filtersOpen ? <CollectionFilters onClose={() => setFiltersOpen(false)} /> : null}
    </div>
  );
}
