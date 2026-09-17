import {
  RECENT_LIMIT,
  SET_SIZE,
  recentOpponents,
  teamKey,
  type Faceoff,
  type TeamRef,
} from '@pickthree/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Header, PokemonToken, useName, useShortName, useSpeciesSearch } from '../components.tsx';
import { OpponentCard } from '../components/OpponentCard.tsx';
import { useActions, useAppState } from '../state/store.tsx';

export function LogBattle() {
  const s = useAppState();
  const { navigate, logBattle, startSet, faceoff } = useActions();
  const name = useName();
  const short = useShortName();
  const open = s.sets.find((x) => !x.closed) ?? null;
  const index = open ? s.sets.indexOf(open) + 1 : 0;
  const [slots, setSlots] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  /** The opponent whose in-battle card is open: the last one added, or a tapped slot. */
  const [selected, setSelected] = useState<string | null>(null);
  const [card, setCard] = useState<{ opponent: string; data: Faceoff | null } | null>(null);
  /** Cards already simulated this visit, so switching between the three slots is instant. */
  const cards = useRef(new Map<string, Faceoff>());
  const searchRef = useRef<HTMLInputElement>(null);
  /** Set before the fifth battle is saved, so the redirect below never fires mid-save. */
  const [done, setDone] = useState<{
    wins: number;
    losses: number;
    index: number;
    team: TeamRef;
  } | null>(null);
  const hits = useSpeciesSearch(query, 30);

  useEffect(() => {
    if (s.setsLoaded && !open && !done) {
      navigate({ screen: 'meta-new' });
    }
  }, [s.setsLoaded, open, done, navigate]);

  const fallback = useMemo(() => {
    const ranks = s.leagueInfo?.metaRanks ?? {};
    return [...(s.leagueInfo?.meta ?? [])].sort(
      (a, b) => (ranks[a]?.overall ?? 999) - (ranks[b]?.overall ?? 999),
    );
  }, [s.leagueInfo]);
  const recent = useMemo(() => recentOpponents(s.sets, fallback, RECENT_LIMIT), [s.sets, fallback]);
  const searching = query.trim().length > 0;
  const gridIds = useMemo(() => {
    if (!searching) {
      return recent;
    }
    const recentSet = new Set(recent);
    return [...hits.filter((id) => recentSet.has(id)), ...hits.filter((id) => !recentSet.has(id))];
  }, [searching, hits, recent]);
  const atCap = searching && hits.length >= 30;

  const add = (id: string): void => {
    setSlots((cur) => (cur.length >= 3 || cur.includes(id) ? cur : [...cur, id]));
    setSelected(id);
    // Back to the search so the next opponent is a few keystrokes away. On a touch screen the
    // keyboard would cover the card, so only when a search was already under way.
    const typing = query.trim().length > 0;
    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
    setQuery('');
    if (typing || fine) {
      searchRef.current?.focus();
    }
  };
  const remove = (id: string): void => {
    setSlots((cur) => cur.filter((x) => x !== id));
    setSelected((cur) => (cur === id ? null : cur));
  };

  const teamId = open ? `${open.league}|${teamKey(open.team.species)}` : '';
  useEffect(() => {
    if (!open || !selected) {
      setCard(null);
      return;
    }
    const key = `${teamId}|${selected}`;
    const hit = cards.current.get(key);
    if (hit) {
      setCard({ opponent: selected, data: hit });
      return;
    }
    let live = true;
    setCard({ opponent: selected, data: null });
    void faceoff(open.team, selected).then((data) => {
      if (data) {
        cards.current.set(key, data);
      }
      if (live) {
        setCard({ opponent: selected, data });
      }
    });
    return () => {
      live = false;
    };
  }, [open, teamId, selected, faceoff]);

  const save = async (result: 'win' | 'loss' | null): Promise<void> => {
    if (!open || saving) {
      return;
    }
    setSaving(true);
    const closes = open.battles.length + 1 >= SET_SIZE;
    if (closes) {
      const wins =
        open.battles.filter((b) => b.result === 'win').length + (result === 'win' ? 1 : 0);
      const losses =
        open.battles.filter((b) => b.result === 'loss').length + (result === 'loss' ? 1 : 0);
      setDone({ wins, losses, index, team: open.team });
    }
    try {
      const saved = await logBattle({ opponents: slots, result, tanked: result === null });
      if (!saved) {
        setDone(null);
      } else if (!closes) {
        navigate({ screen: 'meta' });
      }
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="screen">
        <Header title="Set done" cog={false} />
        <div className="scroll set-done" style={{ gap: 22 }}>
          <p className="set-done-line">
            Set {done.index} done, {done.wins}-{done.losses}.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => void startSet(done.team).then(() => navigate({ screen: 'meta' }))}
          >
            New set, same team
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate({ screen: 'meta' })}
          >
            Back to Your meta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <Header
        title="Log a battle"
        sub={open ? `Set ${index}, battle ${open.battles.length + 1} of ${SET_SIZE}` : ''}
        onBack={() => navigate({ screen: 'meta' })}
        backLabel="Close"
        cog={false}
        extra={
          open ? (
            <div className="team-strip" aria-label="Your team">
              {open.team.species.map((id) => (
                <span className="team-strip-member" key={id}>
                  <PokemonToken speciesId={id} size={30} showInitial={false} />
                  <span>{short(id)}</span>
                </span>
              ))}
            </div>
          ) : null
        }
      />
      <div className="scroll" style={{ gap: 14, paddingBottom: 140 }}>
        <div className="stack" style={{ gap: 8 }}>
          <span className="meta">{searching ? 'Matches' : 'Recent'}</span>
          <div className="recent-row matches">
            {gridIds.map((id) => (
              <button
                type="button"
                className={`recent-token${slots.includes(id) ? ' on' : ''}`}
                key={id}
                onClick={() => add(id)}
                aria-label={name(id)}
              >
                <PokemonToken speciesId={id} size={36} />
                <span>{short(id)}</span>
              </button>
            ))}
          </div>
          {searching && gridIds.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              Nothing matches.
            </p>
          ) : null}
          {atCap ? (
            <p className="muted small" style={{ margin: 0 }}>
              Keep typing to narrow it down.
            </p>
          ) : null}
        </div>
        <input
          ref={searchRef}
          className="search"
          placeholder="Search any Pokemon"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="meta" style={{ margin: 0, textAlign: 'center' }}>
          Add the opponents you saw. One or two is fine.
        </p>
        <div className="opp-slots">
          {[0, 1, 2].map((i) => {
            const id = slots[i];
            return (
              <div className="slot-wrap" key={i}>
                <button
                  type="button"
                  className={`opp-slot${id ? ' filled' : ''}${id && id === selected ? ' selected' : ''}`}
                  onClick={() => (id ? setSelected(id) : undefined)}
                  aria-label={id ? `${name(id)} in battle` : `Opponent ${i + 1}`}
                  aria-pressed={id ? id === selected : undefined}
                >
                  {id ? (
                    <>
                      <PokemonToken speciesId={id} size={72} />
                      <span className="small">{name(id)}</span>
                    </>
                  ) : (
                    <>
                      <span className="opp-slot-empty" style={{ width: 72, height: 72 }}>
                        {i + 1}
                      </span>
                      <span className="small muted">Opponent {i + 1}</span>
                    </>
                  )}
                </button>
                {id ? (
                  <button
                    type="button"
                    className="slot-x"
                    aria-label={`Remove ${name(id)}`}
                    onClick={() => remove(id)}
                  >
                    &times;
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {card ? <OpponentCard opponent={card.opponent} data={card.data} /> : null}
      </div>
      <div className="result-bar">
        <div className="result-row">
          <button type="button" className="btn" disabled={saving} onClick={() => void save('win')}>
            Win
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => void save('loss')}>
            Loss
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={saving}
            onClick={() => void save(null)}
          >
            Tanked
          </button>
        </div>
        <p className="meta" style={{ margin: 0, textAlign: 'center' }}>
          Tanked means they quit or threw. It stays in the set but counts for nothing.
        </p>
      </div>
    </div>
  );
}
