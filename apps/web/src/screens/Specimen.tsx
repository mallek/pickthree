import type { MetaRank } from '@pickthree/engine';
import {
  Button,
  ConfirmSheet,
  Empty,
  ErrorState,
  Header,
  IconButton,
  Loading,
  Switch,
} from '@pickthree/ui';
import { useEffect, useState } from 'react';
import {
  CogGlyph,
  MoveRows,
  PokemonToken,
  Progress,
  TypeChips,
  HundoTag,
  VerdictTag,
  useMetaRank,
  useName,
  useSpecies,
} from '../components.tsx';
import {
  META_CUTOFF,
  coversLine,
  ivLine,
  judgeFailedLine,
  levelLabel,
  num,
  powerUpLine,
  scanAge,
} from '../format.ts';
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
  const {
    back,
    navigate,
    openSheet,
    loadVerdicts,
    toggleExcludedSpecies,
    removeSpecimen,
    setMegaLevel4,
  } = useActions();
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
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Set once Remove is confirmed: the page is on its way back, so the moment between the removal
  // landing and the route changing shows no "not in the collection" line.
  const [removed, setRemoved] = useState(false);
  // No title: the name is the page's own heading, once. Back returns to wherever the player came
  // from (Collection, Counters, a team); Collection only when pick3 has nothing behind this page.
  const header = (
    <Header
      variant="sub"
      back={{ label: 'Back', onClick: () => back({ screen: 'collection' }) }}
      actions={
        <IconButton label="Settings" onClick={openSheet}>
          <CogGlyph />
        </IconButton>
      }
    />
  );
  // The saved collection has not been read yet (a fresh load of this page's link): wait for it
  // rather than saying the Pokémon is not in it.
  if (!sp && !s.settingsLoaded) {
    return (
      <div className="screen">
        {header}
        <div className="scroll">
          <Loading label="Loading your collection" />
        </div>
      </div>
    );
  }
  if (!sp) {
    return (
      <div className="screen">
        {header}
        {removed ? null : (
          <div className="scroll">
            <Empty line="That Pokémon is not in the current collection." />
          </div>
        )}
      </div>
    );
  }
  const v = s.verdicts[sp.id];
  const display = name(sp.speciesId);
  const types = species(sp.speciesId)?.types ?? ['normal', 'none'];
  const teams = (s.recommendation?.teams ?? []).filter((t) =>
    t.slots.some((sl) => sl.candidate.build.specimenId === sp.id),
  );
  const build = v?.build ?? null;
  // Exclusion goes by what the Pokémon battles as, its best build's species, so the switch waits
  // for the verdict to name it. A legacy per-copy id on this copy converts when verdicts finish;
  // until then the switch shows this copy's state and stays disabled.
  const battles = build?.speciesId ?? null;
  const legacy = s.settings.excludedSpecimenIds ?? [];
  const excluded = battles
    ? (s.settings.excludedSpecies ?? []).includes(battles) || legacy.includes(sp.id)
    : legacy.includes(sp.id);
  const showSwitch = !(v && !battles);
  // Level 4 is only for a Mega the player has marked whose Mega form is a supermega.
  const markedMega = sp.megaForm ? species(`${sp.speciesId}_${sp.megaForm}`) : undefined;
  const canLevel4 = markedMega?.superMega === true;
  const switchReady = battles !== null && !s.verdictsLoading && !legacy.includes(sp.id);
  const covers =
    battles && !s.verdictsLoading
      ? coversLine(
          [
            ...(s.collection?.specimens ?? [])
              // Every copy with a build of it: the exclusion removes that build, best or not.
              .filter((c) => s.verdicts[c.id]?.buildSpecies.includes(battles))
              .reduce((m, c) => {
                const n = name(c.speciesId);
                return m.set(n, (m.get(n) ?? 0) + 1);
              }, new Map<string, number>()),
          ].map(([n, count]) => ({ name: n, count })),
        )
      : undefined;
  // No power-up and no evolution to do reads "Already at level L." in place of "Level A to B",
  // and drops the zero tiles; whatever still costs something (a second move unlock) keeps its
  // tile. Half a level short is not already there, whatever the verdict's own margin says.
  const alreadyThere = build !== null && build.stageOffset === 0 && build.baseLevel <= sp.level.max;
  const tiles: [string, number][] = v?.cost
    ? (
        [
          ['Stardust', v.cost.stardust],
          ['Candy', v.cost.candy],
          ['XL Candy', v.cost.xlCandy],
        ] as [string, number][]
      ).filter(([, value]) => !alreadyThere || value > 0)
    : [];

  return (
    <div className="screen">
      {header}
      <div className="scroll" style={{ gap: 22 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '64px 1fr',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <PokemonToken speciesId={sp.speciesId} size={64} markedMega={Boolean(sp.megaForm)} />
          <div>
            <h2>{display}</h2>
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
              {v ? (
                <VerdictTag label={v.label} />
              ) : s.verdictsError ? null : (
                <span className="meta">Judging...</span>
              )}
              <HundoTag delta={v?.perfectDelta ?? null} />
            </div>
          </div>
        </div>

        {!v && s.verdictsLoading ? (
          <Progress
            stage="verdicts"
            done={s.progress?.stage === 'verdicts' ? s.progress.done : 0}
            total={s.progress?.stage === 'verdicts' ? s.progress.total : 0}
          />
        ) : null}
        {!v && s.verdictsError ? <ErrorState line={judgeFailedLine(s.verdictsError)} /> : null}

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

        {/* Every Mega build the league allows, beside the verdict's build whichever is best. */}
        {(v?.megaBuilds ?? []).map((mb) => (
          <div className="evo" role="group" aria-label="Mega build" key={mb.speciesId}>
            <PokemonToken speciesId={mb.speciesId} size={36} showInitial={false} />
            <div>
              <div className="role" style={{ display: 'block' }}>
                Mega build
              </div>
              <div style={{ fontSize: 15 }}>{name(mb.speciesId)}</div>
              <div className="small muted">{powerUpLine(mb)}</div>
            </div>
          </div>
        ))}

        {canLevel4 ? (
          <div className="card">
            <Switch
              label="Mega Level 4"
              checked={sp.megaLevel4 === true}
              onChange={() => {
                void setMegaLevel4(sp.id, sp.megaLevel4 !== true);
              }}
            />
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
            {alreadyThere ? (
              <>
                <p>Already at level {sp.level.max}.</p>
                {v.cost.secondMoveUnlock ? (
                  <div className="small muted">Includes second move unlock.</div>
                ) : null}
              </>
            ) : (
              <div className="small muted">
                Level {sp.level.max} to {build.baseLevel}
                {v.cost.secondMoveUnlock ? ' · includes second move unlock' : ''}
                {v.cost.evolutionCandy > 0
                  ? ` · includes ${v.cost.evolutionCandy} candy to evolve`
                  : ''}
              </div>
            )}
            {tiles.length > 0 ? (
              <div className="stat3">
                {tiles.map(([label, value]) => (
                  <div className="stat" key={label}>
                    <b>{num(value)}</b>
                    <span className="meta">{label}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {v.cost.megaEnergy ? (
              <p className="small muted">
                {v.cost.megaEnergy === 'ready'
                  ? 'Mega Energy (mega-evolved before)'
                  : 'Mega Energy'}
              </p>
            ) : null}
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

        {/* At the end of the page, in the flow: nothing sits over the content. */}
        {/* A Pokémon with no build in this league never reaches a team: nothing to switch. */}
        {showSwitch || sp.source === 'manual' ? (
          <div className="card">
            {!showSwitch ? null : (
              <Switch
                label={
                  battles
                    ? `Use ${name(battles)} in team recommendations`
                    : 'Use in team recommendations'
                }
                {...(covers ? { line: covers } : {})}
                checked={!excluded}
                disabled={!switchReady}
                onChange={() => {
                  if (battles) {
                    toggleExcludedSpecies(battles);
                  }
                }}
              />
            )}
            {sp.source === 'manual' ? (
              <Button variant="danger" onClick={() => setConfirmRemove(true)}>
                Remove from collection
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {confirmRemove ? (
        <ConfirmSheet
          tone="danger"
          title={`Remove this ${display}?`}
          line="It leaves your collection on this phone."
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onConfirm={() => {
            setConfirmRemove(false);
            setRemoved(true);
            void removeSpecimen(sp.id).then(() => back({ screen: 'collection' }));
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </div>
  );
}
