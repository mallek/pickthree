import type { GameDataIndex } from './index.js';
import type { PokemonType, Species } from './types.js';

/**
 * Battle form changes, driven by the game master's formChange field so a new one shows up on its
 * own: Morpeko toggles on every charged move, Aegislash swaps on charged moves and shields,
 * Mimikyu's disguise breaks on the first charged hit, Cramorant gulps after Dive or Surf.
 */

function typeName(t: PokemonType): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function plainName(s: Species): string {
  return s.speciesName.replace(' (Shadow)', '');
}

/** True for the form you bring into battle when the species toggles between two forms. */
export function isDefaultToggleForm(s: Species): boolean {
  return s.formChange?.type === 'toggle' && s.formChange.defaultFormId === s.speciesId;
}

/** Forms that change back into this one (Cramorant's gulping and gorging forms point at cramorant). */
function formsPointingAt(speciesId: string, index: GameDataIndex): Species[] {
  return index.allSpecies().filter((x) => x.formChange?.alternativeFormId === speciesId);
}

function altForms(s: Species, index: GameDataIndex): Species[] {
  const fc = s.formChange;
  if (!fc) {
    return [];
  }
  if (fc.alternativeFormId) {
    const alt = index.species(fc.alternativeFormId);
    return alt ? [alt] : [];
  }
  return formsPointingAt(s.speciesId, index);
}

/** Same-named move on the alternate form with a different type, e.g. Aura Wheel Dark. */
export function altMoveType(
  speciesId: string,
  moveName: string,
  index: GameDataIndex,
): PokemonType | null {
  const s = index.species(speciesId);
  if (!s || !s.formChange) {
    return null;
  }
  const mine = [...s.fastMoves, ...s.chargedMoves]
    .map((id) => index.move(id))
    .find((m) => m && m.name === moveName);
  if (!mine) {
    return null;
  }
  for (const alt of altForms(s, index)) {
    const theirs = [...alt.fastMoves, ...alt.chargedMoves]
      .map((id) => index.move(id))
      .find((m) => m && m.name === moveName);
    if (theirs && theirs.type !== mine.type) {
      return theirs.type;
    }
  }
  return null;
}

function listNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** One sentence on what the form change does in battle, or null when the species has none. */
export function formNote(speciesId: string, index: GameDataIndex): string | null {
  const s = index.species(speciesId);
  const fc = s?.formChange;
  if (!s || !fc || fc.trigger === 'none') {
    return null;
  }
  const alts = altForms(s, index);
  const altNames = alts.map(plainName);
  const me = plainName(s);
  const moveName = (id: string): string => index.move(id)?.name ?? id;

  if (fc.type === 'toggle') {
    const parts = [
      `Switches to ${listNames(altNames)} after every charged move and back on the next.`,
    ];
    const seen = new Set<string>();
    for (const id of s.chargedMoves) {
      const name = moveName(id);
      const mine = index.move(id);
      const other = altMoveType(s.speciesId, name, index);
      if (mine && other && !seen.has(name)) {
        seen.add(name);
        parts.push(`${name} alternates ${typeName(mine.type)} and ${typeName(other)}.`);
      }
    }
    return parts.join(' ');
  }
  if (fc.trigger === 'charged_move_damage' && fc.effect === 'protect') {
    return `Its disguise takes the first charged move that hits it, then it fights on as ${listNames(altNames)}.`;
  }
  if (fc.trigger === 'charged_move') {
    const triggers = fc.moveIds.map(moveName);
    const myMoves = new Set(s.chargedMoves.map(moveName));
    // The alternate form's own trigger move is what it gains (Cramorant's Gulp Missile).
    const gained = [
      ...new Set(
        alts.flatMap((a) => [...a.chargedMoves, ...(a.formChange?.moveIds ?? [])].map(moveName)),
      ),
    ].filter((n) => !myMoves.has(n));
    const gain = gained.length > 0 ? `, which adds ${listNames(gained)}` : '';
    const via = triggers.length > 0 ? listNames(triggers) : 'A charged move';
    return `${via} turns it into ${listNames(altNames)}${gain}.`;
  }
  if (fc.trigger === 'activate_charged') {
    return `Becomes ${listNames(altNames)} when it uses a charged move, and back to ${me} when it shields.`;
  }
  if (fc.trigger === 'activate_shield') {
    return `Becomes ${listNames(altNames)} when it shields, and back to ${me} on its next charged move.`;
  }
  return null;
}
