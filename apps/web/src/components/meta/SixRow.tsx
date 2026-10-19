import { PokemonToken } from '../../components.tsx';

/**
 * A player's six in six columns: 44px sprites, a dashed "?" for a slot never seen, and, when
 * `counts` is given, a line under each slot (the event page's "picked/games").
 */
export function SixRow({ six, counts }: { six: (string | null)[]; counts?: (string | null)[] }) {
  return (
    <span className="six-row">
      {six.map((id, i) => (
        // Slots are positional: a slot's index is its identity.
        <span className="six-slot" key={i}>
          {id !== null ? (
            <PokemonToken speciesId={id} size={44} showInitial={false} />
          ) : (
            <span className="six-unseen" aria-label="Not seen" role="img">
              ?
            </span>
          )}
          {counts ? <span className="six-count">{counts[i] ?? ''}</span> : null}
        </span>
      ))}
    </span>
  );
}
