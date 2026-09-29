import { allowedInLeague, type League, type Species } from '@pickthree/engine';

/** Species ids `league` admits, by the same check the engine's eligibility pass uses. */
export function legalSpeciesIds(species: Species[], league: League): string[] {
  return species.filter((sp) => allowedInLeague(sp, league)).map((sp) => sp.speciesId);
}
