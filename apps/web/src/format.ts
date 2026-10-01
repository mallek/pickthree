import type { Layout, League, LeagueStatus, MetaRank } from '@pickthree/engine';
import type { Cost, IvRankResult, Species, Specimen, VerdictLabel } from '@pickthree/engine';

// Re-exported, not duplicated: SpeciesToken (packages/ui) needs its own copy internally, and
// format.test.ts tests this one directly, so this stays the one place web code and web tests
// import it from.
export { initialOf } from '@pickthree/ui';

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
  const mega = m ? /^Mega( [XY])?$/.exec(m[2] ?? '') : null;
  if (m && mega) {
    // PvPoke "Charizard (Mega Y)" -> "Mega Charizard Y".
    name = `Mega ${m[1]}${mega[1] ?? ''}`;
  } else if (m) {
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

export function num(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * The " · " between facts on one line, with a non-breaking space before the dot: a wrap keeps
 * the dot with the word before it ("Lv 14 ·" then the next line), never at a line's start.
 */
export const SEP = '\u00a0· ';

/** A number and its unit held together with non-breaking spaces: "88 XL Candy" never splits. */
export function amount(n: string, unit: string): string {
  return `${n}\u00a0${unit.replaceAll(' ', '\u00a0')}`;
}

export interface CostPart {
  /** The formatted number alone, e.g. "12,500" or "1". */
  amount: string;
  /** The unit label alone, e.g. "Stardust", "XL Candy", "Elite TM". */
  unit: string;
  /** amount and unit joined with non-breaking spaces, ready to drop straight into a string. */
  text: string;
  /** Set when the unit has a GLOSSARY entry, so a caller can wrap just the unit word in a Term
   * instead of re-deriving which parts of a cost carry one. */
  term?: 'XL Candy' | 'Elite TM';
}

function costPart(n: string, unit: string, term?: 'XL Candy' | 'Elite TM'): CostPart {
  return { amount: n, unit, text: amount(n, unit), ...(term ? { term } : {}) };
}

/** Stardust, Candy, then XL Candy and Elite TM when the build needs them, zero ones omitted. The
 * one place this ordering and these zero-checks live: `costLine` and `PokemonDetails`'
 * `CostBreakdown` both build on this instead of keeping their own copy. */
export function costParts(c: Cost): CostPart[] {
  const parts: CostPart[] = [
    costPart(num(c.stardust), 'Stardust'),
    costPart(num(c.candy), 'Candy'),
  ];
  if (c.xlCandy > 0) {
    parts.push(costPart(num(c.xlCandy), 'XL Candy', 'XL Candy'));
  }
  if (c.eliteTm > 0) {
    parts.push(costPart(String(c.eliteTm), 'Elite TM', 'Elite TM'));
  }
  if (c.megaEnergy !== null) {
    // No amount on purpose: the label alone says a Mega Evolution is part of the cost.
    const label = c.megaEnergy === 'ready' ? 'Mega Energy (mega-evolved before)' : 'Mega Energy';
    parts.push({ amount: '', unit: label, text: label });
  }
  return parts;
}

/**
 * What to power up to: the base form's CP, the number on the screen while powering up. A Mega
 * build adds the Mega form's CP in battle, and says so when it is a Level 4 Mega.
 */
export function powerUpLine(build: {
  cp: number;
  baseCp: number;
  mega: { level4: boolean } | null;
}): string {
  if (!build.mega) {
    return `Power up to CP ${build.baseCp}`;
  }
  const level4 = build.mega.level4 ? ', Level 4' : '';
  return `Power up to CP ${build.baseCp} (${build.cp} as Mega${level4})`;
}

export function costLine(c: Cost): string {
  return costParts(c)
    .map((p) => p.text)
    .join(SEP);
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

/**
 * Which of your copies an exclusion covers, grouped by their own species name, largest group
 * first: "Covers your 6 Meltan and 1 Melmetal." Pokémon names take no plural.
 */
export function coversLine(groups: readonly { name: string; count: number }[]): string {
  const parts = [...groups]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((g) => `${g.count} ${g.name}`);
  const last = parts.pop() ?? '';
  return `Covers your ${parts.length > 0 ? `${parts.join(', ')} and ${last}` : last}.`;
}

/** Judging the collection failed: Collection and the Pokémon detail page say so the same way. */
export function judgeFailedLine(error: string): string {
  return `Could not judge this collection: ${error}. The list still works; verdicts will retry on the next import.`;
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

/** Import summary line: what the file was read as. Mirrors the engine's Layout without importing it. */
export function layoutLine(layout: Layout | undefined): string | null {
  if (!layout || layout.columnCount === 0) {
    return null;
  }
  const label =
    layout.format === 'poke-genie' || layout.format === 'calcy-iv'
      ? 'a scan export'
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Tue 9/29" in the phone's own time zone. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** The Leagues sheet's lines under a cup: when it runs, and whether PvPoke's data is old. */
export function leagueDetail(
  status: LeagueStatus,
  league: Pick<League, 'kind' | 'stale' | 'rankingsUpdated'>,
): string[] {
  if (league.kind !== 'rotation') {
    return [];
  }
  const out: string[] = [];
  if (status.state === 'live') {
    out.push(`Live, ends ${dayLabel(status.end)}`);
  } else if (status.state === 'upcoming') {
    out.push(`Starts ${dayLabel(status.start)}`);
  }
  if (league.stale && league.rankingsUpdated) {
    const [y, m] = league.rankingsUpdated.split('-');
    out.push(`PvPoke last updated ${MONTHS[Number(m) - 1]} ${y}`);
  }
  return out;
}

/** A copy's IV standing for a row: "Top N%", or why there is none. */
export function rankLabel(
  s: Specimen,
  verdict:
    | {
        build: { ivRank: { rank: number; total: number } } | null;
        label: VerdictLabel;
        ineligible?: 'banned' | 'over-cap' | null;
      }
    | undefined,
): string {
  if (!s.ivs) {
    return 'IVs unknown';
  }
  if (!verdict) {
    return 'Ranking...';
  }
  if (verdict.label === 'Not eligible' || !verdict.build) {
    return verdict.ineligible === 'banned' ? 'Banned in this league' : 'Over the CP cap';
  }
  const r = verdict.build.ivRank;
  return `Top ${Math.max(1, Math.round((r.rank / r.total) * 100))}%`;
}

/**
 * The species id a copy is listed under. The importer maps a Shadow to its own `_shadow` id; a
 * copy saved with the Shadow flag on a plain id is its Shadow form too. A Shadow copy owns only
 * the Shadow id, never the plain one.
 */
export function ownSpeciesId(sp: Pick<Specimen, 'speciesId' | 'shadow'>): string {
  return sp.shadow && !sp.speciesId.endsWith('_shadow') ? `${sp.speciesId}_shadow` : sp.speciesId;
}
