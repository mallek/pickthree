import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  BattleData,
  BattleSettings,
  LeagueData,
  MoveData,
  SpeciesData,
} from '@pickthree/battle';
import { createPvPokeContext } from '@pickthree/sim-pvpoke';
import { buildBattleData } from '../build-battle.js';
import { readDatamineLock } from '../datamine-lock.js';
import { datamineFile, ensureDatamine } from '../fetch-datamine.js';
import { ensurePvPokeCheckout } from '../fetch-pvpoke.js';
import { readLock } from '../lock.js';
import { BATTLE_INPUT_DIR, BATTLE_OUT_DIR, GAMEMASTER_PATH } from '../paths.js';
import { pvpokeToBattleData } from './convert.js';
import { toPvPokeMoveId, toPvPokeSpeciesId } from './idmap.js';

// The data exam: our datamine-built BattleData against PvPoke's game master as converted by
// pvpokeToBattleData. A report, not a gate. Differences are freshness, naming or (rarely) bugs;
// reading the report is how they are told apart.

export interface DataDiff {
  onlyOurs: string[];
  onlyTheirs: string[];
  species: string[];
  moves: string[];
  settings: string[];
  summary: string;
}

export interface PvPokeCupFilter {
  filterType: string;
  values: string[];
}

export interface PvPokeCups {
  cups: {
    name: string;
    title?: string;
    include?: PvPokeCupFilter[];
    exclude?: PvPokeCupFilter[];
  }[];
  formats: { cup: string; cp: number | string }[];
}

export interface CupsDiff {
  diffs: string[];
  onlyOurs: string[];
  onlyTheirs: string[];
}

const CPM_MAX_LEVEL = 51;
const SETTINGS_SCALARS = [
  'stab',
  'fastBonus',
  'chargedBonus',
  'shadowAtk',
  'shadowDef',
  'maxEnergy',
  'roundTurns',
] as const satisfies readonly (keyof BattleSettings)[];

function show(v: unknown): string {
  return v === undefined ? 'missing' : String(v);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function setDiff(ours: readonly string[], theirs: readonly string[]): string {
  const only = (a: readonly string[], b: readonly string[]): string[] =>
    a.filter((x) => !b.includes(x)).sort();
  const parts: string[] = [];
  const o = only(ours, theirs);
  const t = only(theirs, ours);
  if (o.length > 0) {
    parts.push(`only ours ${o.join(',')}`);
  }
  if (t.length > 0) {
    parts.push(`only pvpoke ${t.join(',')}`);
  }
  return parts.join('; ');
}

function diffSpecies(id: string, ours: SpeciesData, theirs: SpeciesData): string[] {
  const out: string[] = [];
  const scalar = (field: string, o: unknown, t: unknown): void => {
    if (o !== t) {
      out.push(`species ${id}: ${field} ours ${show(o)} pvpoke ${show(t)}`);
    }
  };
  scalar('baseStats.atk', ours.baseStats.atk, theirs.baseStats.atk);
  scalar('baseStats.def', ours.baseStats.def, theirs.baseStats.def);
  scalar('baseStats.hp', ours.baseStats.hp, theirs.baseStats.hp);
  scalar('dex', ours.dex, theirs.dex);
  scalar('types', ours.types.join(','), theirs.types.join(','));
  scalar('shadow', ours.shadow !== null, theirs.shadow !== null);
  scalar('mega', ours.tags.includes('mega'), theirs.tags.includes('mega'));
  const fastO = [...ours.fast, ...ours.eliteFast].map(toPvPokeMoveId);
  const fastT = [...theirs.fast, ...theirs.eliteFast];
  if (!sameSet(fastO, fastT)) {
    out.push(`species ${id}: fast moves ${setDiff(fastO, fastT)}`);
  }
  const chargedO = [...ours.charged, ...ours.eliteCharged];
  const chargedT = [...theirs.charged, ...theirs.eliteCharged];
  if (!sameSet(chargedO, chargedT)) {
    out.push(`species ${id}: charged moves ${setDiff(chargedO, chargedT)}`);
  }
  return out;
}

function diffMove(id: string, ours: MoveData, theirs: MoveData): string[] {
  const out: string[] = [];
  const scalar = (field: string, o: unknown, t: unknown): void => {
    if (o !== t) {
      out.push(`moves ${id}: ${field} ours ${show(o)} pvpoke ${show(t)}`);
    }
  };
  scalar('type', ours.type, theirs.type);
  scalar('category', ours.category, theirs.category);
  scalar('power', ours.power, theirs.power);
  scalar('energy', ours.energy, theirs.energy);
  scalar('energyGain', ours.energyGain, theirs.energyGain);
  scalar('turns', ours.turns, theirs.turns);
  scalar('damageKind', ours.damageKind, theirs.damageKind);
  scalar(
    'buffs',
    ours.buffs === undefined ? undefined : JSON.stringify(ours.buffs),
    theirs.buffs === undefined ? undefined : JSON.stringify(theirs.buffs),
  );
  return out;
}

function diffSettings(ours: BattleData, theirs: BattleData): string[] {
  const out: string[] = [];
  const check = (field: string, o: unknown, t: unknown): void => {
    if (o !== t) {
      out.push(`settings ${field}: ours ${show(o)} pvpoke ${show(t)}`);
    }
  };
  for (const key of SETTINGS_SCALARS) {
    check(key, ours.settings[key], theirs.settings[key]);
  }
  const so = ours.settings.stages;
  const st = theirs.settings.stages;
  check('stages.min', so.min, st.min);
  check('stages.max', so.max, st.max);
  for (let stage = Math.max(so.min, st.min); stage <= Math.min(so.max, st.max); stage += 1) {
    check(`stages.atk[stage ${stage}]`, so.atk[stage - so.min], st.atk[stage - st.min]);
    check(`stages.def[stage ${stage}]`, so.def[stage - so.min], st.def[stage - st.min]);
  }
  for (let i = 0; i <= (CPM_MAX_LEVEL - 1) * 2; i += 1) {
    const o = ours.cpm[i];
    const t = theirs.cpm[i];
    if (o === undefined && t === undefined) {
      continue;
    }
    check(`cpm[level ${1 + i / 2}]`, o, t);
  }
  return out;
}

export function diffData(ours: BattleData, theirs: BattleData): DataDiff {
  const theirIds = new Set(Object.keys(theirs.species));
  const claimed = new Set<string>();
  const onlyOurs: string[] = [];
  const onlyTheirs: string[] = [];
  const species: string[] = [];
  for (const [ourId, s] of Object.entries(ours.species)) {
    const mapped = toPvPokeSpeciesId(ourId, theirIds);
    const t = mapped === null ? undefined : theirs.species[mapped];
    if (mapped === null || t === undefined || claimed.has(mapped)) {
      onlyOurs.push(`species ${ourId}`);
      continue;
    }
    claimed.add(mapped);
    species.push(...diffSpecies(mapped, s, t));
  }
  for (const id of theirIds) {
    if (claimed.has(id)) {
      continue;
    }
    // PvPoke lists a shadow as its own species; the datamine carries it as a flag on the base.
    if (id.endsWith('_shadow') && theirIds.has(id.slice(0, -'_shadow'.length))) {
      continue;
    }
    onlyTheirs.push(`species ${id}`);
  }

  const moves: string[] = [];
  const claimedMoves = new Set<string>();
  for (const [ourId, m] of Object.entries(ours.moves)) {
    const mapped = toPvPokeMoveId(ourId);
    const t = theirs.moves[mapped];
    if (t === undefined) {
      onlyOurs.push(`move ${ourId}`);
      continue;
    }
    claimedMoves.add(mapped);
    moves.push(...diffMove(mapped, m, t));
  }
  for (const id of Object.keys(theirs.moves)) {
    if (!claimedMoves.has(id)) {
      onlyTheirs.push(`move ${id}`);
    }
  }

  const settings = diffSettings(ours, theirs);
  const count = (list: string[], prefix: string): number =>
    list.filter((l) => l.startsWith(prefix)).length;
  const summary =
    `species: ${count(onlyOurs, 'species ')} only ours, ${count(onlyTheirs, 'species ')} only pvpoke, ` +
    `${species.length} species lines; ` +
    `moves: ${count(onlyOurs, 'move ')} only ours, ${count(onlyTheirs, 'move ')} only pvpoke, ` +
    `${moves.length} move lines; ${settings.length} settings lines`;
  return { onlyOurs, onlyTheirs, species, moves, settings, summary };
}

/** The PvPoke cup a datamine league id most likely stands for, or null. */
function cupKeys(leagueId: string): string[] {
  const stripped = leagueId.replace(/^(vs_seeker_|default_)/, '');
  const residue = stripped
    .split('_')
    .filter((t) => t !== 'great' && t !== 'ultra' && t !== 'master')
    .join('_');
  const key = residue === '' ? 'all' : residue;
  return [...new Set([key, key.replaceAll('_', '')])];
}

function filterValues(filters: PvPokeCupFilter[] | undefined, type: string): string[] {
  return (filters ?? []).filter((f) => f.filterType === type).flatMap((f) => [...f.values]);
}

export function diffCups(leagues: Record<string, LeagueData>, pvpoke: PvPokeCups): CupsDiff {
  const out: CupsDiff = { diffs: [], onlyOurs: [], onlyTheirs: [] };
  const byName = new Map(pvpoke.cups.map((c) => [c.name, c]));
  const matched = new Set<string>();
  for (const league of Object.values(leagues)) {
    const name = cupKeys(league.id).find((k) => byName.has(k));
    const cup = name === undefined ? undefined : byName.get(name);
    if (name === undefined || cup === undefined) {
      out.onlyOurs.push(`league ${league.id}`);
      continue;
    }
    matched.add(name);
    const head = `cups ${league.id} ~ ${name}:`;
    const caps = pvpoke.formats.filter((f) => f.cup === name).map((f) => Number(f.cp));
    if (league.cpCap !== null && caps.length > 0 && !caps.includes(league.cpCap)) {
      out.diffs.push(`${head} cpCap ours ${league.cpCap} pvpoke ${caps.join(',')}`);
    }
    const typesO = [...(league.types ?? [])].sort();
    const typesT = filterValues(cup.include, 'type').sort();
    if (!sameSet(typesO, typesT)) {
      out.diffs.push(`${head} types ours ${typesO.join(',')} pvpoke ${typesT.join(',')}`);
    }
    const bansO = league.banned.map((b) => b.family);
    const bansT = filterValues(cup.exclude, 'id');
    if (!sameSet(bansO, bansT)) {
      out.diffs.push(`${head} banned ${setDiff(bansO, bansT)}`);
    }
  }
  for (const c of pvpoke.cups) {
    if (!matched.has(c.name)) {
      out.onlyTheirs.push(`cup ${c.name}`);
    }
  }
  return out;
}

// ---- CLI ----

function ascii(text: string): string {
  return text.replace(/[\u0080-￿]/g, '?');
}

function histogram(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const l of lines) {
    const m = /^\w+ [^:]+: ([^ ]+(?: moves)?)/.exec(l);
    const key = m?.[1] ?? 'other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`);
}

function section(title: string, lines: string[]): string[] {
  return [`## ${title} (${lines.length})`, '', ...(lines.length > 0 ? lines : ['(none)']), ''];
}

export function renderReport(header: string[], d: DataDiff, cups: CupsDiff): string {
  const lines = [
    '# Data exam',
    '',
    ...header,
    '',
    '## Summary',
    '',
    d.summary,
    `cups: ${cups.diffs.length} difference lines, ${cups.onlyOurs.length} leagues unmapped, ${cups.onlyTheirs.length} cups unmapped`,
    '',
    '## Species differences by field',
    '',
    ...histogram(d.species),
    '',
    '## Move differences by field',
    '',
    ...histogram(d.moves),
    '',
    ...section('Settings', d.settings),
    ...section('Cups', cups.diffs),
    ...section('Move differences', d.moves),
    ...section('Species differences', d.species),
    ...section('Only in ours (datamine)', d.onlyOurs),
    ...section('Only in PvPoke', d.onlyTheirs),
    ...section('Leagues with no PvPoke cup', cups.onlyOurs),
    ...section('PvPoke cups with no league', cups.onlyTheirs),
  ];
  return ascii(lines.join('\n'));
}

async function main(): Promise<void> {
  await ensureDatamine();
  await ensurePvPokeCheckout();
  const lock = readDatamineLock();
  const pvLock = readLock();
  const templates = JSON.parse(fs.readFileSync(datamineFile(lock), 'utf8')) as unknown;
  const ours = buildBattleData({
    templates,
    overridesYaml: fs.readFileSync(path.join(BATTLE_INPUT_DIR, 'overrides.yaml'), 'utf8'),
    mechanicsYaml: fs.readFileSync(path.join(BATTLE_INPUT_DIR, 'mechanics.yaml'), 'utf8'),
    source: { commit: lock.commit, date: lock.date },
  }).data;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const ctx = createPvPokeContext(JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown);
  const theirs = pvpokeToBattleData(
    ctx,
    fs.readFileSync(path.join(here, 'pvpoke-mechanics.yaml'), 'utf8'),
    pvLock.commit,
  );
  const gm = ctx.runtime.gm.data as unknown as PvPokeCups & { timestamp?: string };
  const d = diffData(ours, theirs);
  const cups = diffCups(ours.leagues, { cups: gm.cups, formats: gm.formats });
  const header = [
    `- datamine (ours): commit ${lock.commit} dated ${lock.date}`,
    `- pvpoke: commit ${pvLock.commit} locked ${pvLock.date}, game master timestamp ${gm.timestamp ?? 'unknown'}`,
    `- generated: ${new Date().toISOString()}`,
  ];
  fs.mkdirSync(BATTLE_OUT_DIR, { recursive: true });
  const out = path.join(BATTLE_OUT_DIR, 'data-exam.md');
  fs.writeFileSync(out, renderReport(header, d, cups));
  console.log(d.summary);
  console.log(
    `cups: ${cups.diffs.length} difference lines, ${cups.onlyOurs.length} leagues unmapped, ${cups.onlyTheirs.length} cups unmapped`,
  );
  console.log(`wrote ${out}`);
}

if (process.argv[1] && process.argv[1].endsWith('data-exam.ts')) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
