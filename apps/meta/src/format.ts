/**
 * Every string this site renders goes through here. Reader-facing copy is strict 7-bit ASCII,
 * so species names carrying an accent get folded rather than shown. Written as \u escapes so
 * this source file itself stays 7-bit ASCII rather than carrying the characters it strips.
 */

/** Folds a string to 7-bit ASCII, dropping combining marks and anything that survives. */
export function ascii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const FORMS: Record<string, string> = {
  Galarian: 'G',
  Alolan: 'A',
  Hisuian: 'H',
  Paldean: 'P',
  Shadow: 'S',
  Mega: 'M',
  Defense: 'D',
  Attack: 'A',
  Speed: 'S',
};

/** "Corsola (Galarian)" -> "Corsola-G". Unknown forms keep their first letter. */
export function shortName(name: string): string {
  const plain = ascii(name);
  const m = /^(.*?) \(([^)]+)\)$/.exec(plain);
  if (!m) {
    return plain;
  }
  const form = m[2]!;
  return `${m[1]!}-${FORMS[form] ?? form.slice(0, 1).toUpperCase()}`;
}

export function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** A4: whole percent, rounded, no decimal: the default everywhere a share or rate is a number to
 * glance at ("26%", never "26.0%"). */
export function pct(fraction: number): string {
  return Math.round(fraction * 100).toString();
}

/** One-decimal percent, for the rare case where the precision itself is the stated fact (a rule
 * like "ranked at 0.5% or more"), not a measurement to glance at: rounding RANKED_SHARE's 0.5% to
 * a whole percent would silently change what the rule says it does. Kept separate from `pct`
 * rather than special-cased at its one call site (Overview.tsx's ranking-cut sentence). */
export function pctPrecise(fraction: number): string {
  return (fraction * 100).toFixed(1);
}

/** FIX 2 (honesty): `pct`'s whole-percent rounding turns a genuinely nonzero share under half a
 * point into "0%", which reads as "never faced" when the truth is "faced, just rarely", the same
 * overstatement this site exists to avoid, only pointed the other way. A share that rounds to
 * zero but is not actually zero renders "<1%" instead. Includes its own "%" (unlike `pct`,
 * which leaves that to the caller), since "<1%" is not `pct`'s digits with a suffix glued on.
 * `RANKED_SHARE` already keeps every row in the ranked list above this floor, so this only
 * matters off that list: the species page, reachable for any id via "Seen next to". */
export function pctFloor(fraction: number): string {
  if (fraction <= 0) {
    return '0%';
  }
  return Math.round(fraction * 100) === 0 ? '<1%' : `${pct(fraction)}%`;
}

/** The noun alone, for a sentence that has to put something (a league name, an adjective)
 * between the count and the word. Prefer `battles()` when nothing sits in between. */
export function battleWord(n: number): string {
  return n === 1 ? 'battle' : 'battles';
}

export function battles(n: number): string {
  return `${count(n)} ${battleWord(n)}`;
}

/** Picks the singular or plural wording for a count. The count itself is formatted by the
 * caller. General-purpose: `battleWord()` above is the "battles" special case kept for call
 * sites that already had it; new sentences (a noun, a verb, anything that inflects on 1) use
 * this instead of writing another one-off helper. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function ago(iso: string, now: Date): string {
  const delta = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(delta) || delta < MIN) {
    return 'just now';
  }
  if (delta < HOUR) {
    return `${Math.floor(delta / MIN)} min ago`;
  }
  if (delta < DAY) {
    return `${Math.floor(delta / HOUR)} hr ago`;
  }
  const days = Math.floor(delta / DAY);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
