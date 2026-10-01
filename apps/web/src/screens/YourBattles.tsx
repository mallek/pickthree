import {
  DEFAULT_PROFILE_OPTIONS,
  seasonListStale,
  yourMetaStats,
  type SeasonStats,
  type SpeciesRecord,
} from '@pickthree/engine';
import { Button, Chevron, ConfirmSheet, Header, IconButton } from '@pickthree/ui';
import { useMemo, useState } from 'react';
import { CogGlyph, Seg, useSticky } from '../components.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import {
  battlesWord,
  isRunLeague,
  ProgressLine,
  SpeciesRows,
  TeamRows,
} from '../components/meta/LogPieces.tsx';
import { shareEnabled } from '../metaShare.ts';
import { seasonsFor } from '../state/seasonsFor.ts';
import { useActions, useAppState } from '../state/store.tsx';

type Sort = 'faced' | 'losses';

/** The mark's meaning, said once under the list that first shows it. */
function OutsideLegend({ size }: { size: number }) {
  return (
    <p className="meta faced-legend">
      <span aria-hidden="true">† </span>
      Outside PvPoke&apos;s {size}: logged here, simulated on this phone.
    </p>
  );
}

function sorted(stats: SeasonStats, sort: Sort): SpeciesRecord[] {
  return sort === 'losses'
    ? [...stats.species].sort((a, b) => b.losses - a.losses || b.faced - a.faced)
    : stats.species;
}

/** Your battles: what the player faced and how their teams did, season by season. */
export function YourBattles() {
  const s = useAppState();
  const run = isRunLeague(s);
  const { startFresh, openSheet, back } = useActions();
  const leagueId = s.settings.league ?? 'great';
  const seasons = seasonsFor(s.data, leagueId);
  const freshFrom = s.settings.yourMeta?.freshFrom?.[leagueId] ?? null;
  const meta = s.leagueInfo?.meta ?? [];
  const fallback = useMemo(() => {
    const ranks = s.leagueInfo?.metaRanks ?? {};
    return [...meta].sort((a, b) => (ranks[a]?.overall ?? 999) - (ranks[b]?.overall ?? 999));
  }, [meta, s.leagueInfo]);
  const stats = useMemo(
    () => yourMetaStats({ sets: s.sets, seasons, freshFrom, fallback }),
    [s.sets, seasons, freshFrom, fallback],
  );
  const min = DEFAULT_PROFILE_OPTIONS.minBattles;
  const stale = seasonListStale(s.data?.seasons ?? []);
  const [sort, setSort] = useSticky<Sort>('meta.sort', 'faced');
  const [explained, setExplained] = useSticky('meta.explained', false);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  // Before the league's meta group loads, nothing is marked: an empty group would mark every row.
  const inMeta = useMemo(() => new Set(meta), [meta]);
  const outside = (id: string): boolean => inMeta.size > 0 && !inMeta.has(id);
  const hasOutside = (b: SeasonStats): boolean => b.species.some((r) => outside(r.speciesId));
  const legendInCurrent = hasOutside(stats.current);
  const legendInEarlier = !legendInCurrent && earlierOpen && stats.earlier.some(hasOutside);
  const sharing = shareEnabled(s.settings);

  return (
    <div className="screen">
      <div className="page-head">
        <Header
          variant="sub"
          title="Your battles"
          back={{ label: 'Back', onClick: () => back({ screen: 'meta' }) }}
          actions={
            <IconButton label="Settings" onClick={openSheet}>
              <CogGlyph />
            </IconButton>
          }
        />
        <LeagueSwitcher />
        <ProgressLine />
      </div>
      <div className="scroll" style={{ gap: 18 }}>
        {stale ? (
          <div className="card" style={{ borderColor: 'var(--warn-tint)', gap: 8 }}>
            <span className="small">The season list may be out of date.</span>
            <Button onClick={() => setConfirmFresh(true)}>Start fresh</Button>
          </div>
        ) : null}
        {confirmFresh ? (
          <ConfirmSheet
            title="Start fresh?"
            line={
              run
                ? 'Battles before now move to Earlier runs. Nothing is deleted.'
                : 'Battles before now move to Earlier seasons. Nothing is deleted.'
            }
            confirmLabel="Start fresh"
            cancelLabel="Cancel"
            onConfirm={() => {
              setConfirmFresh(false);
              startFresh();
            }}
            onCancel={() => setConfirmFresh(false)}
          />
        ) : null}
        {!explained ? (
          <div className="card explainer">
            <button
              type="button"
              className="card-x"
              aria-label="Dismiss"
              onClick={() => setExplained(true)}
            >
              &times;
            </button>
            <span className="small">
              {`Once you log ${min} battles, Teams, Counters and Build weigh opponents by how often you face them. Your collection never leaves this phone; battle records are shared anonymously unless you turn sharing off in Settings.`}
            </span>
          </div>
        ) : null}
        <div className="stack" style={{ gap: 8 }}>
          <div className="between ym-list-head">
            <span className="meta">
              {stats.current.label} · {battlesWord(stats.current.battles)}
            </span>
            <Seg
              value={sort}
              onChange={setSort}
              options={[
                { value: 'faced', label: 'Most faced' },
                { value: 'losses', label: 'Worst record' },
              ]}
            />
          </div>
          <SpeciesRows rows={sorted(stats.current, sort)} outside={outside} />
          {legendInCurrent ? <OutsideLegend size={meta.length} /> : null}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <b>Your teams</b>
          <TeamRows rows={stats.current.teams} />
        </div>
        {stats.earlier.length > 0 ? (
          <div className="stack" style={{ gap: 10 }}>
            <button type="button" className="action-row" onClick={() => setEarlierOpen((o) => !o)}>
              <span>
                <b>{run ? 'Earlier runs' : 'Earlier seasons'}</b>
                <span className="small muted">
                  {stats.earlier.length} {stats.earlier.length === 1 ? 'bucket' : 'buckets'}, kept
                  apart because the meta changes each {run ? 'run' : 'season'}.
                </span>
              </span>
              <span className="chev">
                <Chevron dir={earlierOpen ? 'down' : 'right'} />
              </span>
            </button>
            {earlierOpen
              ? stats.earlier.map((b) => (
                  <div className="card" key={b.label} style={{ gap: 12 }}>
                    <div className="between">
                      <b>{b.label}</b>
                      <span className="meta">{battlesWord(b.battles)}</span>
                    </div>
                    <SpeciesRows rows={sorted(b, sort)} outside={outside} />
                    <TeamRows rows={b.teams} />
                  </div>
                ))
              : null}
            {legendInEarlier ? <OutsideLegend size={meta.length} /> : null}
          </div>
        ) : null}
        <p className="meta ym-foot">
          {sharing
            ? 'Your collection stays on this phone. Battle sharing is on and anonymous; change it in Settings.'
            : 'Battle sharing is off; change it in Settings.'}
        </p>
      </div>
    </div>
  );
}
