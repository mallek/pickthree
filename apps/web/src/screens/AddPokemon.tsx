import { cpFor, levelForCp, type ManualResult, type MovePool } from '@pickthree/engine';
import {
  Button,
  ConfirmSheet,
  Empty,
  Header as SubHeader,
  IconButton,
  Loading,
  SaveBar,
  Select,
} from '@pickthree/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CogGlyph,
  Header,
  MetaTags,
  PokemonToken,
  TypeChips,
  useName,
  useShortName,
  useSpecies,
  useSpeciesSearch,
} from '../components.tsx';
import { useLeague } from '../components/LeagueSwitcher.tsx';
import { MovesCard, movesEntered, type KnownMoves } from '../components/species/MovesCard.tsx';
import { ownSpeciesId } from '../format.ts';
import { canGoBack } from '../state/history.ts';
import { useActions, useAppState } from '../state/store.tsx';

type MegaForm = 'mega' | 'mega_x' | 'mega_y';

/** Frustration and Return come with being Shadow or Purified, not from a species' move pool. */
const SHADOW_MOVES = ['FRUSTRATION', 'RETURN'];

/** Everything the form holds, as one value, so "has anything changed" is one comparison. */
interface FormValues {
  speciesId: string | null;
  atk: string;
  def: string;
  sta: string;
  cp: string;
  lucky: boolean;
  purified: boolean;
  megaForm: MegaForm | null;
  level4: boolean;
  /** Null: the moves are not entered. */
  moves: KnownMoves | null;
}

function sameValues(a: FormValues, b: FormValues): boolean {
  const key = (m: KnownMoves | null): string =>
    m ? `${m.fast ?? ''}|${[...m.charged].sort().join('+')}` : '-';
  return (
    a.speciesId === b.speciesId &&
    a.atk === b.atk &&
    a.def === b.def &&
    a.sta === b.sta &&
    a.cp === b.cp &&
    a.lucky === b.lucky &&
    a.purified === b.purified &&
    a.megaForm === b.megaForm &&
    a.level4 === b.level4 &&
    key(a.moves) === key(b.moves)
  );
}

const iv = (v: string): number => Number.parseInt(v, 10);
const ivOk = (v: string): boolean => /^\d{1,2}$/.test(v) && iv(v) <= 15;

/**
 * Type a Pokémon in by hand: species, CP, IVs from the appraisal screen, and optionally its moves.
 * With `#/add?edit=<id>` the same form is Edit: it opens filled in from that Pokémon and saving
 * changes it in place (a bad scan, a power-up, an evolution, the moves it knows). Edit saves from
 * a bar that appears once something differs from what is stored.
 */
export function AddPokemon() {
  const s = useAppState();
  const { navigate, back, openSheet, addManual, updateManual, movePool } = useActions();
  const name = useName();
  const short = useShortName();
  const species = useSpecies();
  const league = useLeague();
  const [query, setQuery] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  // `#/add?species=<id>` (from a species page) starts with that Pokémon picked, once the game data
  // lists the id among the released species the picker searches. It only ever fills an empty pick, once, so the player's own changes win.
  const prefilled = useRef(false);
  const routeSpecies = s.route.screen === 'add' ? s.route.species : undefined;
  useEffect(() => {
    if (prefilled.current || !routeSpecies || !s.data) {
      return;
    }
    prefilled.current = true;
    if (s.data.allSpecies.includes(routeSpecies)) {
      setSpeciesId(routeSpecies);
    }
  }, [routeSpecies, s.data]);
  const [atk, setAtk] = useState('15');
  const [def, setDef] = useState('15');
  const [sta, setSta] = useState('15');
  const [cp, setCp] = useState('');
  const [lucky, setLucky] = useState(false);
  const [purified, setPurified] = useState(false);
  const [megaForm, setMegaForm] = useState<MegaForm | null>(null);
  const [level4, setLevel4] = useState(false);
  const [moves, setMoves] = useState<KnownMoves | null>(null);
  /** The level an evolution keeps: sent with the save, used only while it still gives the CP. */
  const [keepLevel, setKeepLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Edit: the Pokémon being changed, and the form filled in from it once it is loaded.
  const editId = s.route.screen === 'add' ? (s.route.edit ?? null) : null;
  const editing = editId ? (s.collection?.specimens.find((x) => x.id === editId) ?? null) : null;
  /** The species it is stored as; the form's own species differs once an evolution is picked. */
  const origin = editing ? ownSpeciesId(editing) : null;
  const [stored, setStored] = useState<FormValues | null>(null);
  const editFilled = useRef(false);
  useEffect(() => {
    if (editFilled.current || !editing || !s.data) {
      return;
    }
    editFilled.current = true;
    // A Shadow saved with the flag on its plain id is its Shadow form, as everywhere else.
    const own = ownSpeciesId(editing);
    const values: FormValues = {
      speciesId: s.data.species[own] ? own : null,
      // A copy whose IVs never came through starts blank, so nothing is saved by accident.
      atk: editing.ivs ? String(editing.ivs.atk) : '',
      def: editing.ivs ? String(editing.ivs.def) : '',
      sta: editing.ivs ? String(editing.ivs.sta) : '',
      cp: String(editing.cp),
      lucky: editing.lucky,
      purified: editing.purified && !editing.shadow,
      megaForm: editing.shadow ? null : (editing.megaForm ?? null),
      level4: editing.megaLevel4 === true,
      moves: movesEntered(editing.currentMoves)
        ? { fast: editing.currentMoves.fast, charged: [...editing.currentMoves.charged] }
        : null,
    };
    setStored(values);
    setSpeciesId(values.speciesId);
    setAtk(values.atk);
    setDef(values.def);
    setSta(values.sta);
    setCp(values.cp);
    setLucky(values.lucky);
    setPurified(values.purified);
    setMegaForm(values.megaForm);
    setLevel4(values.level4);
    setMoves(values.moves);
    setKeepLevel(editing.level.max);
  }, [editing, s.data]);
  // The new Pokémon's page takes this form's place in history, so Back from it goes where Add was
  // opened from, not to an empty form. A delayed hand-off is dropped if the player leaves first,
  // so it never replaces whatever page they went to.
  const leave = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (leave.current !== null) {
        window.clearTimeout(leave.current);
      }
    },
    [],
  );

  // The Megas this species has: every Mega species pointing back at it. A shadow has none to offer
  // (a shadow cannot Mega Evolve), and its own id is never a Mega's base.
  const megas = useMemo(() => {
    const found: { form: MegaForm; superMega: boolean }[] = [];
    const all = s.data?.species ?? {};
    if (!speciesId || speciesId.endsWith('_shadow')) {
      return found;
    }
    for (const [id, sp] of Object.entries(all)) {
      const form = sp.megaOf === speciesId ? id.slice(speciesId.length + 1) : '';
      if (form === 'mega' || form === 'mega_x' || form === 'mega_y') {
        found.push({ form, superMega: sp.superMega === true });
      }
    }
    return found.sort((a, b) => a.form.localeCompare(b.form));
  }, [s.data, speciesId]);
  const chosenMega = megas.find((m) => m.form === megaForm);

  const searching = query.trim().length > 0;
  const matches = useSpeciesSearch(query, 30, { megas: false });

  const shadow = speciesId?.endsWith('_shadow') === true;
  const valid = [atk, def, sta].every(ivOk) && /^\d{2,4}$/.test(cp);
  const ready = speciesId !== null && valid && s.boot === 'ready' && !busy;

  // The level those numbers give, shown as they change. An evolved Pokémon keeps the level it
  // had while that level still gives the CP in the box.
  const baseStats = speciesId ? species(speciesId)?.baseStats : undefined;
  const calc = useMemo(() => {
    if (!baseStats || !valid) {
      return null;
    }
    const ivs = { atk: iv(atk), def: iv(def), sta: iv(sta) };
    if (keepLevel !== null && cpFor(baseStats, ivs, keepLevel) === iv(cp)) {
      return { level: keepLevel, cp: iv(cp), exact: true };
    }
    return levelForCp(baseStats, ivs, iv(cp));
  }, [baseStats, valid, atk, def, sta, cp, keepLevel]);

  // Every move the species can know, with PvPoke's set for the league in play starred. The counts
  // follow the fast move ticked, so the pool is asked again when it changes.
  const fastId = moves?.fast ?? null;
  const poolKey =
    speciesId && s.boot === 'ready' ? `${league.id}|${speciesId}|${fastId ?? ''}` : null;
  const [pool, setPool] = useState<{ key: string; species: string; pool: MovePool } | null>(null);
  useEffect(() => {
    if (!poolKey || !speciesId) {
      return;
    }
    let live = true;
    const none = { fast: null, charged: [] };
    const ask = (fast: string | null) =>
      // Promise.resolve tolerates a test double that returns the pool directly, or nothing.
      Promise.resolve(movePool(speciesId, fast, none, { allowEliteTm: true }));
    ask(fastId)
      // A stored fast move the species no longer lists: the counts fall back to PvPoke's.
      .catch(() => ask(null))
      .then(
        (p) => {
          if (live && p) {
            setPool({ key: poolKey, species: speciesId, pool: p });
          }
        },
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [poolKey, speciesId, fastId, movePool]);
  // The last pool of this species stays up while the next one (another fast move) loads.
  const shownPool = pool && pool.species === speciesId ? pool.pool : null;
  /** The entered moves the card can show: a move the pool does not list has no row to tick. */
  const cardMoves = useMemo((): KnownMoves | null => {
    if (!moves || !shownPool) {
      return moves;
    }
    return {
      fast: shownPool.fast.some((m) => m.moveId === moves.fast) ? moves.fast : null,
      charged: moves.charged.filter((id) => shownPool.charged.some((m) => m.moveId === id)),
    };
  }, [moves, shownPool]);

  const values: FormValues = {
    speciesId,
    atk,
    def,
    sta,
    cp,
    lucky,
    purified: purified && !shadow,
    megaForm,
    level4,
    moves,
  };
  const dirty = editId !== null && stored !== null && !sameValues(values, stored);

  const evolved = editing !== null && origin !== null && speciesId !== null && speciesId !== origin;
  const laterStages = origin ? (species(origin)?.evolvesTo ?? []) : [];

  /** Evolve select: the same Pokémon as a later stage, at the level and IVs in the form. */
  const evolveTo = (target: string): void => {
    if (!editing || !origin || !stored) {
      return;
    }
    setMegaForm(null);
    setLevel4(false);
    setNote(null);
    if (target === origin) {
      // Back to what it is stored as: its own CP, moves and Mega mark come back.
      setSpeciesId(origin);
      setCp(stored.cp);
      setMoves(stored.moves);
      setMegaForm(stored.megaForm);
      setLevel4(stored.level4);
      setKeepLevel(editing.level.max);
      return;
    }
    const to = species(target)?.baseStats;
    const level = calc?.level ?? editing.level.max;
    setSpeciesId(target);
    // Evolving changes its moves, so they go back to not entered.
    setMoves(null);
    setKeepLevel(level);
    if (to && [atk, def, sta].every(ivOk)) {
      setCp(String(cpFor(to, { atk: iv(atk), def: iv(def), sta: iv(sta) }, level)));
    }
  };

  const discard = (): void => {
    if (!stored || !editing) {
      return;
    }
    setSpeciesId(stored.speciesId);
    setAtk(stored.atk);
    setDef(stored.def);
    setSta(stored.sta);
    setCp(stored.cp);
    setLucky(stored.lucky);
    setPurified(stored.purified);
    setMegaForm(stored.megaForm);
    setLevel4(stored.level4);
    setMoves(stored.moves);
    setKeepLevel(editing.level.max);
    setError(null);
    setNote(null);
  };

  /** What goes to the engine as the moves it knows: only moves the species can learn. */
  const movesToSave = (): KnownMoves => {
    if (!moves) {
      return { fast: null, charged: [] };
    }
    if (!shownPool) {
      return moves;
    }
    return {
      fast: shownPool.fast.some((m) => m.moveId === moves.fast) ? moves.fast : null,
      charged: moves.charged.filter(
        (id) => SHADOW_MOVES.includes(id) || shownPool.charged.some((m) => m.moveId === id),
      ),
    };
  };

  const submit = async (): Promise<void> => {
    if (!ready || !speciesId) {
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const input = {
        speciesId,
        ivs: { atk: iv(atk), def: iv(def), sta: iv(sta) },
        cp: iv(cp),
        lucky,
        purified: purified && !shadow,
        currentMoves: movesToSave(),
        ...(keepLevel !== null ? { level: keepLevel } : {}),
      };
      const marks = megaForm
        ? { megaForm, ...(chosenMega?.superMega && level4 ? { megaLevel4: true } : {}) }
        : undefined;
      const r: ManualResult = editId
        ? await updateManual(editId, input, marks, evolved && origin ? { evolvedFrom: origin } : {})
        : await addManual(input, marks);
      // A new Pokémon's species page takes the Add form's place. An edit goes back to whatever
      // opened it (a species page), so no page is left twice in history; opened straight from a
      // link, with nothing behind, it lands on the Pokémon's species page.
      const finish = (): void => {
        // Evolved, it is no longer on the page that opened the form: its new species page it is.
        if (editId && canGoBack() && !evolved) {
          window.history.back();
        } else {
          navigate(
            { screen: 'species', id: ownSpeciesId(r.specimen), copy: r.specimen.id },
            { replace: true },
          );
        }
      };
      if (!r.exactCp) {
        setNote(
          `No level gives exactly CP ${cp} with those IVs. Saved at level ${r.level}, CP ${r.matchedCp}. Check the IVs if that looks wrong.`,
        );
        leave.current = window.setTimeout(() => {
          leave.current = null;
          finish();
        }, 2500);
      } else {
        finish();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ivField = (label: string, value: string, set: (v: string) => void) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={15}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );

  // Edit is reached from a species page, so it carries the signed sub header: Back on the left,
  // the title, Settings on the right. Back asks first while there are changes to lose.
  const editHeader = (to: Parameters<typeof back>[0], sub?: string) => (
    <SubHeader
      variant="sub"
      title="Edit"
      sub={sub}
      back={{ label: 'Back', onClick: () => (dirty ? setLeaving(true) : back(to)) }}
      actions={
        <IconButton label="Settings" onClick={openSheet}>
          <CogGlyph />
        </IconButton>
      }
    />
  );

  if (editId && !editing) {
    return (
      <div className="screen">
        {editHeader({ screen: 'collection' })}
        <div className="scroll">
          {s.settingsLoaded ? (
            <Empty line="That Pokémon is not in the current collection." />
          ) : (
            <Loading label="Loading your collection" />
          )}
        </div>
      </div>
    );
  }

  const backTo: Parameters<typeof back>[0] =
    editing && origin
      ? { screen: 'species', id: origin, copy: editing.id }
      : { screen: 'collection' };
  const was = evolved && origin ? origin : !evolved ? editing?.evolvedFrom : undefined;

  return (
    <div className="screen">
      {editId ? (
        editHeader(backTo, 'Type in what the game shows you now.')
      ) : (
        <Header
          title="Add a Pokémon"
          sub="No file needed. Type in what the game shows you."
          onBack={() => navigate(s.collection ? { screen: 'collection' } : { screen: 'welcome' })}
          backLabel={s.collection ? 'Collection' : 'Start'}
        />
      )}
      <div className="scroll" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 8 }}>
          <b>Which Pokémon</b>
          {/* Edit changes the numbers, not which Pokémon it is: no search, no Change. */}
          {editId ? null : (
            <>
              <input
                className="search"
                placeholder="Search any Pokemon, e.g. shadow swampert"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                inputMode="search"
                autoFocus={speciesId === null}
              />
              {searching ? (
                <>
                  <span className="meta">Matches</span>
                  <div className="recent-row matches">
                    {matches.map((id) => (
                      <button
                        type="button"
                        className="recent-token"
                        key={id}
                        onClick={() => {
                          setSpeciesId(id);
                          setMegaForm(null);
                          setLevel4(false);
                          setMoves(null);
                          setQuery('');
                        }}
                        aria-label={name(id)}
                      >
                        <PokemonToken speciesId={id} size={36} />
                        <span>{short(id)}</span>
                      </button>
                    ))}
                  </div>
                  {matches.length === 0 ? (
                    <p className="muted small" style={{ margin: 0 }}>
                      Nothing matches. Try "shadow" plus the name, or a type like "water".
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          )}
          {speciesId && editId ? (
            <div className="pick-slot open" data-locked="">
              <span className="pick-body">
                <PokemonToken speciesId={speciesId} size={40} />
                <span style={{ minWidth: 0 }}>
                  <span className="spec-name">
                    {name(speciesId)}
                    <TypeChips types={species(speciesId)?.types ?? []} small />
                  </span>
                  {was ? <span className="meta">Evolved from {name(was)}</span> : null}
                  <MetaTags speciesId={speciesId} />
                </span>
              </span>
            </div>
          ) : null}
          {editId && origin && laterStages.length > 0 ? (
            <>
              <Select
                label="Evolved it? Pick what it is now"
                value={evolved && speciesId ? speciesId : origin}
                options={[
                  { value: origin, label: `Still ${name(origin)}` },
                  ...laterStages.map((id) => ({ value: id, label: name(id) })),
                ]}
                onChange={evolveTo}
              />
              {evolved ? (
                <span className="small muted">
                  It keeps its level and IVs. Its CP becomes {cp} and its moves go back to not
                  entered.
                </span>
              ) : null}
            </>
          ) : null}
          {speciesId && !editId ? (
            <button
              type="button"
              className="pick-slot open"
              onClick={() => {
                setSpeciesId(null);
                setMegaForm(null);
                setLevel4(false);
                setMoves(null);
                setQuery('');
              }}
            >
              <span className="pick-body">
                <PokemonToken speciesId={speciesId} size={40} />
                <span style={{ minWidth: 0 }}>
                  <span className="spec-name">
                    {name(speciesId)}
                    <TypeChips types={species(speciesId)?.types ?? []} small />
                  </span>
                  <MetaTags speciesId={speciesId} />
                </span>
                <span className="pick-change">Change</span>
              </span>
            </button>
          ) : null}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>CP</b>
          <span className="small muted">The number on the Pokémon right now.</span>
          <label className="field">
            <span>CP</span>
            <input
              type="number"
              inputMode="numeric"
              min={10}
              max={9999}
              placeholder="e.g. 1487"
              value={cp}
              onChange={(e) => setCp(e.target.value)}
            />
          </label>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>IVs</b>
          <span className="small muted">
            From the appraisal screen: each bar is 0 to 15. Three full bars is 15 15 15.
          </span>
          <div className="iv-grid">
            {ivField('Attack', atk, setAtk)}
            {ivField('Defense', def, setDef)}
            {ivField('HP', sta, setSta)}
          </div>
          {calc ? (
            <div className="card" style={{ gap: 8 }}>
              <div className="kv" style={{ alignItems: 'baseline' }}>
                <span className="muted">Calculated level</span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{calc.level}</span>
              </div>
              {calc.exact ? null : (
                <p className="small muted" style={{ margin: 0 }}>
                  No level gives exactly CP {cp} with those IVs. The nearest is CP {calc.cp}.
                </p>
              )}
            </div>
          ) : (
            <span className="small muted">pick3 works out the level from CP and IVs.</span>
          )}
        </div>

        {speciesId && shownPool ? (
          <div className="stack" style={{ gap: 8 }}>
            <b>Moves</b>
            <MovesCard
              pool={shownPool}
              known={cardMoves}
              onChange={setMoves}
              leagueTitle={league.title}
              note={
                moves
                  ? 'pick3 uses these to work out what the recommended moves would cost.'
                  : 'Moves not entered yet. pick3 assumes the starred moves.'
              }
            />
            <div style={{ display: 'flex', marginLeft: -8 }}>
              {moves ? (
                <Button variant="text" onClick={() => setMoves(null)}>
                  Clear moves
                </Button>
              ) : (
                <Button
                  variant="text"
                  onClick={() =>
                    setMoves({
                      fast: shownPool.recommended.fast,
                      charged: [...shownPool.recommended.charged],
                    })
                  }
                >
                  These are its moves
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {megas.length > 0 ? (
          <div className="stack" style={{ gap: 8 }}>
            <b>Mega</b>
            {megas.length === 1 ? (
              <label className="row small check-row" style={{ gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={megaForm !== null}
                  onChange={(e) => {
                    setMegaForm(e.target.checked ? megas[0]!.form : null);
                    setLevel4(false);
                  }}
                />
                Mega-evolved before
              </label>
            ) : (
              <label className="field">
                <span>Mega-evolved before</span>
                <select
                  value={megaForm ?? ''}
                  onChange={(e) => {
                    setMegaForm((e.target.value || null) as MegaForm | null);
                    setLevel4(false);
                  }}
                >
                  <option value="">No</option>
                  {megas.map((m) => (
                    <option key={m.form} value={m.form}>
                      {m.form === 'mega_x' ? 'Mega X' : m.form === 'mega_y' ? 'Mega Y' : 'Mega'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {chosenMega?.superMega ? (
              <label className="row small check-row" style={{ gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={level4}
                  onChange={(e) => setLevel4(e.target.checked)}
                />
                Mega Level 4
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="stack" style={{ gap: 8 }}>
          <b>Other</b>
          <label className="row small check-row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={lucky} onChange={(e) => setLucky(e.target.checked)} />
            Lucky (half price to power up)
          </label>
          {/* A Shadow is not Purified; purifying it makes it another Pokémon to add. */}
          {shadow ? null : (
            <label className="row small check-row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={purified}
                onChange={(e) => setPurified(e.target.checked)}
              />
              Purified (costs less to power up)
            </label>
          )}
        </div>

        {error ? <div className="error">{error}</div> : null}
        {note ? <div className="error">{note}</div> : null}
        {editId ? null : (
          <button type="button" className="btn" disabled={!ready} onClick={() => void submit()}>
            {busy ? 'Adding...' : 'Add to my collection'}
          </button>
        )}
        <p className="meta faint" style={{ margin: 0 }}>
          {editId
            ? 'pick3 judges this Pokémon again when you save. A Poke Genie import only replaces what you enter here when its scan is newer.'
            : 'Added Pokémon get the same verdicts, teams and costs as scanned ones. You can remove one from its page.'}
        </p>
        {dirty ? (
          <SaveBar
            saveLabel={busy ? 'Saving...' : 'Save changes'}
            discardLabel="Discard"
            onSave={() => void submit()}
            onDiscard={discard}
            busy={busy}
            disabled={!ready}
          />
        ) : null}
      </div>
      {leaving ? (
        <ConfirmSheet
          title="Discard your changes?"
          line="What you changed here has not been saved."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={() => {
            setLeaving(false);
            back(backTo);
          }}
          onCancel={() => setLeaving(false)}
        />
      ) : null}
    </div>
  );
}
