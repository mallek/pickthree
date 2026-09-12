import type { TeamRecommendation } from '@pickthree/engine';
import { useEffect } from 'react';
import {
  Chip,
  FitTag,
  PokemonToken,
  Progress,
  RoleLabel,
  StructureTag,
  useName,
} from '../components.tsx';
import { costLine } from '../format.ts';
import { filterKey, hashFor, useActions, useAppState } from '../state/store.tsx';

export function TeamCard({
  team,
  first,
  href,
  onOpen,
}: {
  team: TeamRecommendation;
  first: boolean;
  href: string;
  onOpen?: () => void;
}) {
  const name = useName();
  return (
    <a className={`team-card${first ? ' first' : ''}`} href={href} onClick={onOpen}>
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
        <b>Details &rsaquo;</b>
      </div>
    </a>
  );
}

export function Teams() {
  const s = useAppState();
  const { navigate, runRecommend, updateSettings, openSheet } = useActions();
  const f = s.settings.filters;
  const key = filterKey(s.settings);
  const stale = s.recommendedWith !== key;

  useEffect(() => {
    if (
      s.boot === 'ready' &&
      s.collection &&
      !s.recommending &&
      (s.recommendation === null || stale)
    ) {
      void runRecommend();
    }
  }, [s.boot, s.collection, s.recommendation, s.recommending, stale, runRecommend]);

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
          <h2>Your teams</h2>
          <span className="meta">
            {teams.length > 0
              ? `${teams.length} from ${s.collection.report.recognized} Pokemon`
              : `${s.collection.report.recognized} Pokemon`}
          </span>
        </div>
        <div className="seg" aria-label="League">
          <span className="on">Great League</span>
          <span>
            Ultra <small>soon</small>
          </span>
          <span>
            Master <small>soon</small>
          </span>
        </div>
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
              ? `Exclude Pokemon · ${s.settings.excludedSpecimenIds.length}`
              : 'Exclude Pokemon'}
          </Chip>
        </div>
      </div>
      <div className="scroll" style={{ gap: 14 }}>
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
          />
        ))}
        {s.recommendation ? (
          <p className="meta" style={{ textAlign: 'center' }}>
            {s.recommendation.stats.triosScored.toLocaleString('en-US')} combinations scored,{' '}
            {s.recommendation.stats.finalists} simulated with your exact Pokemon.
          </p>
        ) : null}
      </div>
    </div>
  );
}
