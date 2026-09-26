import {
  RECENT_LIMIT,
  recentOpponents,
  teamKey,
  type CommunityPairing,
  type Faceoff,
} from '@pickthree/engine';
import { Button, Header, Term } from '@pickthree/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PokemonToken, useName, useShortName, useSpeciesSearch } from '../components.tsx';
import { OpponentCard } from '../components/OpponentCard.tsx';
import { communityCores, likelyTeammates } from '../community.ts';
import { boardWindow, useActions, useAppState } from '../state/store.tsx';

type Outcome = 'win' | 'loss' | 'tanked';
const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: 'win', label: 'Win' },
  { key: 'loss', label: 'Loss' },
  { key: 'tanked', label: 'Tanked' },
];

/** The battle's own time, for the edit header: "Sep 15, 10:05 AM". */
function when(at: string): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function LogBattle() {
  const s = useAppState();
  const { navigate, back, logBattle, editBattle, faceoff, notify } = useActions();
  const name = useName();
  const short = useShortName();
  const open = s.sets.find((x) => !x.closed) ?? null;
  /** Edit mode: the route names a battle, found among this league's sets, open or closed. */
  const editRoute = s.route.screen === 'meta-log' ? s.route.edit : undefined;
  const editing = useMemo(() => {
    if (!editRoute) {
      return null;
    }
    const set = s.sets.find((x) => x.id === editRoute.set);
    const battle = set?.battles.find((b) => b.id === editRoute.battle);
    return set && battle ? { set, battle } : null;
  }, [editRoute, s.sets]);
  /** The set whose team the strip and the card are for: the edited battle's, else the open one. */
  const current = editing?.set ?? open;
  const [slots, setSlots] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  /** Edit mode's chosen result; a tap selects it and Save changes writes it. */
  const [choice, setChoice] = useState<Outcome | null>(null);
  /** The opponent whose in-battle card is open: the last one added, or a tapped slot. */
  const [selected, setSelected] = useState<string | null>(null);
  const [card, setCard] = useState<{ opponent: string; data: Faceoff | null } | null>(null);
  /** Cards already simulated this visit, so switching between the three slots is instant. */
  const cards = useRef(new Map<string, Faceoff>());
  const searchRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  /** Set by a pick: the grid stays hidden until the search is typed in or tapped again. */
  const [picked, setPicked] = useState(false);
  const hits = useSpeciesSearch(query, 30);

  useEffect(() => {
    if (s.setsLoaded && !open && !editing) {
      navigate({ screen: 'meta-new' });
    }
  }, [s.setsLoaded, open, editing, navigate]);

  // Edit mode starts from the battle as logged, once per battle.
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!editing || filledFor.current === editing.battle.id) {
      return;
    }
    filledFor.current = editing.battle.id;
    setSlots(editing.battle.opponents.slice(0, 3));
    setChoice(editing.battle.tanked ? 'tanked' : editing.battle.result);
  }, [editing]);

  const fallback = useMemo(() => {
    const ranks = s.leagueInfo?.metaRanks ?? {};
    return [...(s.leagueInfo?.meta ?? [])].sort(
      (a, b) => (ranks[a]?.overall ?? 999) - (ranks[b]?.overall ?? 999),
    );
  }, [s.leagueInfo]);
  const ranks = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(s.leagueInfo?.metaRanks ?? {}).map(([id, r]) => [id, r.overall]),
      ),
    [s.leagueInfo],
  );
  const recent = useMemo(
    () => recentOpponents(s.sets, fallback, RECENT_LIMIT, ranks),
    [s.sets, fallback, ranks],
  );

  // Likely teammates of the first opponent, from the community team board. The read is the whole
  // board (never a query naming the opponent), gated on sharing, cached per league, and silent on
  // failure: no board, no row.
  const league = s.settings.league ?? 'great';
  const first = slots[0] ?? null;
  const [cores, setCores] = useState<CommunityPairing[] | null>(null);
  const board = useMemo(() => boardWindow(s, league), [s.data, s.settings, league]);
  const wantBoard = first !== null;
  useEffect(() => {
    if (!wantBoard) {
      return undefined;
    }
    let live = true;
    void communityCores(s.settings, league, board).then((c) => {
      if (live) {
        setCores(c);
      }
    });
    return () => {
      live = false;
    };
  }, [wantBoard, s.settings, league, board]);
  const often = useMemo(
    () => (first && cores && slots.length < 3 ? likelyTeammates(cores, first, slots) : []),
    [cores, first, slots],
  );

  const searching = query.trim().length > 0;
  const gridIds = useMemo(() => {
    if (!searching) {
      // The likely teammates lead; Recent leaves them out rather than show them twice.
      return recent.filter((id) => !often.includes(id));
    }
    const recentSet = new Set(recent);
    return [...hits.filter((id) => recentSet.has(id)), ...hits.filter((id) => !recentSet.has(id))];
  }, [searching, hits, recent, often]);
  const atCap = searching && hits.length >= 30;
  /** Recent or matches show while the search is in use; a pick folds them away. */
  const showGrid = searching || (focused && !picked);

  const add = (id: string): void => {
    setSlots((cur) => (cur.length >= 3 || cur.includes(id) ? cur : [...cur, id]));
    setSelected(id);
    setQuery('');
    // The grid folds away, leaving the slots and the card. On a desktop the cursor stays in
    // the search so the next opponent is a few keystrokes away; on a touch screen the keyboard
    // drops so the card is in view.
    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
    if (fine) {
      searchRef.current?.focus();
    } else {
      searchRef.current?.blur();
    }
    // After the focus call: a fresh focus event clears the flag, and the pick must win.
    setPicked(true);
  };
  const remove = (id: string): void => {
    setSlots((cur) => cur.filter((x) => x !== id));
    setSelected((cur) => (cur === id ? null : cur));
  };

  const teamId = current ? `${current.league}|${teamKey(current.team.species)}` : '';
  useEffect(() => {
    if (!current || !selected) {
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
    void faceoff(current.team, selected).then((data) => {
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
  }, [current, teamId, selected, faceoff]);

  /** Saves and clears the slots, staying here: the next battle is seconds away. */
  const save = async (outcome: Outcome): Promise<void> => {
    if (!open || saving) {
      return;
    }
    setSaving(true);
    const count = open.battles.length + 1;
    try {
      const tanked = outcome === 'tanked';
      if (await logBattle({ opponents: slots, result: tanked ? null : outcome, tanked })) {
        setSlots([]);
        setSelected(null);
        setQuery('');
        const label = OUTCOMES.find((o) => o.key === outcome)?.label ?? '';
        notify(`${label} logged · ${count} with this team`);
      }
    } finally {
      setSaving(false);
    }
  };

  /** Replaces the battle's opponents and result, then returns to Your Meta. */
  const saveEdit = async (): Promise<void> => {
    if (!editing || !choice || saving) {
      return;
    }
    setSaving(true);
    try {
      const tanked = choice === 'tanked';
      const ok = await editBattle(editing.set.id, editing.battle.id, {
        opponents: slots,
        result: tanked ? null : choice,
        tanked,
      });
      if (ok) {
        back({ screen: 'meta' });
      }
    } finally {
      setSaving(false);
    }
  };

  const token = (id: string) => (
    <button
      type="button"
      className={`recent-token${slots.includes(id) ? ' on' : ''}`}
      key={id}
      // Keep the search focused through the tap so the grid is still there to click.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => add(id)}
      aria-label={name(id)}
    >
      <PokemonToken speciesId={id} size={36} />
      <span>{short(id)}</span>
    </button>
  );

  const sub = editing
    ? `Logged ${when(editing.battle.at)}`
    : open
      ? `${open.battles.length} logged with this team`
      : undefined;

  return (
    <div className="screen log-page">
      <div className="log-head">
        <Header
          variant="sub"
          title={editing ? 'Edit battle' : 'Log a Battle'}
          sub={sub}
          back={{ label: 'Back', onClick: () => back({ screen: 'meta' }) }}
        />
        {current ? (
          <div className="team-strip" aria-label="Your team">
            {current.team.species.map((id) => (
              <span className="team-strip-member" key={id}>
                <PokemonToken speciesId={id} size={30} showInitial={false} />
                <span>{short(id)}</span>
              </span>
            ))}
          </div>
        ) : null}
        <div className="log-search">
          <input
            ref={searchRef}
            className="search"
            placeholder="Search any Pokémon"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setFocused(true);
              setPicked(false);
              // The results open at the top of the page, directly under the search; bring them
              // into view when the page was scrolled down to the card.
              if (window.scrollY > 0) {
                window.scrollTo({ top: 0 });
              }
            }}
            onBlur={() => setFocused(false)}
            inputMode="search"
          />
        </div>
      </div>
      <div className="log-body">
        {showGrid ? (
          <div className="stack" style={{ gap: 8 }}>
            {!searching && first && often.length > 0 ? (
              <div
                className="stack"
                style={{ gap: 8 }}
                role="group"
                aria-label={`Often with ${name(first)}`}
              >
                <span className="meta">{`Often with ${name(first)}`}</span>
                <div className="recent-row">{often.map(token)}</div>
              </div>
            ) : null}
            <span className="meta">{searching ? 'Matches' : 'Recent'}</span>
            <div className="recent-row matches">{gridIds.map(token)}</div>
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
        ) : null}
        <p className="meta" style={{ margin: 0, textAlign: 'center' }}>
          Add all three opponents when you can. One or two still helps.
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
      </div>
      {card ? (
        <div className="log-card">
          <OpponentCard opponent={card.opponent} data={card.data} />
        </div>
      ) : null}
      <div className="result-bar">
        <div className="result-row">
          {OUTCOMES.map((o) => (
            <button
              type="button"
              key={o.key}
              className={`ui-btn result-btn result-${o.key}`}
              disabled={saving}
              aria-pressed={editing ? choice === o.key : undefined}
              onClick={() => (editing ? setChoice(o.key) : void save(o.key))}
            >
              {o.label}
            </button>
          ))}
        </div>
        {editing ? (
          <Button variant="primary" disabled={saving || !choice} onClick={() => void saveEdit()}>
            Save changes
          </Button>
        ) : null}
        <p className="meta log-help">
          <Term term="What is Tanked?">
            They quit or threw. It stays in the log but counts for nothing.
          </Term>
        </p>
      </div>
    </div>
  );
}
