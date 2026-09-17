import type { PokemonType, Specimen } from '@pickthree/engine';
import type { SpeciesLite } from './host/protocol.ts';
import type { Searchable, SearchContext } from './search.ts';

function typesOf(lite: SpeciesLite | undefined): PokemonType[] {
  if (!lite) {
    return [];
  }
  return lite.types.filter((t): t is PokemonType => t !== 'none');
}

/** A species-list row: just name, types and family, for boxes that search species rather than
 * owned Pokemon (Add a Pokemon, the species side of Build's search grid). */
export function speciesRecord(id: string, name: string, lite: SpeciesLite | undefined): Searchable {
  return { name, types: typesOf(lite), familyId: lite?.familyId ?? null };
}

/** A row for one owned Pokemon: its own name/types/family plus everything a search term can ask
 * about an owned specimen (CP, HP, IV total, shadow/purified/lucky, scanned moves). */
export function specimenRecord(
  sp: Specimen,
  name: string,
  lite: SpeciesLite | undefined,
  moves: Record<string, { name: string; type: PokemonType }> | undefined,
): Searchable {
  const moveIds = [sp.currentMoves.fast, ...sp.currentMoves.charged].filter(
    (id): id is string => id !== null,
  );
  const resolvedMoves = moves
    ? moveIds
        .map((id) => moves[id])
        .filter((m): m is { name: string; type: PokemonType } => m !== undefined)
    : [];
  return {
    name,
    types: typesOf(lite),
    familyId: sp.familyId,
    cp: sp.cp,
    hp: sp.hp,
    ...(sp.ivs ? { ivTotal: sp.ivs.atk + sp.ivs.def + sp.ivs.sta } : {}),
    shadow: sp.shadow,
    purified: sp.purified,
    lucky: sp.lucky,
    moves: resolvedMoves,
  };
}

/** Resolves `+word` to the familyId of the first species (in `allSpecies` order) whose display
 * name contains the word. */
export function familyContext(
  allSpecies: readonly string[],
  name: (id: string) => string,
  species: (id: string) => SpeciesLite | undefined,
): SearchContext {
  return {
    familyOf(word: string): string | null {
      const w = word.toLowerCase();
      const match = allSpecies.find((id) => name(id).toLowerCase().includes(w));
      return match ? (species(match)?.familyId ?? null) : null;
    },
  };
}
