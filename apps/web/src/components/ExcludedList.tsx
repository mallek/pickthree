import { Button, ConfirmSheet } from '@pickthree/ui';
import { useState } from 'react';
import { PokemonToken, useName } from '../components.tsx';
import { useActions, useAppState } from '../state/store.tsx';

export const NONE_EXCLUDED =
  'None excluded. Turn a Pokémon off on its page to leave it out of teams.';

/**
 * The Pokémon left out of team recommendations, one chip each by the name it battles as, with
 * its X to let it back in, and "Include all again" behind a confirm. Teams' Filters sheet and
 * Settings > Your data both show it. Legacy per-copy exclusions still waiting to convert show
 * under their own copy's name, so nothing excluded is ever missing from the list.
 */
export function ExcludedList({ lineClassName }: { lineClassName: string }) {
  const s = useAppState();
  const { toggleExcludedSpecies, includeLegacyExcluded, includeAllExcluded } = useActions();
  const name = useName();
  const [confirmAll, setConfirmAll] = useState(false);
  const species = s.settings.excludedSpecies ?? [];
  const legacy = (s.settings.excludedSpecimenIds ?? [])
    .map((id) => s.collection?.specimens.find((sp) => sp.id === id))
    .filter((sp): sp is NonNullable<typeof sp> => Boolean(sp));
  const chips = [
    ...species.map((id) => ({
      key: `species:${id}`,
      speciesId: id,
      include: () => toggleExcludedSpecies(id),
    })),
    ...legacy.map((sp) => ({
      key: `copy:${sp.id}`,
      speciesId: sp.speciesId,
      include: () => includeLegacyExcluded(sp.id),
    })),
  ];
  if (chips.length === 0) {
    return <p className={lineClassName}>{NONE_EXCLUDED}</p>;
  }
  return (
    <>
      <div className="pills">
        {chips.map((c) => (
          <button
            type="button"
            className="x-chip"
            key={c.key}
            aria-label={`Include ${name(c.speciesId)} again`}
            onClick={c.include}
          >
            <PokemonToken speciesId={c.speciesId} size={20} showInitial={false} />
            {name(c.speciesId)}
            <span className="muted" aria-hidden="true">
              &times;
            </span>
          </button>
        ))}
      </div>
      <Button variant="secondary" onClick={() => setConfirmAll(true)}>
        Include all again
      </Button>
      {confirmAll ? (
        <ConfirmSheet
          tone="default"
          title="Include every excluded Pokémon again?"
          line="They can appear in team recommendations again."
          confirmLabel="Include all"
          cancelLabel="Keep them out"
          onConfirm={() => {
            setConfirmAll(false);
            includeAllExcluded();
          }}
          onCancel={() => setConfirmAll(false)}
        />
      ) : null}
    </>
  );
}
