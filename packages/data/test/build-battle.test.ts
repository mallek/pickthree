import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ibfcFamilies } from '@pickthree/battle/extract';
import { minimalTemplates } from '../../battle/test/fixtures/templates.js';
import { buildBattleData } from '../src/build-battle.js';
import { datamineFile } from '../src/fetch-datamine.js';
import { readDatamineLock } from '../src/datamine-lock.js';
import { BATTLE_INPUT_DIR } from '../src/paths.js';

const source = { commit: 'abc1234', date: '2026-10-27' };

describe('buildBattleData (synthetic)', () => {
  it('keys mechanics by family and raises no alarm', () => {
    const r = buildBattleData({
      templates: minimalTemplates(),
      overridesYaml: 'moves: []\nspecies: []\n',
      mechanicsYaml: '{}\n',
      source,
    });
    expect(r.data.mechanics).toEqual({});
    expect(r.alarm).toEqual([]);
  });
  it('names overrides.yaml in a YAML syntax error', () => {
    expect(() =>
      buildBattleData({
        templates: minimalTemplates(),
        overridesYaml: 'moves: [\n',
        mechanicsYaml: '{}\n',
        source,
      }),
    ).toThrow(/overrides\.yaml/);
  });
  it('names mechanics.yaml in a YAML syntax error', () => {
    expect(() =>
      buildBattleData({
        templates: minimalTemplates(),
        overridesYaml: '{}\n',
        mechanicsYaml: 'a: [\n',
        source,
      }),
    ).toThrow(/mechanics\.yaml/);
  });
  it('rejects an unknown top-level key in overrides.yaml', () => {
    expect(() =>
      buildBattleData({
        templates: minimalTemplates(),
        overridesYaml: 'move: []\n',
        mechanicsYaml: '{}\n',
        source,
      }),
    ).toThrow(/overrides\.yaml.*"move"/);
  });
});

const overridesYaml = fs.readFileSync(path.join(BATTLE_INPUT_DIR, 'overrides.yaml'), 'utf8');
const mechanicsYaml = fs.readFileSync(path.join(BATTLE_INPUT_DIR, 'mechanics.yaml'), 'utf8');

describe('committed YAML', () => {
  it('delivers every entered date as a string, not a Date', () => {
    const o = parse(overridesYaml) as { moves: { entered: unknown }[] };
    for (const m of o.moves) {
      expect(typeof m.entered).toBe('string');
    }
    const mech = parse(mechanicsYaml) as Record<string, { entered: unknown }>;
    for (const e of Object.values(mech)) {
      expect(typeof e.entered).toBe('string');
    }
  });
});

const lock = readDatamineLock();
const file = datamineFile(lock);
const haveDatamine = fs.existsSync(file);
if (!haveDatamine && process.env.PICKTHREE_REQUIRE_DATAMINE === '1') {
  throw new Error('Datamine missing. Run npm run datamine:fetch');
}

describe.skipIf(!haveDatamine)('battle:build on the pinned datamine', () => {
  const templates = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  const r = buildBattleData({
    templates,
    overridesYaml,
    mechanicsYaml,
    source: { commit: lock.commit, date: lock.date },
  });

  it('the committed overrides and mechanics build cleanly on the pinned datamine', () => {
    expect(r.alarm).toEqual([]);
    expect(r.report.conflicts).toEqual([]);
    expect(Object.keys(r.data.mechanics).sort()).toEqual([
      'aegislash',
      'cramorant',
      'mimikyu',
      'minior',
      'morpeko',
    ]);
    expect(Object.keys(r.data.species).length).toBeGreaterThan(1000);
  });
  it('every ibfc-flagged family has a mechanics entry', () => {
    for (const f of ibfcFamilies(templates)) {
      expect(Object.keys(r.data.mechanics)).toContain(f);
    }
  });
});
