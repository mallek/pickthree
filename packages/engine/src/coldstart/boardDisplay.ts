/**
 * How a board row names a Pokemon: the plain name, the sprite to show, and small tags for what
 * the name's parentheses said. PvPoke names forms as "Charizard (Mega X)", "Kingdra (Shadow)",
 * "Marowak (Alolan) (Shadow)", "Darmanitan (Galarian Zen)".
 */
export type TagKind = 'mega' | 'region' | 'form' | 'shadow';

export interface MemberDisplay {
  name: string;
  /** Sprite id: a Shadow uses its base sprite, the board draws the shadow treatment. */
  sprite: string;
  /** Mega, then region, then form, then Shadow. */
  tags: { kind: TagKind; text: string }[];
}

const REGIONS = ['Alolan', 'Galarian', 'Hisuian', 'Paldean'];
const ORDER: TagKind[] = ['mega', 'region', 'form', 'shadow'];
const NAMES: Record<string, string> = {
  type_null: 'Type: Null',
  mime_jr: 'Mime Jr.',
};

export function memberDisplay(speciesName: string, speciesId: string): MemberDisplay {
  // Check for name override (handles cases where parentheses parse incorrectly)
  const baseId = speciesId.replace(/_shadow$/, '');
  if (baseId in NAMES) {
    return { name: NAMES[baseId]!, sprite: speciesId.replace(/_shadow$/, ''), tags: [] };
  }

  const name = speciesName.split(' (')[0]!.trim();
  const tags: { kind: TagKind; text: string }[] = [];
  for (const m of speciesName.matchAll(/\(([^)]+)\)/g)) {
    const part = m[1]!.trim();
    if (part === 'Shadow') {
      tags.push({ kind: 'shadow', text: 'Shadow' });
    } else if (/^Mega( [XY])?$/.test(part) || part === 'Primal') {
      tags.push({ kind: 'mega', text: part });
    } else {
      const [first, ...rest] = part.split(' ');
      if (first !== undefined && REGIONS.includes(first)) {
        tags.push({ kind: 'region', text: first });
        if (rest.length > 0) {
          tags.push({ kind: 'form', text: rest.join(' ') });
        }
      } else {
        tags.push({ kind: 'form', text: part });
      }
    }
  }
  tags.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return { name, sprite: speciesId.replace(/_shadow$/, ''), tags };
}

/** The first `max` distinct names among the ids, in order: a Shadow and its base read the same. */
export function cautionNames(
  ids: readonly string[],
  nameOf: (id: string) => string,
  max = 3,
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const name = nameOf(id);
    if (!out.includes(name)) {
      out.push(name);
    }
    if (out.length >= max) {
      break;
    }
  }
  return out;
}
