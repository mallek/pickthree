import type { MetaRank } from '@pickthree/engine';
import { useEffect } from 'react';
import {
  Header,
  MoveRows,
  PokemonToken,
  Progress,
  TypeChips,
  HundoTag,
  VerdictChip,
  useMetaRank,
  useName,
  useSpecies,
} from '../components.tsx';
import { META_CUTOFF, ivLine, levelLabel, num, scanAge } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';
import { useLeague } from '../components/LeagueSwitcher.tsx';

function metaLine(rank: MetaRank | undefined): string {
  if (!rank) {
    return 'Unranked';
  }
  const role =
    rank.role && rank.roleRank !== null && rank.roleRank <= META_CUTOFF
      ? ` · #${rank.roleRank} ${rank.role}`
      : '';
  return `#${rank.overall} overall${role}`;
}

export function SpecimenScreen({ id }: { id: string }) {
  const s = useAppState();
  const { navigate, loadVerdicts, toggleExcluded, removeSpecimen } = useActions();
  const league = useLeague();
  const name = useName();
  const species = useSpecies();
  const sp = s.collection?.specimens.find((x) => x.id === id);

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

  // Hooks stay above the empty-state return so their order never changes while mounted.
  const metaRank = useMetaRank();
  if (!sp) {
    return (
      <div className="screen">
        <Header
          title="Pokémon"
          onBack={() => navigate({ screen: 'collection' })}
          backLabel="Collection"
        />
        <div className="boot">
          <p>That Pokémon is not in the current collection.</p>
        </div>
      </div>
    );
  }
  const v = s.verdicts[sp.id];
  const display = name(sp.speciesId);
  const types = species(sp.speciesId)?.types ?? ['normal', 'none'];
  const excluded = s.settings.excludedSpecimenIds.includes(sp.id);
  const teams = (s.recommendation?.teams ?? []).filter((t) =>
    t.slots.some((sl) => sl.candidate.build.specimenId === sp.id),
  );
  const build = v?.build ?? null;

  return (
    <div className="screen">
      <Header
        title={display}
        onBack={() => navigate({ screen: 'collection' })}
        backLabel="Collection"
      />
      <div className="scroll" style={{ gap: 22, paddingBottom: 140 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '64px 1fr',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <PokemonToken speciesId={sp.speciesId} size={64} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.01em' }}>{display}</div>
            <div
              className="small muted"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
            >
              <TypeChips types={types} small />
              <span>
                CP {sp.cp} · Level {levelLabel(sp.level)}
                {sp.lucky ? ' · Lucky' : ''}
                {sp.purified ? ' · Purified' : ''}
              </span>
            </div>
            <div className="meta">{scanAge(sp.scannedAt)}</div>
            <div className="row" style={{ marginTop: 6, gap: 8, alignItems: 'center' }}>
              {v ? <VerdictChip label={v.label} /> : <span className="meta">Judging...</span>}
              <HundoTag delta={v?.perfectDelta ?? null} />
            </div>
          </div>
        </div>

        {!v && s.verdictsLoading ? <Progress stage="verdicts" done={0} total={0} /> : null}

        <div className="card" style={{ gap: 8 }}>
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">IVs · Attack / Defense / HP</span>
            <span style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              {ivLine(sp.ivs)}
            </span>
          </div>
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">IV rank for {league.title}</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>
              {build
                ? `${build.ivRank.rank} of ${build.ivRank.total}`
                : sp.ivs
                  ? v
                    ? 'Not eligible'
                    : '...'
                  : 'Unknown'}
            </span>
          </div>
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">
              Meta rank{build && build.stageOffset > 0 ? ' when evolved' : ''}
            </span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>
              {metaLine(metaRank(build?.speciesId ?? sp.speciesId))}
            </span>
          </div>
          {v ? <p style={{ marginTop: 4 }}>{v.line}</p> : null}
          {v?.perfectLine ? <p className="small muted">{v.perfectLine}</p> : null}
        </div>

        {build && build.stageOffset > 0 ? (
          <div className="evo">
            <PokemonToken speciesId={build.speciesId} size={36} showInitial={false} />
            <div>
              <div className="role" style={{ display: 'block' }}>
                Best stage for {league.title}
              </div>
              <div style={{ fontSize: 15 }}>
                Evolve to {name(build.speciesId)} before powering up
              </div>
            </div>
          </div>
        ) : null}

        {v?.moveset ? (
          <div className="stack" style={{ gap: 6 }}>
            <h3>Recommended moves</h3>
            <div className="card" style={{ padding: '0 14px' }}>
              <MoveRows fast={v.moveset.fast} charged={v.moveset.charged} />
            </div>
            {v.formNote ? <p className="small form-note">{v.formNote}</p> : null}
          </div>
        ) : null}

        {v?.cost && build ? (
          <div className="stack" style={{ gap: 6 }}>
            <h3>Cost to build</h3>
            <div className="small muted">
              Level {sp.level.max} to {build.level}
              {v.cost.secondMoveUnlock ? ' · includes second move unlock' : ''}
              {v.cost.evolutionCandy > 0
                ? ` · includes ${v.cost.evolutionCandy} candy to evolve`
                : ''}
            </div>
            <div className="stat3">
              <div className="stat">
                <b>{num(v.cost.stardust)}</b>
                <span className="meta">Stardust</span>
              </div>
              <div className="stat">
                <b>{num(v.cost.candy)}</b>
                <span className="meta">Candy</span>
              </div>
              <div className="stat">
                <b>{num(v.cost.xlCandy)}</b>
                <span className="meta">XL Candy</span>
              </div>
            </div>
            {v.cost.eliteTm > 0 ? (
              <p className="small muted">Plus {v.cost.eliteTm} Elite TM.</p>
            ) : null}
          </div>
        ) : null}

        <div className="stack" style={{ gap: 8 }}>
          <h3>Teams with this Pokémon</h3>
          {teams.length === 0 ? (
            <p className="small muted">Not in any recommended team right now.</p>
          ) : null}
          {teams.map((t) => (
            <button
              type="button"
              className="card"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 52,
                padding: '8px 12px',
                border: 0,
                textAlign: 'left',
                color: 'inherit',
                width: '100%',
              }}
              key={t.id}
              onClick={() => navigate({ screen: 'team', id: t.id })}
            >
              <div className="token-stack">
                {t.slots.map((sl) => (
                  <PokemonToken
                    key={sl.candidate.build.specimenId}
                    speciesId={sl.candidate.build.speciesId}
                    size={28}
                    showInitial={false}
                  />
                ))}
              </div>
              <span style={{ flex: 1, fontSize: 14 }}>
                {t.slots.map((sl) => name(sl.candidate.build.speciesId)).join(' · ')}
              </span>
              <span className="meta">{t.score.fit} &rsaquo;</span>
            </button>
          ))}
        </div>
      </div>
      <div
        className="bottom-actions"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          maxWidth: 560,
          margin: '0 auto',
          paddingBottom: 12,
          background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
          borderTop: 0,
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          style={excluded ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
          onClick={() => toggleExcluded(sp.id)}
        >
          {excluded ? 'Include in recommendations again' : 'Exclude from recommendations'}
        </button>
        {sp.source === 'manual' ? (
          <button
            type="button"
            className="btn-ghost"
            style={{ color: 'var(--warn)' }}
            onClick={() => {
              if (window.confirm(`Remove this ${display} from your collection?`)) {
                void removeSpecimen(sp.id).then(() => navigate({ screen: 'collection' }));
              }
            }}
          >
            Remove from collection
          </button>
        ) : null}
      </div>
    </div>
  );
}
