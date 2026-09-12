import type { MetaRank } from '@pickthree/engine';
import type { Cost, IvRankResult, PokemonType, Species } from '@pickthree/engine';

const REGIONAL: Record<string, string> = {
  '(Alolan)': 'Alolan',
  '(Galarian)': 'Galarian',
  '(Hisuian)': 'Hisuian',
  '(Paldean)': 'Paldean',
  '(Shadow)': 'Shadow',
};

/** "Raichu (Alolan)" -> "Alolan Raichu"; shadow ids get a "Shadow " prefix. */
export function speciesDisplayName(speciesId: string, species: Species | undefined): string {
  let name = species?.speciesName ?? speciesId;
  name = name.replace(' (Shadow)', '');
  for (const [suffix, prefix] of Object.entries(REGIONAL)) {
    if (suffix !== '(Shadow)' && name.endsWith(` ${suffix}`)) {
      name = `${prefix} ${name.slice(0, -suffix.length - 1)}`;
    }
  }
  const m = /^(.*) \(([^)]+)\)$/.exec(name);
  if (m) {
    name = `${m[1]} (${m[2]})`;
  }
  return speciesId.endsWith('_shadow') ? `Shadow ${name}` : name;
}

export function shortName(speciesId: string, species: Species | undefined): string {
  return speciesDisplayName(speciesId, species)
    .replace(/^Shadow /, 'S. ')
    .replace(/^Galarian /, 'G. ')
    .replace(/^Alolan /, 'A. ');
}

export function initialOf(displayName: string): string {
  const base = displayName.replace(/^(Shadow|Galarian|Alolan|Hisuian|Paldean) /, '');
  return base.charAt(0).toUpperCase();
}

export function typeColor(t: PokemonType | 'none'): string {
  return t === 'none' ? 'transparent' : `var(--type-${t})`;
}

export function typeLabel(t: PokemonType | 'none'): string {
  return t === 'none' ? '' : t.charAt(0).toUpperCase() + t.slice(1);
}

export function num(n: number): string {
  return n.toLocaleString('en-US');
}

export function costLine(c: Cost): string {
  const parts = [`${num(c.stardust)} Stardust`, `${num(c.candy)} Candy`];
  if (c.xlCandy > 0) {
    parts.push(`${num(c.xlCandy)} XL Candy`);
  }
  if (c.eliteTm > 0) {
    parts.push(`${c.eliteTm} Elite TM`);
  }
  return parts.join(' · ');
}

export function topPct(r: IvRankResult): number {
  return Math.max(1, Math.round((r.rank / r.total) * 100));
}

export function ivLine(ivs: { atk: number; def: number; sta: number } | null): string {
  return ivs ? `${ivs.atk} / ${ivs.def} / ${ivs.sta}` : '? / ? / ?';
}

export function levelLabel(level: { min: number; max: number }): string {
  return level.min === level.max ? `${level.max}` : `${level.min} to ${level.max}`;
}

export function dateLabel(iso: string): string {
  // Plain YYYY-MM-DD is a calendar date, not a UTC instant: parse it in local time.
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function scanAge(scanDate: string, now = new Date()): string {
  const d = new Date(scanDate.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) {
    return scanDate;
  }
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) {
    return 'scanned today';
  }
  if (days === 1) {
    return 'scanned yesterday';
  }
  if (days < 30) {
    return `scanned ${days} days ago`;
  }
  return `scanned ${dateLabel(d.toISOString())}`;
}

/** Only species inside this cutoff get meta tags. Mirrors the engine's META_CUTOFF. */
export const META_CUTOFF = 50;

/** "#18 overall", "#5 closer". Empty outside the cutoff. Mirrors the engine's metaRankTags. */
export function metaTags(rank: MetaRank | undefined, cutoff = META_CUTOFF): string[] {
  if (!rank) {
    return [];
  }
  const tags: string[] = [];
  if (rank.overall <= cutoff) {
    tags.push(`#${rank.overall} overall`);
  }
  if (rank.role && rank.roleRank !== null && rank.roleRank <= cutoff) {
    tags.push(`#${rank.roleRank} ${rank.role}`);
  }
  return tags;
}
