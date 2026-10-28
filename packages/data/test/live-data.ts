import fs from 'node:fs';
import path from 'node:path';
import type { BattleData } from '@pickthree/battle';
import { buildBattleData, type BuildBattleResult } from '../src/build-battle.js';
import { readDatamineLock } from '../src/datamine-lock.js';
import { datamineFile } from '../src/fetch-datamine.js';
import { BATTLE_INPUT_DIR } from '../src/paths.js';

export interface LiveBuild {
  templates: unknown;
  result: BuildBattleResult;
}

let cached: LiveBuild | null | undefined;

/**
 * The pinned datamine built with the committed overrides.yaml and mechanics.yaml, once per test run.
 * Null when the datamine is not on disk; throws instead when PICKTHREE_REQUIRE_DATAMINE is '1'.
 */
export function liveBuild(): LiveBuild | null {
  if (cached !== undefined) {
    return cached;
  }
  const lock = readDatamineLock();
  const file = datamineFile(lock);
  if (!fs.existsSync(file)) {
    if (process.env.PICKTHREE_REQUIRE_DATAMINE === '1') {
      throw new Error('Datamine missing. Run npm run datamine:fetch');
    }
    cached = null;
    return cached;
  }
  const templates = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  const result = buildBattleData({
    templates,
    overridesYaml: fs.readFileSync(path.join(BATTLE_INPUT_DIR, 'overrides.yaml'), 'utf8'),
    mechanicsYaml: fs.readFileSync(path.join(BATTLE_INPUT_DIR, 'mechanics.yaml'), 'utf8'),
    source: { commit: lock.commit, date: lock.date },
  });
  cached = { templates, result };
  return cached;
}

export function liveBattleData(): BattleData | null {
  return liveBuild()?.result.data ?? null;
}
