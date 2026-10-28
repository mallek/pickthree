import type { MechanicsEntry } from '../mechanics/vocabulary.js';
import { isRec, parseTemplates } from './templates.js';

/** Every family (lowercased pokemonId) the datamine flags with ibfc.combatEnable, sorted. */
export function ibfcFamilies(templates: unknown): string[] {
  const out = new Set<string>();
  for (const tpl of parseTemplates(templates)) {
    const p = tpl.data['pokemonSettings'];
    if (!isRec(p)) {
      continue;
    }
    const ibfc = p['ibfc'];
    if (isRec(ibfc) && ibfc['combatEnable'] === true && typeof p['pokemonId'] === 'string') {
      out.add(p['pokemonId'].toLowerCase());
    }
  }
  return [...out].sort();
}

/** Flagged families that have no mechanics entry, sorted. Non-empty means the build must fail. */
export function unmodelledForms(
  templates: unknown,
  mechanics: Record<string, MechanicsEntry>,
): string[] {
  return ibfcFamilies(templates).filter((f) => !Object.hasOwn(mechanics, f));
}
