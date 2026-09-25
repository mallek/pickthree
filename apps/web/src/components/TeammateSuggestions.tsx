import type { SuggestResult, TeamPick } from '@pickthree/engine';
import { ErrorState, Tag } from '@pickthree/ui';
import { PokemonToken, useName } from '../components.tsx';
import { useAppState } from '../state/store.tsx';

export interface TeammateOffer {
  speciesId: string;
  pick: TeamPick;
  standIn: boolean;
  line: string;
}

/**
 * Each offer's first fill, one per species, none already on the board. Only the first fill's
 * reason is framed against the pins alone; a second fill's reason names the first, so it is left
 * for the next run, once the player has added a teammate.
 */
export function teammateOffers(result: SuggestResult, onBoard: string[]): TeammateOffer[] {
  const seen = new Set(onBoard);
  const out: TeammateOffer[] = [];
  for (const sug of result.suggestions) {
    const f = sug.fills[0];
    if (!f || seen.has(f.speciesId)) {
      continue;
    }
    seen.add(f.speciesId);
    out.push({ speciesId: f.speciesId, pick: f.pick, standIn: f.standIn, line: f.line });
  }
  return out;
}

/**
 * Teammates for the one or two Pokémon on the board, found on their own from the matchup matrix.
 * Nothing here fills a slot until the player taps a row; the verdict is Analyze's job.
 *
 * Spec: docs/superpowers/specs/2026-09-25-design-core-flow-design.md, "Build Your Team".
 */
export function TeammateSuggestions({
  filled,
  onBoard,
  onAdd,
}: {
  filled: 1 | 2;
  onBoard: string[];
  onAdd(pick: TeamPick): void;
}) {
  const s = useAppState();
  const name = useName();
  if (s.suggestError) {
    return <ErrorState line={s.suggestError} />;
  }
  const offers = s.suggestion ? teammateOffers(s.suggestion, onBoard) : [];
  if (offers.length === 0) {
    return s.suggesting ? <p className="meta">Finding teammates...</p> : null;
  }
  return (
    <section className="mate-list" aria-label="Suggested teammates">
      <h3 className="mate-head">
        {filled === 1 ? 'Best with your first pick' : 'Best with your first two'}
      </h3>
      {s.suggestion?.pinLine ? <p className="meta">{s.suggestion.pinLine}</p> : null}
      {offers.map((o) => (
        <button
          type="button"
          key={o.speciesId}
          className="mate-row"
          aria-label={`Add ${name(o.speciesId)}`}
          onClick={() => onAdd(o.pick)}
        >
          <PokemonToken speciesId={o.speciesId} size={40} />
          <span className="mate-text">
            <span className="mate-name">
              {name(o.speciesId)}
              {o.standIn ? null : <Tag>yours</Tag>}
            </span>
            <span className="meta">{o.line}</span>
          </span>
          <span className="mate-add" aria-hidden="true">
            + Add
          </span>
        </button>
      ))}
    </section>
  );
}
