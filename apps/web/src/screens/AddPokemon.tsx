import type { ManualResult } from '@pickthree/engine';
import { useState } from 'react';
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
import { useActions, useAppState } from '../state/store.tsx';

/** Type a Pokémon in by hand: species, IVs from the appraisal screen, and the CP on its card. */
export function AddPokemon() {
  const s = useAppState();
  const { navigate, addManual } = useActions();
  const name = useName();
  const short = useShortName();
  const species = useSpecies();
  const [query, setQuery] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [atk, setAtk] = useState('15');
  const [def, setDef] = useState('15');
  const [sta, setSta] = useState('15');
  const [cp, setCp] = useState('');
  const [lucky, setLucky] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const searching = query.trim().length > 0;
  const matches = useSpeciesSearch(query, 30);

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
      const r: ManualResult = await addManual({
        speciesId,
        ivs: { atk: iv(atk), def: iv(def), sta: iv(sta) },
        cp: iv(cp),
        lucky,
      });
      if (!r.exactCp) {
        setNote(
          `No level gives exactly CP ${cp} with those IVs. Saved at level ${r.level}, CP ${r.matchedCp}. Check the IVs if that looks wrong.`,
        );
        window.setTimeout(() => navigate({ screen: 'specimen', id: r.specimen.id }), 2500);
      } else {
        navigate({ screen: 'specimen', id: r.specimen.id });
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

  return (
    <div className="screen">
      <Header
        title="Add a Pokémon"
        sub="No Poke Genie export needed. Type in what the game shows you."
        onBack={() => navigate(s.collection ? { screen: 'collection' } : { screen: 'welcome' })}
        backLabel={s.collection ? 'Collection' : 'Start'}
      />
      <div className="scroll" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 8 }}>
          <b>Which Pokémon</b>
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
          {busy ? 'Adding...' : 'Add to my collection'}
        </button>
        <p className="meta faint" style={{ margin: 0 }}>
          Added Pokémon get the same verdicts, teams and costs as scanned ones. You can remove one
          from its page.
        </p>
      </div>
    </div>
  );
}
