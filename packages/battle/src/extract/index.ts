import type { BattleData } from '../data/types.js';
import { loadBattleData } from '../data/load.js';
import { extractLeagues } from './leagues.js';
import { extractMoves } from './moves.js';
import { extractCpm, extractSettings, extractTypes } from './settings.js';
import { extractSpecies } from './species.js';
import { parseTemplates } from './templates.js';

/**
 * Build BattleData from the raw datamine array of { templateId, data }.
 * Unknown template kinds are ignored; a malformed template that is needed throws with its templateId.
 * data.mechanics is empty here; it is filled by the mechanics step.
 */
export function extractBattleData(
  templates: unknown,
  source: { commit: string; date: string },
): { data: BattleData; warnings: string[] } {
  const tpls = parseTemplates(templates);
  const warnings: string[] = [];
  const { types, effectiveness } = extractTypes(tpls);
  const settings = extractSettings(tpls);
  const cpm = extractCpm(tpls);
  const pool = extractMoves(tpls, types);
  const species = extractSpecies(tpls, types, pool, warnings);
  const leagues = extractLeagues(tpls, warnings);
  const data: BattleData = {
    version: 1,
    source: { kind: 'datamine', commit: source.commit, date: source.date },
    settings,
    types,
    effectiveness,
    cpm,
    moves: pool.moves,
    species,
    leagues,
    mechanics: {},
  };
  return { data: loadBattleData(data), warnings };
}

export { applyOverrides, validateOverrides } from './overrides.js';
export type { OverrideEntry, OverrideReport } from './overrides.js';
export { ibfcFamilies, unmodelledForms } from './alarm.js';
