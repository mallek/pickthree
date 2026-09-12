import type { Specimen, VerdictLabel } from '@pickthree/engine';
import { useEffect, useMemo, useState } from 'react';
import { Chip, PokemonToken, Progress, VerdictChip, useName } from '../components.tsx';
import { hashFor, useActions, useAppState } from '../state/store.tsx';

const VERDICTS: ('All' | VerdictLabel)[] = [
  'All',
  'Great League ready',
  'Worth building',
  'Wait for better IVs',
  'Not eligible',
  'Needs rescan',
];
const ORDER: Record<VerdictLabel, number> = {
  'Great League ready': 0,
  'Worth building': 1,
  'Wait for better IVs': 2,
  'Not eligible': 3,
  'Needs rescan': 4,
};

export function rankLabel(
  s: Specimen,
  verdict:
    { build: { ivRank: { rank: number; total: number } } | null; label: VerdictLabel } | undefined,
): string {
  if (!s.ivs) {
    return 'IVs unknown';
  }
  if (!verdict) {
    return 'Ranking...';
  }
  if (verdict.label === 'Not eligible' || !verdict.build) {
    return 'Over 1500 CP';
  }
  const r = verdict.build.ivRank;
  return `Top ${Math.max(1, Math.round((r.rank / r.total) * 100))}%`;
}

export function Collection() {
  const s = useAppState();
  const { navigate, loadVerdicts } = useActions();
  const name = useName();
  const [query, setQuery] = useState('');
  const [verdict, setVerdict] = useState<'All' | VerdictLabel>('All');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [shadowsOnly, setShadowsOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [sort, setSort] = useState<'verdict' | 'rank' | 'name'>('verdict');

  useEffect(() => {
    if (
      s.boot === 'ready' &&
      s.collection &&
      Object.keys(s.verdicts).length === 0 &&
      !s.verdictsLoading
    ) {
      void loadVerdicts();
    }
  }, [s.boot, s.collection, s.verdicts, s.verdictsLoading, loadVerdicts]);

  const rows = useMemo(() => {
    if (!s.collection) {
      return [];
    }
    const q = query.trim().toLowerCase();
    const newest = s.collection.report.newestScan ?? '';
    const cutoff = newest ? new Date(newest.replace(' ', 'T')).getTime() - 14 * 86_400_000 : 0;
    let list = s.collection.specimens.filter((sp) => {
      const v = s.verdicts[sp.id];
      const nm = name(sp.speciesId).toLowerCase();
      if (q && !nm.includes(q)) {
        return false;
      }
      if (verdict !== 'All' && v?.label !== verdict) {
        return false;
      }
      if (eligibleOnly && v?.label === 'Not eligible') {
        return false;
      }
      if (shadowsOnly && !sp.shadow) {
        return false;
      }
      if (recentOnly && new Date(sp.scannedAt.replace(' ', 'T')).getTime() < cutoff) {
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
      const va = s.verdicts[a.id]?.label;
      const vb = s.verdicts[b.id]?.label;
      const oa = va ? ORDER[va] : 9;
      const ob = vb ? ORDER[vb] : 9;
      return oa - ob || rankOf(a) - rankOf(b);
    });
    return list;
  }, [s.collection, s.verdicts, query, verdict, eligibleOnly, shadowsOnly, recentOnly, sort, name]);

  if (!s.collection) {
    return (
      <div className="screen">
        <div className="boot">
          <p>No collection yet.</p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate({ screen: 'welcome' })}
          >
            Import a Poke Genie CSV
          </button>
        </div>
      </div>
    );
  }
  const sortLabels = { verdict: 'Verdict', rank: 'IV rank', name: 'Name' };
  return (
    <div className="screen">
      <div className="page-head">
        <div className="between">
          <h2>Collection</h2>
          <span className="meta">{rows.length} shown</span>
        </div>
        <input
          className="search"
          placeholder="Search your Pokemon"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
        />
        <div className="chips">
          {VERDICTS.map((v) => (
            <Chip key={v} on={verdict === v} onClick={() => setVerdict(v)}>
              {v}
            </Chip>
          ))}
        </div>
        <div className="toggle-row">
          <button
            type="button"
            className={`mini-chip${eligibleOnly ? ' on' : ''}`}
            onClick={() => setEligibleOnly((x) => !x)}
          >
            Eligible only
          </button>
          <button
            type="button"
            className={`mini-chip${shadowsOnly ? ' on' : ''}`}
            onClick={() => setShadowsOnly((x) => !x)}
          >
            Shadows
          </button>
          <button
            type="button"
            className={`mini-chip${recentOnly ? ' on' : ''}`}
            onClick={() => setRecentOnly((x) => !x)}
          >
            Scanned recently
          </button>
          <button
            type="button"
            className="btn-ghost"
            style={{ marginLeft: 'auto', fontSize: 12, minHeight: 32 }}
            onClick={() =>
              setSort((x) => (x === 'verdict' ? 'rank' : x === 'rank' ? 'name' : 'verdict'))
            }
          >
            Sort: {sortLabels[sort]} &#8645;
          </button>
        </div>
      </div>
      <div className="scroll" style={{ gap: 0, paddingTop: 4 }}>
        {s.verdictsLoading && Object.keys(s.verdicts).length === 0 ? (
          <Progress stage="verdicts" done={0} total={0} />
        ) : null}
        {rows.map((sp) => {
          const v = s.verdicts[sp.id];
          return (
            <a className="spec-row" key={sp.id} href={hashFor({ screen: 'specimen', id: sp.id })}>
              <PokemonToken speciesId={sp.speciesId} size={44} />
              <span style={{ minWidth: 0 }}>
                <span className="spec-name">
                  {name(sp.speciesId).replace(/^Shadow /, '')}
                  {sp.shadow ? <span className="shadow-flag">Shadow</span> : null}
                </span>
                <span className="meta" style={{ display: 'block' }}>
                  CP {sp.cp} · {rankLabel(sp, v)}
                </span>
              </span>
              {v ? <VerdictChip label={v.label} /> : <span className="meta">...</span>}
            </a>
          );
        })}
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: '32px 12px', textAlign: 'center' }}>
            Nothing matches. Try another name or clear a filter.
          </p>
        ) : null}
      </div>
    </div>
  );
}
