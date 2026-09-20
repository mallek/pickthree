import { useEffect, useRef } from 'react';
import { PokemonToken, useName, useShortName } from '../components.tsx';
import { useAppState } from '../state/store.tsx';

/**
 * Teammates for the one or two Pokemon already on the board.
 *
 * The first offer is already in the slots by the time this renders, so the chips are for
 * changing your mind. Every line here is a reason out of the matchup matrix; the verdict is
 * Analyze's job, one tap later, which is why no score appears on this panel.
 *
 * Spec: docs/superpowers/specs/2026-09-19-suggest-teammates-design.md
 */
export function TeammateSuggestions({ taken, onTake }: { taken: number; onTake(i: number): void }) {
  const s = useAppState();
  const short = useShortName();
  const name = useName();
  const offer = s.suggestion;
  const box = useRef<HTMLDivElement>(null);
  // The board fills above the fold; the reasons are what the player pressed the button for, so
  // bring them into view rather than leaving them under the tab bar.
  useEffect(() => {
    if (offer) {
      box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [offer]);
  if (s.suggestError) {
    return <div className="error">{s.suggestError}</div>;
  }
  if (!offer || offer.suggestions.length === 0) {
    return null;
  }
  const picked = offer.suggestions[taken] ?? offer.suggestions[0];
  return (
    <div className="stack" style={{ gap: 8 }} ref={box}>
      {offer.pinLine ? (
        <p className="small" style={{ margin: 0 }}>
          {offer.pinLine}
        </p>
      ) : null}
      {offer.suggestions.length > 1 ? (
        <div className="recent-row">
          {offer.suggestions.map((sug, i) => (
            <button
              type="button"
              key={sug.label}
              className={`chip${i === taken ? ' on' : ''}`}
              aria-pressed={i === taken}
              onClick={() => onTake(i)}
            >
              {sug.label}
            </button>
          ))}
        </div>
      ) : null}
      {picked ? (
        <div className="stack" style={{ gap: 6 }}>
          {picked.fills.map((f) => (
            <div key={f.speciesId} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <PokemonToken speciesId={f.speciesId} size={28} />
              <div className="stack" style={{ gap: 2 }}>
                <span className="small">
                  {short(f.speciesId)}
                  {f.standIn ? <span className="tag"> not caught</span> : null}
                </span>
                <span className="meta faint" aria-label={`Why ${name(f.speciesId)}`}>
                  {f.line}
                </span>
              </div>
            </div>
          ))}
          {picked.chase ? (
            <p className="meta faint" style={{ margin: 0 }}>
              You are one Pokemon away from this one. It runs at an assumed good IV spread until
              you catch it.
            </p>
          ) : null}
          {picked.sightings !== null ? (
            <p className="meta faint" style={{ margin: 0 }}>
              {picked.sightings} shared {picked.sightings === 1 ? 'battle' : 'battles'} ran this
              trio.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
