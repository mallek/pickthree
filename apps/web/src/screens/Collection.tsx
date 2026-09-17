import type { Specimen, VerdictLabel } from '@pickthree/engine';
import { useEffect, useMemo } from 'react';
import {
  Chip,
  HeadCog,
  HundoTag,
  MetaTags,
  PokemonToken,
  Progress,
  VerdictChip,
  useMetaRank,
  useName,
  useScrollMemory,
  useSpecies,
  useSticky,
  NoCollection,
} from '../components.tsx';
import { metaTags } from '../format.ts';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { matchesQuery, parseQuery } from '../search.ts';
import { specimenRecord } from '../searchRecords.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';

/** Quick pills: short labels so all four fit without scrolling. Ineligible rows hide by default. */
const PILLS: { label: VerdictLabel; short: string }[] = [
  { label: 'Ready to use', short: 'Ready' },
  { label: 'Worth building', short: 'Worth it' },
  { label: 'Wait for better IVs', short: 'Wait for IVs' },
  { label: 'Needs rescan', short: 'Rescan' },
];
const ORDER: Record<VerdictLabel, number> = {
  'Ready to use': 0,
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
  const { navigate, loadVerdicts } = useActions();
  const name = useName();
  const species = useSpecies();
  const metaRank = useMetaRank();
  const [query, setQuery] = useSticky('collection.query', '');
  // Verdict pills are a multi-select; nothing picked means everything.
  const [verdicts, setVerdicts] = useSticky<VerdictLabel[]>('collection.verdicts', []);
  const [showIneligible, setShowIneligible] = useSticky('collection.showIneligible', false);
  const [shadowsOnly, setShadowsOnly] = useSticky('collection.shadows', false);
  const [recentOnly, setRecentOnly] = useSticky('collection.recent', false);
  const [metaOnly, setMetaOnly] = useSticky('collection.meta', false);
  const [sort, setSort] = useSticky<'verdict' | 'rank' | 'meta' | 'name'>(
    'collection.sort',
    'verdict',
  );
  const [grouped, setGrouped] = useSticky('collection.grouped', true);
  const [open, setOpen] = useSticky<Set<string>>('collection.open', new Set());
  const [settingsOpen, setSettingsOpen] = useSticky('collection.settingsOpen', false);

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
    list = [...list].sort((a, b) => {
      if (sort === 'name') {
        return name(a.speciesId).localeCompare(name(b.speciesId));
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

  const rankOfSpecimen = (sp: Specimen): number => {
    const v = s.verdicts[sp.id];
    return v?.build ? v.build.ivRank.rank : 99_999;
  };
  /** Same species and shadow status folded together, best IV rank on top, list order kept. */
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; best: Specimen; others: Specimen[] }>();
    for (const sp of rows) {
      const key = grouped ? `${sp.speciesId}|${sp.shadow ? 1 : 0}` : sp.id;
      const g = byKey.get(key);
      if (!g) {
        byKey.set(key, { key, best: sp, others: [] });
      } else if (rankOfSpecimen(sp) < rankOfSpecimen(g.best)) {
        g.others.push(g.best);
        g.best = sp;
      } else {
        g.others.push(sp);
      }
    }
    for (const g of byKey.values()) {
      g.others.sort((a, b) => rankOfSpecimen(a) - rankOfSpecimen(b));
    }
    return [...byKey.values()];
  }, [rows, grouped, s.verdicts]);

  // Every hook runs before the empty-state return, so the hook order never changes between
  // renders of one mounted screen.
  useScrollMemory('collection.scroll', groups.length > 0 && !s.verdictsLoading);
  if (!s.collection) {
    return (
      <div className="screen">
        <NoCollection navigate={navigate} />
      </div>
    );
  }
  const sortLabels = { verdict: 'Verdict', rank: 'IV rank', meta: 'Meta rank', name: 'Name' };
  const nextSort = { verdict: 'rank', rank: 'meta', meta: 'name', name: 'verdict' } as const;
  const filtersOn = [showIneligible, shadowsOnly, recentOnly, metaOnly].filter(Boolean).length;
  const settingsOn = filtersOn > 0 || !grouped;
  return (
    <div className="screen">
      <div className="page-head flow">
        <div className="between">
          <h2>Collection</h2>
          <span className="row" style={{ gap: 10, alignItems: 'center' }}>
            <span className="meta">
              {grouped && groups.length !== rows.length
                ? `${rows.length} Pokémon · ${groups.length} kinds`
                : `${rows.length} shown`}
            </span>
            <button
              type="button"
              className="mini-chip on"
              onClick={() => navigate({ screen: 'add' })}
            >
              + Add
            </button>
            <HeadCog />
          </span>
        </div>
        <LeagueSwitcher compact />
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
          <button
            type="button"
            className={`cog${settingsOn ? ' active' : ''}${settingsOpen ? ' open' : ''}`}
            aria-label="List settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((x) => !x)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
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
          {filtersOn > 0 ? (
            <button type="button" className="filters-hint" onClick={() => setSettingsOpen(true)}>
              {filtersOn} {filtersOn === 1 ? 'filter' : 'filters'} on
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="sort-toggle"
            onClick={() => setSort((x) => nextSort[x])}
            aria-label={`Sort by ${sortLabels[sort]}, tap to change`}
          >
            Sort: {sortLabels[sort]} <span aria-hidden="true">&#8645;</span>
          </button>
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
        {s.verdictsError ? (
          <div className="error" style={{ margin: '8px 0' }}>
            Could not judge this collection: {s.verdictsError}. The list still works; verdicts will
            retry on the next import.
          </div>
        ) : null}
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
                  </span>
                </span>
                {v ? <VerdictChip label={v.label} /> : <span className="meta">...</span>}
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
                    : `${g.others.length} more${nextLabel ? `, next best ${nextLabel}` : ''}`}
                  <span className="more-caret">{isOpen ? '\u2303' : '\u2304'}</span>
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
                        </span>
                        {ov ? <VerdictChip label={ov.label} /> : <span className="meta">...</span>}
                      </a>
                    );
                  })
                : null}
            </div>
          );
        })}
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: '32px 12px', textAlign: 'center' }}>
            Nothing matches. Try another name or clear a filter.
          </p>
        ) : null}
      </div>
      {settingsOpen ? (
        <>
          <div
            className="overlay clear"
            onClick={() => setSettingsOpen(false)}
            aria-hidden="true"
          />
          <div className="popover" role="dialog" aria-label="List settings">
            <div className="between" style={{ marginBottom: 4 }}>
              <b>List settings</b>
              <button type="button" className="btn-ghost" onClick={() => setSettingsOpen(false)}>
                Done
              </button>
            </div>
            {(
              [
                [
                  'Show ineligible',
                  'Pokémon over the cap or banned here',
                  showIneligible,
                  setShowIneligible,
                ],
                ['Shadows only', 'Just the Shadow Pokémon', shadowsOnly, setShadowsOnly],
                ['Scanned recently', 'Last two weeks of scans', recentOnly, setRecentOnly],
                [
                  'Top 50 meta',
                  'Only species in the top 50 for this league',
                  metaOnly,
                  setMetaOnly,
                ],
                ['Group same Pokémon', 'One row per species, best first', grouped, setGrouped],
              ] as const
            ).map(([label, sub, on, set]) => (
              <button
                type="button"
                className="toggle"
                key={label}
                onClick={() => set((x) => !x)}
                aria-pressed={on}
              >
                <span>
                  <span style={{ display: 'block', fontSize: 15 }}>{label}</span>
                  <span className="meta">{sub}</span>
                </span>
                <span className={`switch${on ? ' on' : ''}`} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
