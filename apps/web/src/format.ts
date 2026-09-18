import type { Layout, MetaRank } from '@pickthree/engine';
import type { Cost, IvRankResult, Species } from '@pickthree/engine';

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

/** One sentence for a team's battle rating. Mirrors the engine's fitWhy, kept here so the main
 * bundle does not pull the engine in. */
export function fitWhy(
  fit: 'Strong' | 'Solid' | 'Situational' | 'Weak',
  covered: number,
  n: number,
  topUncovered: number,
): string {
  const cover = `beats ${covered} of ${n} meta Pokémon`;
  const top =
    topUncovered === 0
      ? 'every one of the top ten has an answer'
      : `${topUncovered} of the top ten ${topUncovered === 1 ? 'has' : 'have'} no answer`;
  switch (fit) {
    case 'Strong':
      return `Ready to run: ${cover} and ${top}.`;
    case 'Solid':
      return `Playable: ${cover}, ${top}. Expect to lose some leads.`;
    case 'Situational':
      return `Thin: ${cover} and ${top}. It wins when the matchups fall right.`;
    default:
      return `Not competitive: ${cover} and ${top}. Swap at least one member.`;
  }
}

/** Import summary line: what the file was read as. Mirrors the engine's Layout without importing it. */
export function layoutLine(layout: Layout | undefined): string | null {
  if (!layout || layout.columnCount === 0) {
    return null;
  }
  const label =
    layout.format === 'poke-genie'
      ? 'a Poke Genie export'
      : layout.format === 'calcy-iv'
        ? 'a Calcy IV export'
        : layout.hasHeader
          ? 'a sheet'
          : 'a sheet with no header row';
  return `Read as ${label}: ${layout.columnCount} columns, ${layout.columns.length} used.`;
}

/** One sentence per thing the file did not carry, so a wrong guess is visible before you trust the teams. */
export function layoutNotes(layout: Layout | undefined, hasShadows: boolean): string[] {
  if (!layout || layout.columnCount === 0) {
    return [];
  }
  const missing = new Set(layout.missing);
  const notes: string[] = [];
  if (layout.ivOrderAssumed) {
    notes.push(
      'The three IV columns had no labels; pick3 read them as attack, defense, stamina in that order.',
    );
  }
  if (missing.has('levelMin')) {
    notes.push('Level was worked out from CP and IVs.');
  }
  if (missing.has('shadow') && !hasShadows) {
    notes.push('No shadow column, so every Pokémon is treated as normal.');
  }
  if (missing.has('fastMove') && missing.has('chargedMove1')) {
    notes.push('No moves, so second-move costs assume nothing is unlocked.');
  }
  if (missing.has('scanDate')) {
    notes.push('No scan dates, so the Scanned recently filter is off.');
  }
  return notes;
}

/** One line for the diagnostics log: structure only, never values. Mirrors the engine's describeLayout. */
export function describeLayoutLine(layout: Layout): string {
  const cols = layout.columns
    .map((c) => `${c.concept}=${c.header ?? `col${c.index + 1}`}<${c.via[0]}>`)
    .join(' ');
  const unused = layout.unused.length > 0 ? ` unused=${layout.unused.join('|')}` : '';
  return `format=${layout.format} cols=${layout.columnCount} header=${layout.hasHeader ? 1 : 0} conf=${layout.confidence.toFixed(2)} ${cols}${unused}`;
}

export function emptyLayoutValue(): Layout {
  return {
    format: 'sheet',
    delimiter: ',',
    hasHeader: true,
    columnCount: 0,
    columns: [],
    unused: [],
    missing: [],
    ivOrderAssumed: false,
    confidence: 1,
  };
}
