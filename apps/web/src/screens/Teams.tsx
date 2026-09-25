import type { FacingSource, TeamRecommendation } from '@pickthree/engine';
import type { WindowKey } from '@pickthree/engine/meta';
import {
  Button,
  Empty,
  ErrorState,
  ExpandRow,
  FilterButton,
  Header,
  IconButton,
  ProgressCard,
  Select,
} from '@pickthree/ui';
import { useEffect, useState } from 'react';
import { CogGlyph, MetaGlyph, META_URL, NoCollection, Progress, useLogCount } from '../components.tsx';
import { TeamCardBody } from '../components/team/TeamCardBody.tsx';
import { TeamRowSummary } from '../components/team/TeamRowSummary.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { communityLeague, WINDOW_LABELS } from '../communityMeta.ts';
import { shareEnabled } from '../metaShare.ts';
import { facingSettings, isCommunity, type FacingChoice } from '../state/facing.ts';
import { filterKey, hashFor, useActions, useAppState } from '../state/store.tsx';
import type { Settings } from '../storage/db.ts';

export const SOURCE_LABELS: Record<FacingSource, string> = {
  prior: 'PvPoke',
  log: 'Your log',
  ladder: 'GBL',
  tournament: 'Tournaments',
  all: 'All',
};

/** Active team filters: the four switches, a non-empty exclude list, a Team style other than Any. */
export function filterCount(settings: Settings): number {
  const f = settings.filters;
  return (
    [f.noXl, f.noShadow, f.noEliteTm, f.budget].filter(Boolean).length +
    (settings.excludedSpecimenIds.length > 0 ? 1 : 0) +
    (f.style !== 'any' ? 1 : 0)
  );
}

/** One supporting line under the controls: what the team list is weighted by. */
export function facingSummary(choice: FacingChoice, logCount: number, fellBack: boolean): string {
  if (fellBack) {
    return 'PvPoke weighting (community data unavailable)';
  }
  if (choice.source === 'prior') {
    return 'PvPoke weighting';
  }
  if (choice.source === 'log') {
    return logCount >= 15 ? 'Your log weighting' : 'PvPoke weighting until your log reaches 15 battles';
  }
  return `${WINDOW_LABELS[choice.window]} · ${SOURCE_LABELS[choice.source]} weighting`;
}

/** The tab's own header: its title, the meta.pick3.gg link and Settings. */
function TeamsHeader({ openSheet }: { openSheet: () => void }) {
  return (
    <Header
      variant="top"
      title="Your Teams"
      actions={
        <>
          <IconButton label="meta.pick3.gg, the community meta" href={META_URL}>
            <MetaGlyph />
          </IconButton>
          <IconButton label="Settings" onClick={openSheet}>
            <CogGlyph />
          </IconButton>
        </>
      }
    />
  );
}

export function Teams() {
  const s = useAppState();
  const { navigate, runRecommend, updateSettings, openFilters, openSheet, setPick } = useActions();
  /** Tapping a team loads it into Build as your specimens at the recommended stage. */
  const editInBuild = (t: TeamRecommendation): void => {
    t.slots.forEach((slot, i) => {
      const b = slot.candidate.build;
      setPick(i, { kind: 'specimen', id: b.specimenId, asSpeciesId: b.speciesId });
    });
    navigate({ screen: 'build' });
  };
  const logCount = useLogCount();
  const key = filterKey(s.settings, s.logVersion, s.community);
  const stale = s.recommendedWith !== key;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string, i: number): boolean => open[id] ?? i === 0;
  const toggle = (id: string, i: number): void =>
    setOpen((cur) => ({ ...cur, [id]: !(cur[id] ?? i === 0) }));

  // A fresh recommendation is a fresh list: start over with only its first row open, rather than
  // carrying open/closed state that named yesterday's team ids.
  useEffect(() => {
    setOpen({});
  }, [s.recommendedWith]);

  useEffect(() => {
    if (
      s.boot === 'ready' &&
      s.leagueInfo &&
      s.collection &&
      !s.recommending &&
      !s.recommendError &&
      (s.recommendation === null || stale)
    ) {
      void runRecommend();
    }
  }, [
    s.boot,
    s.leagueInfo,
    s.collection,
    s.recommendation,
    s.recommending,
    s.recommendError,
    stale,
    runRecommend,
  ]);

  if (!s.collection) {
    return (
      <div className="screen">
        <div className="page-head">
          <TeamsHeader openSheet={openSheet} />
        </div>
        <NoCollection navigate={navigate} />
      </div>
    );
  }

  const teams = s.recommendation?.teams ?? [];
  const choice = facingSettings(s.settings);
  const league = s.data?.leagues.find((l) => l.id === (s.settings.league ?? 'great'));
  // The league list is not known yet on a cold start straight into Teams (store.tsx routes here
  // before boot finishes): treat that as having community data, so nothing is greyed out or
  // labeled missing on the strength of data that has not loaded yet. Only a known league whose
  // communityLeague is null earns the note and the disabled options.
  const hasCommunity = league ? communityLeague(league) !== null : true;
  const fellBack =
    isCommunity(choice.source) &&
    s.recommendation?.assumptions.facing.startsWith('PvPoke weights (community data unavailable)');
  const logLabel = logCount >= 15 ? 'Your log' : `Your log: ${logCount} of 15`;
  const sourceOptions = (Object.keys(SOURCE_LABELS) as FacingSource[]).map((value) => ({
    value,
    label:
      value === 'log'
        ? logLabel
        : value === choice.source && fellBack
          ? `${SOURCE_LABELS[value]} (offline)`
          : SOURCE_LABELS[value],
    disabled: isCommunity(value) && !hasCommunity,
  }));
  const filters = filterCount(s.settings);
  const sharing = shareEnabled(s.settings);

  return (
    <div className="screen">
      <div className="page-head">
        <TeamsHeader openSheet={openSheet} />
        <LeagueSwitcher />
        <div className="row teams-controls">
          <Select<FacingSource>
            label="Source"
            value={choice.source}
            options={sourceOptions}
            onChange={(source) =>
              updateSettings((cur) => ({ ...cur, facing: { ...cur.facing, source } }))
            }
          />
          <Select<WindowKey>
            label="Window"
            value={choice.window}
            disabled={!isCommunity(choice.source) || !hasCommunity}
            options={(['meta', '30', '7'] as const).map((w) => ({
              value: w,
              label: WINDOW_LABELS[w],
            }))}
            onChange={(window) =>
              updateSettings((cur) => ({ ...cur, facing: { ...cur.facing, window } }))
            }
          />
          <FilterButton count={filters} onClick={openFilters} />
        </div>
        {!hasCommunity ? <span className="meta">No community data for this league</span> : null}
        <p className="meta teams-weighting">{facingSummary(choice, logCount, Boolean(fellBack))}</p>
      </div>
      <div className="scroll teams-list">
        <button type="button" className="action-row" onClick={() => navigate({ screen: 'build' })}>
          <span>
            <b>Build your own team</b>
            <span className="small muted">Pick any three and get the same breakdown.</span>
          </span>
          <span className="chev">&rsaquo;</span>
        </button>
        {s.boot === 'loading' ? <Progress stage="boot" done={0} total={0} /> : null}
        {s.recommending && s.progress ? <Progress {...s.progress} /> : null}
        {s.recommending && !s.progress ? <Progress stage="eligibility" done={0} total={0} /> : null}
        {s.recommendError ? <ErrorState line={s.recommendError} /> : null}
        {!s.recommending && s.recommendation && teams.length === 0 ? (
          <Empty
            line="No team fits these filters. Loosen one to see recommendations again."
            action={<FilterButton count={filters} onClick={openFilters} />}
          />
        ) : null}
        {teams.map((t, i) => (
          <div className="teams-item" key={t.id}>
            <ExpandRow
              summary={<TeamRowSummary team={t} />}
              open={isOpen(t.id, i)}
              onToggle={() => toggle(t.id, i)}
            >
              <TeamCardBody team={t} legend={i === 0} />
              <div className="teams-actions">
                <Button variant="text" href={hashFor({ screen: 'team', id: t.id })}>
                  View analysis
                </Button>
                <Button variant="text" onClick={() => editInBuild(t)}>
                  Edit team
                </Button>
              </div>
            </ExpandRow>
            {i === 0 && logCount < 15 ? (
              <ProgressCard
                title="Make these teams personal"
                done={logCount}
                goal={15}
                line={`Log ${15 - logCount} more ${15 - logCount === 1 ? 'battle' : 'battles'} to weight teams by what you actually face.`}
                {...(sharing ? { contribution: 'Anonymous logs also improve the live meta.' } : {})}
              />
            ) : null}
          </div>
        ))}
        {s.recommendation ? (
          <p className="meta teams-footer">
            {`${s.recommendation.stats.triosScored.toLocaleString('en-US')} combinations scored · ${s.recommendation.stats.finalists} simulated with your exact Pokémon`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
