import { teamKey, type TeamMoves, type TeamRecommendation, type TeamRef } from '@pickthree/engine';
import { Button, Header } from '@pickthree/ui';
import { useMemo, useState } from 'react';
import {
  PokemonToken,
  useName,
  useShortName,
  useSpecies,
  NothingMatches,
  useSpeciesSearch,
} from '../components.tsx';
import { TeamRowSummary } from '../components/team/TeamRowSummary.tsx';
import { matchesQuery, parseQuery } from '../search.ts';
import { specimenRecord } from '../searchRecords.ts';
import { useActions, useAppState } from '../state/store.tsx';

/** The picks a recommended team's slots resolved to, for starting a set from it directly. */
function toTeamRef(t: TeamRecommendation): TeamRef {
  return {
    species: t.slots.map((x) => x.candidate.build.speciesId) as [string, string, string],
    specimenIds: t.slots.map((x) => x.candidate.build.specimenId) as [string, string, string],
    moves: t.slots.map((x) => ({
      fast: x.candidate.moveset.fast.moveId,
      charged: x.candidate.moveset.charged.map((m) => m.moveId),
    })) as [TeamMoves | null, TeamMoves | null, TeamMoves | null],
  };
}

function TeamPick({ team, onPick }: { team: TeamRef; onPick: () => void }) {
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
      <span className="chev">&rsaquo;</span>
    </button>
  );
}

/** A pick3 recommendation as a whole-team shortcut: the same row Teams shows, tap to fill the slots. */
function Pick3Pick({ team, onPick }: { team: TeamRecommendation; onPick: () => void }) {
  return (
    <button type="button" className="pick3-row" onClick={onPick}>
      <TeamRowSummary team={team} />
      <span className="chev">&rsaquo;</span>
    </button>
  );
}

export function NewSet() {
  const s = useAppState();
  const { back, navigate, startSet } = useActions();
  const name = useName();
  const short = useShortName();
  const species = useSpecies();
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);
  /** The whole team (From pick3 or Recent teams) the slots were filled from, kept so Start set
   * carries its moves and specimens. */
  const [chosen, setChosen] = useState<TeamRef | null>(null);
  const [query, setQuery] = useState('');
  const hits = useSpeciesSearch(query, 30, { legalOnly: true });

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

  const fromPick3 = useMemo(
    (): TeamRecommendation[] => [
      ...(s.recommendation?.teams ?? []).slice(0, 3),
      ...(s.analysis ? [s.analysis.team] : []),
    ],
    [s.recommendation, s.analysis],
  );

  const mine = useMemo(() => {
    const parsed = parseQuery(query);
    if (parsed.length === 0 || !s.collection) {
      return [];
    }
    const moves = s.data?.moves;
    const seen = new Set<string>();
    return s.collection.specimens
      .filter((sp) =>
        matchesQuery(parsed, specimenRecord(sp, name(sp.speciesId), species(sp.speciesId), moves)),
      )
      .filter((sp) => (seen.has(sp.speciesId) ? false : seen.add(sp.speciesId)))
      .slice(0, 30);
  }, [query, s.collection, s.data, name, species]);

  /** Collection matches first, then the rest of the species search, for the Pick three grid. */
  const picks = useMemo(() => {
    if (!query.trim()) {
      return [];
    }
    const mineIds = new Set(mine.map((sp) => sp.speciesId));
    const fromMine = mine.map((sp) => ({
      key: sp.id,
      speciesId: sp.speciesId,
      specimenId: sp.id as string | undefined,
      mine: true,
    }));
    const others = hits
      .filter((id) => !mineIds.has(id))
      .map((id) => ({
        key: id,
        speciesId: id,
        specimenId: undefined as string | undefined,
        mine: false,
      }));
    return [...fromMine, ...others];
  }, [query, mine, hits]);

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
  /** Whole-team shortcuts only make sense before a search or a pick has started. */
  const quickPicks = query.trim() === '' && slots.every((x) => x === null);

  const go = async (team: TeamRef): Promise<void> => {
    if (await startSet(team)) {
      navigate({ screen: 'meta' });
    }
  };

  const slotValue = (team: TeamRef, i: number): string => {
    const sp = team.species[i] as string;
    const id = team.specimenIds?.[i];
    return id ? `${sp}|${id}` : sp;
  };

  /** A From pick3 or Recent teams tap fills the three slots; Start set then starts it. */
  const fillTeam = (team: TeamRef): void => {
    setSlots(team.species.map((_, i) => slotValue(team, i)));
    setChosen(team);
    setQuery('');
  };

  const clearSlot = (i: number): void => {
    setSlots((cur) => cur.map((x, j) => (j === i ? null : x)));
    setChosen(null);
  };

  const startPicked = (): void => {
    if (chosen && slots.every((v, i) => v === slotValue(chosen, i))) {
      void go(chosen);
      return;
    }
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
        variant="sub"
        title="Pick Your Team"
        back={{ label: 'Cancel', onClick: () => back({ screen: 'meta' }) }}
      />
      <div className="scroll" style={{ gap: 18, paddingBottom: 96 }}>
        <input
          className="search"
          placeholder="Search any Pokémon"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() ? (
          <div className="stack" style={{ gap: 8 }}>
            <span className="meta">Matches</span>
            <div className="recent-row matches tall">
              {picks.map((p) => (
                <button
                  type="button"
                  className="recent-token"
                  key={p.key}
                  onClick={() => fill(p.speciesId, p.specimenId)}
                  aria-label={name(p.speciesId)}
                >
                  <PokemonToken speciesId={p.speciesId} size={36} />
                  <span>{short(p.speciesId)}</span>
                  {p.mine ? <span className="tag">yours</span> : null}
                </button>
              ))}
            </div>
            {picks.length === 0 ? (
              <NothingMatches query={query} legalOnly style={{ margin: 0 }} />
            ) : null}
          </div>
        ) : null}
        <div className="opp-slots">
          {slots.map((v, i) => (
            <button
              type="button"
              className={`opp-slot${v ? ' filled' : ''}`}
              key={i}
              onClick={() => clearSlot(i)}
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
        {quickPicks && fromPick3.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <b>From pick3</b>
            {fromPick3.map((t, i) => (
              <Pick3Pick team={t} key={`${i}-${t.id}`} onPick={() => fillTeam(toTeamRef(t))} />
            ))}
          </div>
        ) : null}
        {quickPicks && recent.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <b>Recent teams</b>
            {recent.map((t) => (
              <TeamPick team={t} key={teamKey(t.species)} onPick={() => fillTeam(t)} />
            ))}
          </div>
        ) : null}
      </div>
      <div className="new-set-foot">
        <Button variant="primary" disabled={!ready} onClick={startPicked}>
          Start set
        </Button>
      </div>
    </div>
  );
}
