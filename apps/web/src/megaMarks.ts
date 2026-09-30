import type { Specimen } from '@pickthree/engine';

function sameIvs(a: Specimen, b: Specimen): boolean {
  return (
    a.ivs !== null &&
    b.ivs !== null &&
    a.ivs.atk === b.ivs.atk &&
    a.ivs.def === b.ivs.def &&
    a.ivs.sta === b.ivs.sta
  );
}

/**
 * A CSV never carries Mega Level 4, so a re-import carries the player's marks across. A specimen
 * id includes level and CP, so the same Pokémon powered up gets a new id: match on species,
 * shadow flag and IVs instead. One match takes the mark; several take it only by the same id;
 * an ambiguous copy stays unmarked rather than marking the wrong one.
 */
export function carryMegaLevel4(oldSpecimens: Specimen[], fresh: Specimen[]): Specimen[] {
  const marked = new Set<string>();
  for (const old of oldSpecimens) {
    if (old.megaLevel4 !== true) {
      continue;
    }
    const matches = fresh.filter(
      (n) => n.speciesId === old.speciesId && n.shadow === old.shadow && sameIvs(old, n),
    );
    const pick = matches.length === 1 ? matches[0] : matches.find((n) => n.id === old.id);
    if (pick) {
      marked.add(pick.id);
    }
  }
  return fresh.map((n) => (marked.has(n.id) ? { ...n, megaLevel4: true } : n));
}
