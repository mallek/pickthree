/**
 * Every string this site renders goes through here. Names and copy keep their own spelling
 * (accents, curly quotes and all); the one rule that still applies everywhere is CLAUDE.md's "no
 * em dashes".
 */

const REGIONAL_PREFIX: Record<string, string> = {
  Alolan: 'Alolan',
  Galarian: 'Galarian',
  Hisuian: 'Hisuian',
  Paldean: 'Paldean',
};

/** PvPoke's own name, spelled the way a reader would say it: "Corsola (Galarian)" becomes
 * "Galarian Corsola", "Ninetales (Alolan) (Shadow)" becomes "Shadow Alolan Ninetales". Mirrors
 * the engine's `fullName`/`displayName` (packages/engine/src/explain/explain.ts), which does the
 * same thing off a `GameDataIndex`; meta has none, so this works on the name string alone. Any
 * other parenthetical (a Mega, a Zen or Origin form) is not a regional prefix and keeps its
 * parentheses exactly as PvPoke wrote them. */
export function spelledName(pvpokeName: string): string {
  const SHADOW_SUFFIX = ' (Shadow)';
  const shadow = pvpokeName.endsWith(SHADOW_SUFFIX);
  const base = shadow ? pvpokeName.slice(0, -SHADOW_SUFFIX.length) : pvpokeName;
  const m = /^(.*) \(([^)]+)\)$/.exec(base);
  const prefix = m && m[2] ? REGIONAL_PREFIX[m[2]] : undefined;
  const named = prefix && m ? `${prefix} ${m[1]}` : base;
  return shadow ? `Shadow ${named}` : named;
}

export function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** A4: whole percent, rounded, no decimal: the default everywhere a share or rate is a number to
 * glance at ("26%", never "26.0%"). */
export function pct(fraction: number): string {
  return Math.round(fraction * 100).toString();
}

/** One-decimal percent, for a case where the precision itself is the stated fact rather than a
 * measurement to glance at: a share under half a point would round to "0%" and read as "never",
 * so a sentence quoting such a figure needs the decimal to say what it means. It has no caller
 * today (the share cut it was written for is gone, replaced by the continuous blend); it is kept
 * because the next sentence that quotes a sub-1% figure needs exactly this and nothing else in
 * this file does it. `pctFloor` below is the glance-at counterpart, for a rendered share. */
export function pctPrecise(fraction: number): string {
  return (fraction * 100).toFixed(1);
}

/** FIX 2 (honesty): `pct`'s whole-percent rounding turns a genuinely nonzero share under half a
 * point into "0%", which reads as "never faced" when the truth is "faced, just rarely", the same
 * overstatement this site exists to avoid, only pointed the other way. A share that rounds to
 * zero but is not actually zero renders "<1%" instead. Includes its own "%" (unlike `pct`,
 * which leaves that to the caller), since "<1%" is not `pct`'s digits with a suffix glued on.
 * The ranking already keeps every row in the ranked list above this floor, so this only
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
