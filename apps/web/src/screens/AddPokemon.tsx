import type { ManualResult } from '@pickthree/engine';
import { Empty, Loading } from '@pickthree/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Header,
  MetaTags,
  PokemonToken,
  TypeChips,
  useName,
  useShortName,
  useSpecies,
  useSpeciesSearch,
} from '../components.tsx';
import { ownSpeciesId } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';

type MegaForm = 'mega' | 'mega_x' | 'mega_y';

/**
 * Type a Pokémon in by hand: species, IVs from the appraisal screen, and the CP on its card. With
 * `#/add?edit=<id>` the same form is Edit values: it opens filled in from that Pokémon and saving
 * corrects it in place (a bad scan, a power-up) instead of adding one.
 */
export function AddPokemon() {
  const s = useAppState();
  const { navigate, back, addManual, updateManual } = useActions();
  const name = useName();
  const short = useShortName();
  const species = useSpecies();
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
  const [megaForm, setMegaForm] = useState<MegaForm | null>(null);
  const [level4, setLevel4] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Edit values: the Pokémon being corrected, and the form filled in from it once it is loaded.
  const editId = s.route.screen === 'add' ? (s.route.edit ?? null) : null;
  const editing = editId ? (s.collection?.specimens.find((x) => x.id === editId) ?? null) : null;
  const editFilled = useRef(false);
  useEffect(() => {
    if (editFilled.current || !editing || !s.data) {
      return;
    }
    editFilled.current = true;
    // A Shadow saved with the flag on its plain id is its Shadow form, as everywhere else.
    const own = ownSpeciesId(editing);
    setSpeciesId(s.data.species[own] ? own : null);
    // A copy whose IVs never came through starts blank, so nothing is saved by accident.
    setAtk(editing.ivs ? String(editing.ivs.atk) : '');
    setDef(editing.ivs ? String(editing.ivs.def) : '');
    setSta(editing.ivs ? String(editing.ivs.sta) : '');
    setCp(String(editing.cp));
    setLucky(editing.lucky);
    setMegaForm(editing.shadow ? null : (editing.megaForm ?? null));
    setLevel4(editing.megaLevel4 === true);
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

  const iv = (v: string): number => Number.parseInt(v, 10);
  const ready =
    speciesId !== null &&
    [atk, def, sta].every((v) => /^\d{1,2}$/.test(v) && iv(v) <= 15) &&
    /^\d{2,4}$/.test(cp) &&
    s.boot === 'ready' &&
    !busy;

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
      };
      const marks = megaForm
        ? { megaForm, ...(chosenMega?.superMega && level4 ? { megaLevel4: true } : {}) }
        : undefined;
      const r: ManualResult = editId
        ? await updateManual(editId, input, marks)
        : await addManual(input, marks);
      if (!r.exactCp) {
        setNote(
          `No level gives exactly CP ${cp} with those IVs. Saved at level ${r.level}, CP ${r.matchedCp}. Check the IVs if that looks wrong.`,
        );
        leave.current = window.setTimeout(() => {
          leave.current = null;
          navigate({ screen: 'specimen', id: r.specimen.id }, { replace: true });
        }, 2500);
      } else {
        navigate({ screen: 'specimen', id: r.specimen.id }, { replace: true });
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

  if (editId && !editing) {
    return (
      <div className="screen">
        <Header
          title="Edit values"
          onBack={() => back({ screen: 'collection' })}
          backLabel="Back"
        />
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

  return (
    <div className="screen">
      {editId ? (
        <Header
          title="Edit values"
          sub="Type in what the game shows you now."
          onBack={() => back({ screen: 'specimen', id: editId })}
          backLabel="Back"
        />
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
          <input
            className="search"
            placeholder="Search any Pokemon, e.g. shadow swampert"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="search"
            autoFocus={speciesId === null && !editId}
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
          {speciesId ? (
            <button
              type="button"
              className="pick-slot open"
              onClick={() => {
                setSpeciesId(null);
                setMegaForm(null);
                setLevel4(false);
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
          <b>IVs</b>
          <span className="small muted">
            From the appraisal screen: each bar is 0 to 15. Three full bars is 15 15 15.
          </span>
          <div className="iv-grid">
            {ivField('Attack', atk, setAtk)}
            {ivField('Defense', def, setDef)}
            {ivField('HP', sta, setSta)}
          </div>
          {megas.length === 1 ? (
            <label className="row small" style={{ gap: 8, alignItems: 'center' }}>
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
          ) : null}
          {megas.length > 1 ? (
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
          ) : null}
          {chosenMega?.superMega ? (
            <label className="row small" style={{ gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={level4}
                onChange={(e) => setLevel4(e.target.checked)}
              />
              Mega Level 4
            </label>
          ) : null}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>CP</b>
          <span className="small muted">
            The number on the Pokémon right now. pick3 works out the level from CP and IVs.
          </span>
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
          <label className="row small" style={{ gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={lucky} onChange={(e) => setLucky(e.target.checked)} />
            Lucky (half price to power up)
          </label>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {note ? <div className="error">{note}</div> : null}
        <button type="button" className="btn" disabled={!ready} onClick={() => void submit()}>
          {editId
            ? busy
              ? 'Saving...'
              : 'Save changes'
            : busy
              ? 'Adding...'
              : 'Add to my collection'}
        </button>
        <p className="meta faint" style={{ margin: 0 }}>
          {editId
            ? 'pick3 works out the level from CP and IVs, then judges this Pokémon again.'
            : 'Added Pokémon get the same verdicts, teams and costs as scanned ones. You can remove one from its page.'}
        </p>
      </div>
    </div>
  );
}
