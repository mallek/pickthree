import type { GameDataIndex } from '../gamedata/index.js';
import { FORMS_TO_BASE, FORM_SUFFIX, OVERRIDES } from './tables.js';

export type MapResult =
  | { ok: true; speciesId: string; viaOverride: boolean }
  | {
      ok: false;
      reason: 'unknown-species' | 'unsupported-form' | 'no-shadow-variant';
      tried: string;
    };

export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/♀/g, '_f')
    .replace(/♂/g, '_m')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Poke Genie name + form (+ shadow flag) -> PvPoke speciesId.
 * Order: overrides, then slug + form suffix, then a base-species fallback for forms PvPoke
 * folds into the base entry. Shadow selects the _shadow variant and reports when PvPoke has none.
 */
export function mapSpecies(
  name: string,
  form: string,
  shadow: boolean,
  index: GameDataIndex,
): MapResult {
  const s = slug(name);
  const f = form.trim();

  let baseId: string;
  let viaOverride = false;

  const override = OVERRIDES.find((o) => o.name === s && (o.form === '*' || o.form === f));
  if (override) {
    if (override.speciesId === null) {
      return { ok: false, reason: override.reason ?? 'unsupported-form', tried: `${s}|${f}` };
    }
    baseId = override.speciesId;
    viaOverride = true;
  } else if (FORMS_TO_BASE.has(f)) {
    baseId = s;
  } else {
    const suffix = FORM_SUFFIX[f];
    if (suffix === undefined) {
      const guess = `${s}_${slug(f)}`;
      if (index.species(guess)) {
        baseId = guess;
      } else if (index.species(s)) {
        baseId = s;
      } else {
        return { ok: false, reason: 'unsupported-form', tried: guess };
      }
    } else {
      const candidate = `${s}${suffix}`;
      if (index.species(candidate)) {
        baseId = candidate;
      } else if (suffix !== '' && index.species(s)) {
        baseId = s;
      } else {
        return { ok: false, reason: 'unknown-species', tried: candidate };
      }
    }
  }

  if (!index.species(baseId)) {
    return { ok: false, reason: 'unknown-species', tried: baseId };
  }

  if (shadow) {
    const sv = index.shadowVariant(baseId);
    if (!sv) {
      return { ok: false, reason: 'no-shadow-variant', tried: `${baseId}_shadow` };
    }
    return { ok: true, speciesId: sv.speciesId, viaOverride };
  }
  return { ok: true, speciesId: baseId, viaOverride };
}
