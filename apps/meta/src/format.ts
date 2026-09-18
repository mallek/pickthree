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

export function pct(fraction: number): string {
  return (fraction * 100).toFixed(1);
}

export function battles(n: number): string {
  return `${count(n)} ${n === 1 ? 'battle' : 'battles'}`;
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
