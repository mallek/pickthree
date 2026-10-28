import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import {
  applyOverrides,
  extractBattleData,
  unmodelledForms,
  validateOverrides,
  type OverrideReport,
} from '@pickthree/battle/extract';
import { loadBattleData, validateMechanics, type BattleData } from '@pickthree/battle';
import { readDatamineLock } from './datamine-lock.js';
import { datamineFile, ensureDatamine } from './fetch-datamine.js';
import { BATTLE_INPUT_DIR, BATTLE_OUT_DIR } from './paths.js';

export interface BuildBattleInput {
  templates: unknown;
  overridesYaml: string;
  mechanicsYaml: string;
  source: { commit: string; date: string };
}

export interface BuildBattleResult {
  data: BattleData;
  warnings: string[];
  report: OverrideReport;
  alarm: string[];
}

const OVERRIDE_KEYS = ['moves', 'species'];

/** YAML 1.2 core schema (the package default): an unquoted date stays a string. */
function parseYaml(file: string, text: string): unknown {
  try {
    return parse(text) as unknown;
  } catch (err) {
    throw new Error(`${file}: invalid YAML: ${(err as Error).message}`, { cause: err });
  }
}

export function buildBattleData(input: BuildBattleInput): BuildBattleResult {
  const overridesRaw = parseYaml('overrides.yaml', input.overridesYaml);
  const mechanicsRaw = parseYaml('mechanics.yaml', input.mechanicsYaml);
  if (typeof overridesRaw === 'object' && overridesRaw !== null && !Array.isArray(overridesRaw)) {
    for (const key of Object.keys(overridesRaw)) {
      if (!OVERRIDE_KEYS.includes(key)) {
        throw new Error(
          `overrides.yaml: unknown top-level key "${key}" (allowed: ${OVERRIDE_KEYS.join(', ')})`,
        );
      }
    }
  }
  const extracted = extractBattleData(input.templates, input.source);
  const entries = validateOverrides(overridesRaw);
  const { data: overridden, report } = applyOverrides(extracted.data, entries);
  const mechanics = validateMechanics(mechanicsRaw ?? {}, overridden);
  const data = loadBattleData({ ...overridden, mechanics });
  return {
    data,
    warnings: extracted.warnings,
    report,
    alarm: unmodelledForms(input.templates, mechanics),
  };
}

async function main(): Promise<void> {
  await ensureDatamine();
  const lock = readDatamineLock();
  const templates = JSON.parse(fs.readFileSync(datamineFile(lock), 'utf8')) as unknown;
  const r = buildBattleData({
    templates,
    overridesYaml: fs.readFileSync(path.join(BATTLE_INPUT_DIR, 'overrides.yaml'), 'utf8'),
    mechanicsYaml: fs.readFileSync(path.join(BATTLE_INPUT_DIR, 'mechanics.yaml'), 'utf8'),
    source: { commit: lock.commit, date: lock.date },
  });
  fs.mkdirSync(BATTLE_OUT_DIR, { recursive: true });
  const out = path.join(BATTLE_OUT_DIR, 'battle-data.json');
  fs.writeFileSync(out, JSON.stringify(r.data));
  console.log(
    `battle data @ ${lock.commit.slice(0, 7)}: ${Object.keys(r.data.species).length} species, ` +
      `${Object.keys(r.data.moves).length} moves, ${Object.keys(r.data.leagues).length} leagues, ` +
      `${Object.keys(r.data.mechanics).length} mechanics`,
  );
  console.log(`wrote ${out}`);
  for (const w of r.warnings) {
    console.warn(`warning: ${w}`);
  }
  for (const line of r.report.applied) {
    console.log(`override applied: ${line}`);
  }
  for (const line of r.report.redundant) {
    console.warn(`override redundant: ${line}`);
  }
  for (const line of r.report.conflicts) {
    console.error(`override CONFLICT: ${line}`);
  }
  if (r.alarm.length > 0) {
    const bar = '='.repeat(62);
    console.error(
      [
        bar,
        `UNMODELLED IN-BATTLE FORM CHANGE: ${r.alarm.join(', ')}`,
        'The datamine flags these families with ibfc.combatEnable but',
        'packages/data/battle/mechanics.yaml has no entry for them.',
        bar,
      ].join('\n'),
    );
  }
  if (r.alarm.length > 0 || r.report.conflicts.length > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('build-battle.ts')) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
