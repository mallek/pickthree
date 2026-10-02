import type { GameDataIndex } from '../gamedata/index.js';
import { cpFor, statsFor } from '../math/cp.js';
import type { Specimen } from './specimen.js';

/**
 * The same Pokemon one evolution on: its id, level and IVs stay, the CP and HP are the new
 * species' at that level, and its moves are forgotten because evolving changes them.
 */
export function evolveSpecimen(
  s: Specimen,
  toSpeciesId: string,
  index: GameDataIndex,
  now: string,
): Specimen {
  const from = index.mustSpecies(s.speciesId);
  if (!s.ivs) {
    throw new Error(`pick3 needs this ${from.speciesName}'s IVs before it can evolve it.`);
  }
  const target = index
    .stagesFrom(s.speciesId)
    .slice(1)
    .find((x) => x.speciesId === toSpeciesId);
  if (!target) {
    const to = index.species(toSpeciesId)?.speciesName ?? toSpeciesId;
    throw new Error(`${from.speciesName} cannot evolve into ${to}.`);
  }
  const level = s.level.max;
  const cp = cpFor(target.baseStats, s.ivs, level);
  const hp = statsFor(target.baseStats, s.ivs, level).hp;
  const next: Specimen = {
    ...s,
    speciesId: target.speciesId,
    familyId: target.familyId,
    level: { min: level, max: level },
    cp,
    hp,
    currentMoves: { fast: null, charged: [] },
    // A Mega mark belongs to the species it was scanned as.
    megaForm: null,
    raw: { ...s.raw, name: target.speciesName, cp, hp, fastMove: null, chargedMoves: [] },
    evolvedFrom: s.speciesId,
    editedAt: now,
  };
  delete next.megaLevel4;
  return next;
}
