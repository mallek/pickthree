import type { FacingSource, TeamRecommendation } from '@pickthree/engine';
import type { WindowKey } from '@pickthree/engine/meta';
import { Select } from '@pickthree/ui';
import { useEffect } from 'react';
import {
  Chip,
  FitTag,
  HeadCog,
  MetaButton,
  PokemonToken,
  Progress,
  RoleLabel,
  StructureTag,
  useLogCount,
  useName,
  NoCollection,
} from '../components.tsx';
import { costLine } from '../format.ts';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { communityLeague, WINDOW_LABELS } from '../communityMeta.ts';
import { facingSettings, isCommunity } from '../state/facing.ts';
import { filterKey, hashFor, useActions, useAppState } from '../state/store.tsx';
import type { Settings } from '../storage/db.ts';

export function TeamCard({
  team,
  first,
  href,
  onOpen,
}: {
  team: TeamRecommendation;
  first: boolean;
  /** The team's analysis page, behind the small link at the foot of the card. */
  href: string;
  /** Tapping the card: load the team into Build for edits. */
  onOpen: () => void;
}) {
  const name = useName();
  return (
    <div
      className={`team-card${first ? ' first' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="between">
        <span className="row">
          <FitTag fit={team.score.fit} />
          <StructureTag structure={team.structure} />
        </span>
        <span className="diff">
          <span className="small">{team.score.difficulty} to play</span>
          <span className="diff-why">{team.score.difficultyWhy}</span>
        </span>
      </div>
      <div className="slots3">
        {team.slots.map((s) => (
          <div className="slot" key={s.candidate.build.specimenId}>
            <PokemonToken speciesId={s.candidate.build.speciesId} size={52} />
            <span className="slot-name">{name(s.candidate.build.speciesId)}</span>
            <RoleLabel role={s.role} />
          </div>
        ))}
      </div>
      {first ? (
        <p className="meta" style={{ textAlign: 'center' }}>
          Lead opens the battle. Safe Switch answers a bad start. Closer finishes once shields are
          gone.
        </p>
      ) : null}
      <p style={{ fontSize: 14 }}>{team.explanation.why}</p>
      <div className="cost-line">
        <span>{costLine(team.cost)}</span>
        <a className="team-details" href={href} onClick={(e) => e.stopPropagation()}>
          Analysis &rsaquo;
        </a>
      </div>
    </div>
  );
}

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

export function Teams() {
  const s = useAppState();
  const { navigate, runRecommend, updateSettings, openFilters, setPick } = useActions();
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

  return (
    <div className="screen">
      <div className="page-head">
        <div className="between">
          <h2>Your Teams</h2>
          <span className="row">
            <span className="meta">{s.collection.report.recognized} Pokémon</span>
            <MetaButton />
            <HeadCog />
          </span>
        </div>
        <LeagueSwitcher />
        <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
          <Chip on={filters > 0} onClick={openFilters}>
            {filters > 0 ? `Filters: ${filters}` : 'Filters'}
          </Chip>
        </div>
        {!hasCommunity ? <span className="meta">No community data for this league</span> : null}
      </div>
      <div className="scroll" style={{ gap: 14 }}>
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
        {s.recommendError ? <div className="error">{s.recommendError}</div> : null}
        {!s.recommending && s.recommendation && teams.length === 0 ? (
          <p className="muted" style={{ padding: '32px 12px', textAlign: 'center' }}>
            No team fits these filters. Loosen one to see recommendations again.
          </p>
        ) : null}
        {teams.map((t, i) => (
          <TeamCard
            key={t.id}
            team={t}
            first={i === 0}
            href={hashFor({ screen: 'team', id: t.id })}
            onOpen={() => editInBuild(t)}
          />
        ))}
        {s.recommendation ? (
          <p className="meta" style={{ textAlign: 'center' }}>
            {s.recommendation.stats.triosScored.toLocaleString('en-US')} combinations scored,{' '}
            {s.recommendation.stats.finalists} simulated with your exact Pokémon.
          </p>
        ) : null}
      </div>
    </div>
  );
}
