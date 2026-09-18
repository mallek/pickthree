import type { TeamRecommendation } from '@pickthree/engine';
import { useEffect } from 'react';
import {
  Chip,
  FitTag,
  HeadCog,
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
import { filterKey, hashFor, useActions, useAppState } from '../state/store.tsx';

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

export function Teams() {
  const s = useAppState();
  const { navigate, runRecommend, updateSettings, openSheet, setPick } = useActions();
  /** Tapping a team loads it into Build as your specimens at the recommended stage. */
  const editInBuild = (t: TeamRecommendation): void => {
    t.slots.forEach((slot, i) => {
      const b = slot.candidate.build;
      setPick(i, { kind: 'specimen', id: b.specimenId, asSpeciesId: b.speciesId });
    });
    navigate({ screen: 'build' });
  };
  const f = s.settings.filters;
  const logCount = useLogCount();
  const key = filterKey(s.settings, s.logVersion);
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

  const styleLabel =
    f.style === 'any'
      ? 'Team style: Any'
      : f.style === 'abb'
        ? 'Team style: ABB line'
        : 'Team style: Balanced';
  const cycleStyle = (): void => {
    const next = f.style === 'any' ? 'balanced' : f.style === 'balanced' ? 'abb' : 'any';
    updateSettings((cur) => ({ ...cur, filters: { ...cur.filters, style: next } }));
  };
  const toggle = (k: 'noXl' | 'noShadow' | 'noEliteTm' | 'budget'): void =>
    updateSettings((cur) => ({ ...cur, filters: { ...cur.filters, [k]: !cur.filters[k] } }));
  const teams = s.recommendation?.teams ?? [];

  return (
    <div className="screen">
      <div className="page-head">
        <div className="between">
          <h2>Your Teams</h2>
          <span className="row">
            <span className="meta">{s.collection.report.recognized} Pokémon</span>
            <HeadCog />
          </span>
        </div>
        <LeagueSwitcher />
        <div className="chips">
          <Chip on={f.style !== 'any'} onClick={cycleStyle}>
            {styleLabel}
          </Chip>
          <Chip on={f.noXl} onClick={() => toggle('noXl')}>
            No XL
          </Chip>
          <Chip on={f.noShadow} onClick={() => toggle('noShadow')}>
            No Shadows
          </Chip>
          <Chip on={f.noEliteTm} onClick={() => toggle('noEliteTm')}>
            No Elite TM
          </Chip>
          <Chip on={f.budget} onClick={() => toggle('budget')}>
            Budget builds
          </Chip>
          <Chip onClick={openSheet}>
            {s.settings.excludedSpecimenIds.length > 0
              ? `Exclude Pokémon · ${s.settings.excludedSpecimenIds.length}`
              : 'Exclude Pokémon'}
          </Chip>
          <Chip on={logCount >= 15} onClick={() => navigate({ screen: 'meta' })}>
            {logCount >= 15 ? `Your log: ${logCount} battles` : `Your log: ${logCount} of 15`}
          </Chip>
        </div>
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
