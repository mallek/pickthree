import { teamKey, type TeamRef } from '@pickthree/engine';
import { useMemo, useState, type ReactNode } from 'react';
import { FitTag, Header, PokemonToken, useName, useSpeciesSearch } from '../components.tsx';
import { useActions, useAppState } from '../state/store.tsx';

function TeamPick({
  team,
  right,
  onPick,
}: {
  team: TeamRef;
  right?: ReactNode;
  onPick: () => void;
}) {
  const name = useName();
  return (
    <button type="button" className="team-pick spec-row" onClick={onPick}>
      <span className="row" style={{ gap: 4 }}>
        {team.species.map((id) => (
          <PokemonToken speciesId={id} size={32} showInitial={false} key={id} />
        ))}
      </span>
      <span className="spec-name" style={{ minWidth: 0 }}>
        {team.species.map(name).join(', ')}
      </span>
      {right ?? <span className="chev">&rsaquo;</span>}
    </button>
  );
}

export function NewSet() {
  const s = useAppState();
  const { navigate, startSet } = useActions();
  const name = useName();
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);
  const [query, setQuery] = useState('');
  const hits = useSpeciesSearch(query);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: TeamRef[] = [];
    for (const set of [...s.sets].sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
    )) {
      const k = teamKey(set.team.species);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(set.team);
      }
    }
    return out.slice(0, 5);
  }, [s.sets]);

  const fromPick3 = useMemo(() => {
    const teams = [
      ...(s.recommendation?.teams ?? []).slice(0, 3),
      ...(s.analysis ? [s.analysis.team] : []),
    ];
    return teams.map((t) => ({
      fit: t.score.fit,
      team: {
        species: t.slots.map((x) => x.candidate.build.speciesId) as [string, string, string],
        specimenIds: t.slots.map((x) => x.candidate.build.specimenId) as [string, string, string],
      },
    }));
  }, [s.recommendation, s.analysis]);

  const mine = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !s.collection) {
      return [];
    }
    const seen = new Set<string>();
    return s.collection.specimens
      .filter((sp) => name(sp.speciesId).toLowerCase().includes(q))
      .filter((sp) => (seen.has(sp.speciesId) ? false : seen.add(sp.speciesId)))
      .slice(0, 6);
  }, [query, s.collection, name]);

  const fill = (speciesId: string, specimenId?: string): void => {
    setSlots((cur) => {
      const i = cur.findIndex((x) => x === null);
      if (i === -1 || cur.some((x) => x !== null && parts(x)[0] === speciesId)) {
        return cur;
      }
      const next = [...cur];
      next[i] = specimenId ? `${speciesId}|${specimenId}` : speciesId;
      return next;
    });
    setQuery('');
  };
  const parts = (v: string): [string, string | undefined] => {
    const [sp, id] = v.split('|');
    return [sp as string, id];
  };
  const ready = slots.every((x) => x !== null);

  const go = async (team: TeamRef): Promise<void> => {
    await startSet(team);
    navigate({ screen: 'meta' });
  };

  const startPicked = (): void => {
    const picked = slots.map((v) => parts(v as string));
    const species = picked.map((p) => p[0]) as [string, string, string];
    const ids = picked.map((p) => p[1]);
    const team: TeamRef = ids.every((x) => x)
      ? { species, specimenIds: ids as [string, string, string] }
      : { species };
    void go(team);
  };

  return (
    <div className="screen">
      <Header
        title="Pick your team"
        onBack={() => navigate({ screen: 'meta' })}
        backLabel="Cancel"
        cog={false}
      />
      <div className="scroll" style={{ gap: 18, paddingBottom: 96 }}>
        {recent.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <b>Recent teams</b>
            {recent.map((t) => (
              <TeamPick team={t} key={teamKey(t.species)} onPick={() => void go(t)} />
            ))}
          </div>
        ) : null}
        {fromPick3.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <b>From pick3</b>
            {fromPick3.map((t, i) => (
              <TeamPick
                team={t.team}
                right={<FitTag fit={t.fit} />}
                key={`${i}-${teamKey(t.team.species)}`}
                onPick={() => void go(t.team)}
              />
            ))}
          </div>
        ) : null}
        <div className="stack" style={{ gap: 8 }}>
          <b>Pick three</b>
          <div className="opp-slots">
            {slots.map((v, i) => (
              <button
                type="button"
                className={`opp-slot${v ? ' filled' : ''}`}
                key={i}
                onClick={() => setSlots((cur) => cur.map((x, j) => (j === i ? null : x)))}
                aria-label={v ? `Clear ${name(parts(v)[0])}` : `Slot ${i + 1}`}
              >
                {v ? (
                  <>
                    <PokemonToken speciesId={parts(v)[0]} size={56} />
                    <span className="small">{name(parts(v)[0])}</span>
                  </>
                ) : (
                  <>
                    <span className="opp-slot-empty" style={{ width: 56, height: 56 }}>
                      {i + 1}
                    </span>
                    <span className="small muted">Empty</span>
                  </>
                )}
              </button>
            ))}
          </div>
          <input
            className="search"
            placeholder="Search any Pokemon"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() ? (
            <div className="picker-list">
              {mine.map((sp) => (
                <button
                  type="button"
                  className="spec-row"
                  key={sp.id}
                  onClick={() => fill(sp.speciesId, sp.id)}
                >
                  <PokemonToken speciesId={sp.speciesId} size={40} />
                  <span style={{ minWidth: 0 }}>
                    <span className="spec-name">{name(sp.speciesId)}</span>
                    <span className="meta" style={{ display: 'block' }}>
                      CP {sp.cp} · yours
                    </span>
                  </span>
                  <span />
                </button>
              ))}
              {hits
                .filter((id) => !mine.some((sp) => sp.speciesId === id))
                .map((id) => (
                  <button type="button" className="spec-row" key={id} onClick={() => fill(id)}>
                    <PokemonToken speciesId={id} size={40} />
                    <span className="spec-name">{name(id)}</span>
                    <span className="meta small">other Pokemon</span>
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="new-set-foot">
        <button type="button" className="btn" disabled={!ready} onClick={startPicked}>
          Start set
        </button>
      </div>
    </div>
  );
}
