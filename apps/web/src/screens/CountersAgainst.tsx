import { Chevron, Sheet } from '@pickthree/ui';
import { useEffect, useRef, useState } from 'react';
import { PokemonToken, useName, useShortName, useSpeciesSearch } from '../components.tsx';

/** Log a Battle's cap: past it the grid asks for more letters instead of growing. */
const CAP = 30;

/**
 * The search, its matches directly under it in the compact token grid, and The whole meta as the
 * shortcut last, hidden while the search has text (the input layout rule).
 */
function AgainstBody({ onPick }: { onPick: (vs: string | null) => void }) {
  const [query, setQuery] = useState('');
  const name = useName();
  const short = useShortName();
  const hits = useSpeciesSearch(query, CAP);
  const searching = query.trim().length > 0;
  const input = useRef<HTMLInputElement>(null);
  // The search takes focus once the sheet is up, as Log a Battle's does. A frame later: the Sheet
  // focuses its dialog in an effect that runs after this one.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => input.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="counters-against">
      <input
        ref={input}
        className="search"
        type="search"
        enterKeyHint="search"
        placeholder="Search any Pokémon"
        aria-label="Search any Pokémon"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        inputMode="search"
      />
      {searching ? (
        <>
          <div className="recent-row matches">
            {hits.map((id) => (
              <button
                type="button"
                className="recent-token"
                key={id}
                onClick={() => onPick(id)}
                aria-label={name(id)}
              >
                <PokemonToken speciesId={id} size={36} />
                <span>{short(id)}</span>
              </button>
            ))}
          </div>
          {hits.length === 0 ? <p className="muted small counters-note">Nothing matches.</p> : null}
          {hits.length >= CAP ? (
            <p className="muted small counters-note">Keep typing to narrow it down.</p>
          ) : null}
        </>
      ) : (
        <button type="button" className="counters-whole" onClick={() => onPick(null)}>
          The whole meta
          <Chevron />
        </button>
      )}
    </div>
  );
}

/** Counters' Against sheet: pick one Pokémon to find its counters, or go back to the whole meta. */
export function CountersAgainst({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (vs: string | null) => void;
}) {
  return (
    <Sheet
      onClose={onClose}
      root={{
        id: 'counters-against',
        title: 'Against',
        render: () => <AgainstBody onPick={onPick} />,
      }}
    />
  );
}
