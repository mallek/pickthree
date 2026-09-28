import type { Specimen, VerdictLabel } from '@pickthree/engine';
import {
  Chevron,
  Empty,
  ErrorState,
  FilterButton,
  Header,
  IconButton,
  InlineSelect,
  SiteLink,
  Tag,
  type ChoiceOption,
} from '@pickthree/ui';
import { useEffect, useMemo, useState } from 'react';
import {
  Chip,
  CogGlyph,
  HundoTag,
  MetaTags,
  PokemonToken,
  Progress,
  VerdictTag,
  useMetaRank,
  useName,
  useScrollMemory,
  useSpecies,
  useSticky,
  NoCollection,
} from '../components.tsx';
import { judgeFailedLine, metaTags, num, SEP } from '../format.ts';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { matchesQuery, parseQuery } from '../search.ts';
import { specimenRecord } from '../searchRecords.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { CollectionFilters } from './CollectionFilters.tsx';

type Sort = 'verdict' | 'rank' | 'meta' | 'name';
const SORTS: ChoiceOption<Sort>[] = [
  { value: 'verdict', label: 'Verdict' },
  { value: 'rank', label: 'IV rank' },
  { value: 'meta', label: 'Meta rank' },
  { value: 'name', label: 'Name' },
];

/** A plus, the Add a Pokémon glyph for an IconButton: 20px, drawn like MetaGlyph. */
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

/** The tab's own header: its title, Add a Pokémon, the meta.pick3.gg link and Settings. */
function CollectionHeader({ openSheet }: { openSheet: () => void }) {
  return (
    <Header
      variant="top"
      title="Collection"
      actions={
        <>
          <IconButton label="Add a Pokémon" href={hashFor({ screen: 'add' })}>
            <PlusGlyph />
          </IconButton>
          <SiteLink site="meta" />
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

export function rankLabel(
  s: Specimen,
  verdict:
    | {
        build: { ivRank: { rank: number; total: number } } | null;
        label: VerdictLabel;
        ineligible?: 'banned' | 'over-cap' | null;
      }
    | undefined,
): string {
  if (!s.ivs) {
    return 'IVs unknown';
  }
  if (!verdict) {
    return 'Ranking...';
  }
  if (verdict.label === 'Not eligible' || !verdict.build) {
    return verdict.ineligible === 'banned' ? 'Banned in this league' : 'Over the CP cap';
  }
  const r = verdict.build.ivRank;
  return `Top ${Math.max(1, Math.round((r.rank / r.total) * 100))}%`;
}

export function Collection() {
  const s = useAppState();
  const { navigate, loadVerdicts, openSheet } = useActions();
  const name = useName();
  const species = useSpecies();
  const metaRank = useMetaRank();
  const [query, setQuery] = useSticky('collection.query', '');
  // Verdict pills are a multi-select; nothing picked means everything.
  const [verdicts, setVerdicts] = useSticky<VerdictLabel[]>('collection.verdicts', []);
  // The Filters sheet writes these same keys; useSticky shares one value between the two.
  const [showIneligible] = useSticky('collection.showIneligible', false);
  const [shadowsOnly] = useSticky('collection.shadows', false);
  const [recentOnly] = useSticky('collection.recent', false);
  const [metaOnly] = useSticky('collection.meta', false);
  const [sort, setSort] = useSticky<Sort>('collection.sort', 'verdict');
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

  const rows = useMemo(() => {
    if (!s.collection) {
      return [];
    }
    const parsed = parseQuery(query);
    const moves = s.data?.moves;
    const newest = s.collection.report.newestScan ?? '';
    const cutoff = newest ? new Date(newest.replace(' ', 'T')).getTime() - 14 * 86_400_000 : 0;
    // Meta rank follows the stage the verdict is about, so a Swinub row ranks as Mamoswine.
    const metaSpecies = (sp: Specimen): string =>
      s.verdicts[sp.id]?.build?.speciesId ?? sp.speciesId;
    const metaOf = (sp: Specimen): number => metaRank(metaSpecies(sp))?.overall ?? 9999;
    let list = s.collection.specimens.filter((sp) => {
      const v = s.verdicts[sp.id];
      if (
        parsed.length > 0 &&
        !matchesQuery(parsed, specimenRecord(sp, name(sp.speciesId), species(sp.speciesId), moves))
      ) {
        return false;
      }
      if (verdicts.length > 0 && (!v || !verdicts.includes(v.label))) {
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
      if (metaOnly && metaTags(metaRank(metaSpecies(sp))).length === 0) {
        return false;
      }
      return true;
    });
    const rankOf = (sp: Specimen): number => {
      const v = s.verdicts[sp.id];
      return v?.build ? v.build.ivRank.rank : 99_999;
    };
    // The name as the row shows it: a Shadow sorts under its own name, the flag beside it.
    const shownName = (sp: Specimen): string => name(sp.speciesId).replace(/^Shadow /, '');
    list = [...list].sort((a, b) => {
      if (sort === 'name') {
        return shownName(a).localeCompare(shownName(b)) || rankOf(a) - rankOf(b);
      }
      if (sort === 'rank') {
        return rankOf(a) - rankOf(b);
      }
      if (sort === 'meta') {
        return metaOf(a) - metaOf(b) || rankOf(a) - rankOf(b);
      }
      const va = s.verdicts[a.id]?.label;
      const vb = s.verdicts[b.id]?.label;
      const oa = va ? ORDER[va] : 9;
      const ob = vb ? ORDER[vb] : 9;
      return oa - ob || rankOf(a) - rankOf(b);
    });
    return list;
  }, [
    s.collection,
    s.verdicts,
    s.data,
    query,
    verdicts,
    showIneligible,
    shadowsOnly,
    recentOnly,
    metaOnly,
    sort,
    name,
    species,
    metaRank,
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

  // Every hook runs before the empty-state return, so the hook order never changes between
  // renders of one mounted screen.
  useScrollMemory('collection.scroll', groups.length > 0 && !s.verdictsLoading);
  if (!s.collection) {
    return (
      <div className="screen">
        <div className="page-head">
          <CollectionHeader openSheet={openSheet} />
        </div>
        <NoCollection navigate={navigate} />
      </div>
    );
  }
  // Ruling 4: every switch that differs from its default counts, Group same Pokémon (on by
  // default) included.
  const filtersOn = [showIneligible, shadowsOnly, recentOnly, metaOnly, !grouped].filter(
    Boolean,
  ).length;
  const count = grouped
    ? `${num(rows.length)} Pokémon${SEP}${num(groups.length)} ${groups.length === 1 ? 'kind' : 'kinds'}`
    : `${num(rows.length)} shown`;
  return (
    <div className="screen">
      <div className="page-head flow">
        <CollectionHeader openSheet={openSheet} />
        <LeagueSwitcher />
      </div>
      <div className="sticky-bar">
        <div className="search-row">
          <div className="search-wrap">
            <input
              className="search"
              type="search"
              enterKeyHint="search"
              placeholder="Search your Pokémon"
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
        <div className="sort-row">
          {/* Nothing matching reads as the empty state below, not as "0 Pokémon"; while judging,
              the count stays. The span stays too, so Sort keeps its place on the right. */}
          <span className="meta">{rows.length === 0 && !s.verdictsLoading ? null : count}</span>
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
        {groups.map((g) => {
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
                <PokemonToken speciesId={sp.speciesId} size={44} />
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
                    <MetaTags speciesId={v?.build?.speciesId ?? sp.speciesId} />
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
        {rows.length === 0 && !s.verdictsLoading ? (
          <Empty line="Nothing matches. Try another name or clear a filter." />
        ) : null}
      </div>
      {filtersOpen ? <CollectionFilters onClose={() => setFiltersOpen(false)} /> : null}
    </div>
  );
}
