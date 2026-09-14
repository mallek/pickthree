/**
 * What the importer looks for in a collection file, described by meaning rather than by header
 * text. Each concept has header hints (normalized words that name it) and a value shape (what
 * its cells look like). Layout resolution scores every column against every concept with both.
 */
import { FORMS_TO_BASE, FORM_SUFFIX } from '../mapping/tables.js';

export type Concept =
  | 'name'
  | 'form'
  | 'cp'
  | 'hp'
  | 'atk'
  | 'def'
  | 'sta'
  | 'levelMin'
  | 'levelMax'
  | 'shadow'
  | 'purified'
  | 'lucky'
  | 'fastMove'
  | 'chargedMove1'
  | 'chargedMove2'
  | 'scanDate'
  | 'originalScanDate'
  | 'dex'
  | 'pgRankPctG'
  | 'pgRankNumG'
  | 'pgDustCostG'
  | 'pgCandyCostG'
  | 'pgNameG'
  | 'pgFormG'
  | 'pgShaPurG';

/** Without these the engine cannot rank a single Pokémon. Level and HP are derived when absent. */
export const REQUIRED_CONCEPTS: readonly Concept[] = ['name', 'cp', 'atk', 'def', 'sta'];

/** Plain words for the failure message and the import summary. */
export const CONCEPT_LABEL: Record<Concept, string> = {
  name: 'Pokémon name',
  form: 'form',
  cp: 'CP',
  hp: 'HP',
  atk: 'attack IV',
  def: 'defense IV',
  sta: 'stamina IV',
  levelMin: 'level',
  levelMax: 'maximum level',
  shadow: 'shadow flag',
  purified: 'purified flag',
  lucky: 'lucky flag',
  fastMove: 'fast move',
  chargedMove1: 'charged move',
  chargedMove2: 'second charged move',
  scanDate: 'scan date',
  originalScanDate: 'first scan date',
  dex: 'dex number',
  pgRankPctG: 'Poke Genie rank % (Great)',
  pgRankNumG: 'Poke Genie rank # (Great)',
  pgDustCostG: 'Poke Genie dust cost (Great)',
  pgCandyCostG: 'Poke Genie candy cost (Great)',
  pgNameG: 'Poke Genie name (Great)',
  pgFormG: 'Poke Genie form (Great)',
  pgShaPurG: 'Poke Genie shadow code (Great)',
};

/** What the value matchers need from the game data, passed in so this file stays pure. */
export interface ShapeDeps {
  /** True when the name (with optional form and shadow flag) maps to a known species. */
  isSpecies(name: string, form: string, shadow: boolean): boolean;
  isFastMove(name: string): boolean;
  isChargedMove(name: string): boolean;
}

export interface NormalizedHeader {
  /** Lowercase, accents and spaces gone, only letters, digits, % and # kept. */
  key: string;
  /** A trailing league marker such as (G), (U), (L) or (M), else null. */
  tag: 'g' | 'u' | 'l' | 'm' | null;
}

export function normalizeHeader(raw: string): NormalizedHeader {
  let s = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  let tag: NormalizedHeader['tag'] = null;
  const m = /\(\s*([gulm])\s*\)\s*$/.exec(s);
  if (m) {
    tag = m[1] as NormalizedHeader['tag'];
    s = s.slice(0, m.index);
  }
  return { key: s.replace(/[^a-z0-9%#]+/g, ''), tag };
}

const INT = /^-?\d+$/;
const NUM = /^-?\d+(\.\d+)?$/;

function intIn(v: string, lo: number, hi: number): boolean {
  if (!INT.test(v)) {
    return false;
  }
  const n = Number(v);
  return n >= lo && n <= hi;
}

const YES = new Set(['1', 'yes', 'y', 'true', 'x', '✓']);
const NO = new Set(['0', 'no', 'n', 'false', '']);

export function isBoolish(v: string): boolean {
  const t = v.trim().toLowerCase();
  return YES.has(t) || NO.has(t);
}

export function boolOf(v: string | undefined): boolean {
  return v !== undefined && YES.has(v.trim().toLowerCase());
}

const SHADOW_WORDS = new Set(['shadow', 'purified', 'normal', 'none', '2']);

export function isShadowish(v: string): boolean {
  const t = v.trim().toLowerCase();
  return isBoolish(t) || SHADOW_WORDS.has(t);
}

/** 0 normal, 1 shadow, 2 purified, from a code or a word. Null when the cell means nothing. */
export function shadowCodeOf(v: string | undefined): 0 | 1 | 2 | null {
  if (v === undefined) {
    return null;
  }
  const t = v.trim().toLowerCase();
  if (t === '' || t === '0' || t === 'normal' || t === 'none' || NO.has(t)) {
    return 0;
  }
  if (t === '1' || t === 'shadow' || YES.has(t)) {
    return 1;
  }
  if (t === '2' || t === 'purified') {
    return 2;
  }
  return null;
}

const DATE =
  /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|\d{4}\/\d{1,2}\/\d{1,2})([ T].*)?$/;

export function isDateish(v: string): boolean {
  return DATE.test(v.trim());
}

export function isLevel(v: string): boolean {
  const t = v.trim();
  if (!NUM.test(t)) {
    return false;
  }
  const n = Number(t);
  return n >= 1 && n <= 51 && Number.isInteger(n * 2);
}

const FORM_WORDS = new Set<string>([
  ...Object.keys(FORM_SUFFIX).map((k) => k.toLowerCase()),
  ...[...FORMS_TO_BASE].map((k) => k.toLowerCase()),
]);

export function isFormWord(v: string): boolean {
  const t = v.trim().toLowerCase();
  return t === '' || FORM_WORDS.has(t) || /^[a-z][a-z .'-]{1,24}$/.test(t);
}

/** Leading form words a hand-made sheet folds into the name: "Alolan Ninetales", "Shadow Swampert". */
const NAME_PREFIXES: { word: string; form: string | null; shadow: 0 | 1 | 2 | null }[] = [
  { word: 'shadow', form: null, shadow: 1 },
  { word: 'purified', form: null, shadow: 2 },
  ...Object.keys(FORM_SUFFIX)
    .filter((k) => k !== '' && k !== 'Normal')
    .map((k) => ({ word: k.toLowerCase(), form: k, shadow: null as 0 | 1 | 2 | null })),
];
// longest first, so "Mega Y" wins over "Mega"
NAME_PREFIXES.sort((a, b) => b.word.length - a.word.length);

export interface SplitName {
  name: string;
  form: string;
  shadow: 0 | 1 | 2 | null;
}

/**
 * Pulls form and shadow words out of a name when the file has no separate columns for them.
 * "Shadow Alolan Ninetales" -> Ninetales, Alolan, shadow. Trailing "(Alolan)" works too.
 */
export function splitName(raw: string): SplitName {
  let name = raw.trim();
  let form = '';
  let shadow: 0 | 1 | 2 | null = null;
  const paren = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name);
  if (paren) {
    name = (paren[1] as string).trim();
    form = (paren[2] as string).trim();
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of NAME_PREFIXES) {
      const re = new RegExp(`^${p.word}\\s+`, 'i');
      if (re.test(name)) {
        name = name.replace(re, '');
        if (p.form !== null && form === '') {
          form = p.form;
        }
        if (p.shadow !== null) {
          shadow = p.shadow;
        }
        changed = true;
      }
    }
  }
  return { name, form, shadow };
}

export interface ConceptDef {
  concept: Concept;
  /** Normalized header keys that name this concept outright. */
  exact: readonly string[];
  /** Fragments that suggest it. */
  partial: readonly string[];
  /** League tag the header must carry (Poke Genie's per-league columns), else none. */
  tag: NormalizedHeader['tag'];
  /** Does a non-blank cell look like this concept? */
  fits(v: string, deps: ShapeDeps): boolean;
  /** Can the value shape alone claim a column, with no header hint? */
  contentAlone: boolean;
}

export const CONCEPTS: readonly ConceptDef[] = [
  {
    concept: 'name',
    exact: ['name', 'pokemon', 'pokemonname', 'species', 'mon', 'nickname'],
    partial: ['name', 'species'],
    tag: null,
    fits: (v, d) => {
      const s = splitName(v);
      return d.isSpecies(s.name, s.form, s.shadow === 1) || d.isSpecies(v.trim(), '', false);
    },
    contentAlone: true,
  },
  {
    concept: 'form',
    exact: ['form', 'forme', 'variant', 'pokemonform'],
    partial: ['form'],
    tag: null,
    fits: (v) => isFormWord(v),
    contentAlone: false,
  },
  {
    concept: 'cp',
    exact: ['cp', 'combatpower'],
    partial: [],
    tag: null,
    fits: (v) => intIn(v.trim(), 10, 6000),
    contentAlone: true,
  },
  {
    concept: 'hp',
    exact: ['hp', 'hpstat'],
    partial: [],
    tag: null,
    fits: (v) => intIn(v.trim(), 10, 600),
    contentAlone: false,
  },
  {
    concept: 'atk',
    exact: [
      'atk',
      'atkiv',
      'attiv',
      'ivatk',
      'ivatt',
      'attack',
      'attackiv',
      'ivattack',
      'att',
      'a',
    ],
    partial: ['atk', 'att'],
    tag: null,
    fits: (v) => intIn(v.trim(), 0, 15),
    contentAlone: false,
  },
  {
    concept: 'def',
    exact: [
      'def',
      'defiv',
      'ivdef',
      'defense',
      'defence',
      'defenseiv',
      'defenceiv',
      'ivdefense',
      'd',
    ],
    partial: ['def'],
    tag: null,
    fits: (v) => intIn(v.trim(), 0, 15),
    contentAlone: false,
  },
  {
    concept: 'sta',
    exact: ['sta', 'staiv', 'ivsta', 'hpiv', 'ivhp', 'staminaiv', 'ivstamina', 'stam', 's'],
    partial: ['sta', 'hpiv'],
    tag: null,
    fits: (v) => intIn(v.trim(), 0, 15),
    contentAlone: false,
  },
  {
    concept: 'levelMin',
    exact: ['level', 'levelmin', 'lvl', 'lv', 'pokemonlevel', 'minlevel'],
    partial: ['level', 'lvl'],
    tag: null,
    fits: (v) => isLevel(v),
    contentAlone: true,
  },
  {
    concept: 'levelMax',
    exact: ['levelmax', 'maxlevel'],
    partial: [],
    tag: null,
    fits: (v) => isLevel(v),
    contentAlone: false,
  },
  {
    concept: 'shadow',
    exact: ['shadow', 'shadowpurified', 'shapur', 'isshadow'],
    partial: ['shadow'],
    tag: null,
    fits: (v) => isShadowish(v),
    contentAlone: false,
  },
  {
    concept: 'purified',
    exact: ['purified', 'ispurified'],
    partial: ['purif'],
    tag: null,
    fits: (v) => isBoolish(v),
    contentAlone: false,
  },
  {
    concept: 'lucky',
    exact: ['lucky', 'islucky'],
    partial: ['lucky'],
    tag: null,
    fits: (v) => isBoolish(v),
    contentAlone: false,
  },
  {
    concept: 'fastMove',
    exact: ['quickmove', 'fastmove', 'fastattack', 'quickattack', 'move1', 'fast', 'quick'],
    partial: ['quick', 'fast'],
    tag: null,
    fits: (v, d) => d.isFastMove(v),
    contentAlone: true,
  },
  {
    concept: 'chargedMove1',
    exact: [
      'chargemove',
      'chargedmove',
      'chargemove1',
      'chargedmove1',
      'specialmove',
      'specialmove1',
      'chargeattack',
      'chargedattack',
      'move2',
      'charge',
      'charged',
    ],
    partial: ['charge', 'special'],
    tag: null,
    fits: (v, d) => d.isChargedMove(v),
    contentAlone: true,
  },
  {
    concept: 'chargedMove2',
    exact: [
      'chargemove2',
      'chargedmove2',
      'specialmove2',
      'chargeattack2',
      'chargedattack2',
      'move3',
    ],
    partial: [],
    tag: null,
    fits: (v, d) => d.isChargedMove(v),
    contentAlone: true,
  },
  {
    concept: 'scanDate',
    exact: ['scandate', 'date', 'scanned', 'lastscan', 'lastscandate', 'scantime'],
    partial: ['scan'],
    tag: null,
    fits: (v) => isDateish(v),
    contentAlone: true,
  },
  {
    concept: 'originalScanDate',
    exact: ['originalscandate', 'firstscan', 'firstscandate'],
    partial: ['original', 'first'],
    tag: null,
    fits: (v) => isDateish(v),
    contentAlone: false,
  },
  {
    concept: 'dex',
    exact: [
      'pokemonnumber',
      'pokemon',
      'number',
      'dex',
      'dexno',
      'dexnumber',
      'no',
      'no#',
      '#',
      'id',
      'pokedex',
    ],
    partial: ['dex'],
    tag: null,
    fits: (v) => intIn(v.trim(), 1, 1200),
    contentAlone: false,
  },
  {
    concept: 'pgRankPctG',
    exact: ['rank%'],
    partial: [],
    tag: 'g',
    fits: (v) => NUM.test(v.trim().replace(/%$/, '')),
    contentAlone: false,
  },
  {
    concept: 'pgRankNumG',
    exact: ['rank#', 'rank'],
    partial: [],
    tag: 'g',
    fits: (v) => intIn(v.trim(), 1, 5000),
    contentAlone: false,
  },
  {
    concept: 'pgDustCostG',
    exact: ['dustcost'],
    partial: [],
    tag: 'g',
    fits: (v) => INT.test(v.trim().replace(/,/g, '')),
    contentAlone: false,
  },
  {
    concept: 'pgCandyCostG',
    exact: ['candycost'],
    partial: [],
    tag: 'g',
    fits: (v) => INT.test(v.trim().replace(/,/g, '')),
    contentAlone: false,
  },
  {
    concept: 'pgNameG',
    exact: ['name'],
    partial: [],
    tag: 'g',
    fits: () => true,
    contentAlone: false,
  },
  {
    concept: 'pgFormG',
    exact: ['form'],
    partial: [],
    tag: 'g',
    fits: () => true,
    contentAlone: false,
  },
  {
    concept: 'pgShaPurG',
    exact: ['shapur', 'shadowpurified'],
    partial: [],
    tag: 'g',
    fits: (v) => intIn(v.trim(), 0, 2),
    contentAlone: false,
  },
];

/**
 * Headers the known exports carry that mean nothing to the engine. A column under one of these
 * is never claimed on its values alone, so a missing CP column cannot quietly become Dust.
 */
export const IGNORED_HEADERS: ReadonlySet<string> = new Set([
  'index',
  'nr',
  'gender',
  'ivavg',
  'iv%',
  'weight',
  'height',
  'favorite',
  'favourite',
  'dust',
  'stardust',
  'candy',
  'catchdate',
  'markedforpvpuse',
  'marked',
  'overallappraisal',
  'uniqueivcombos',
  'notes',
  'note',
]);

/** 1 for an outright hit, 0.5 for a fragment, 0 otherwise. Tags must agree. */
export function headerScore(def: ConceptDef, h: NormalizedHeader): number {
  if (h.tag !== def.tag) {
    return 0;
  }
  if (def.exact.includes(h.key)) {
    return 1;
  }
  if (h.key !== '' && def.partial.some((p) => h.key.includes(p))) {
    return 0.5;
  }
  return 0;
}

/** Does this header name any concept at all? Used to decide whether row one is a header. */
export function looksLikeHeader(h: NormalizedHeader): boolean {
  return CONCEPTS.some((c) => headerScore(c, h) > 0);
}
