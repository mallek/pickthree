import type { FamilyRef, LeagueData } from '../data/types.js';
import {
  bad,
  formSpeciesId,
  isRec,
  ofKind,
  optArr,
  reqNum,
  reqRec,
  reqStr,
  typeName,
  type Tpl,
} from './templates.js';

function familyRef(id: string, entry: unknown, what: string): FamilyRef {
  const e = reqRec(id, entry, what);
  const family = reqStr(id, e['id'], `${what}.id`).toLowerCase();
  let raw: unknown[] | null = null;
  if (e['forms'] !== undefined) {
    raw = optArr(id, e['forms'], `${what}.forms`);
  } else if (e['form'] !== undefined) {
    raw = [e['form']];
  }
  if (raw === null) {
    return { family, forms: null };
  }
  const forms = raw.map((f) => {
    const form = reqStr(id, f, `${what} form`);
    return form === 'FORM_UNSET' || form.endsWith('_NORMAL') ? family : formSpeciesId(form);
  });
  return { family, forms: [...new Set(forms)] };
}

export function extractLeagues(tpls: Tpl[], warnings: string[]): Record<string, LeagueData> {
  const out: Record<string, LeagueData> = {};
  for (const { tpl, body } of ofKind(tpls, 'combatLeague')) {
    const id = tpl.id.replace(/^COMBAT_LEAGUE_/, '').toLowerCase();
    const league: LeagueData = {
      id,
      title: typeof body['title'] === 'string' ? body['title'] : '',
      enabled: body['enabled'] === true,
      leagueType: typeof body['leagueType'] === 'string' ? body['leagueType'] : '',
      pokemonCount: reqNum(tpl.id, body['pokemonCount'], 'pokemonCount'),
      cpCap: null,
      maxLevel: null,
      unique: false,
      allowMegas: body['allowTempEvos'] === true,
      types: null,
      allowed: null,
      banned: [],
      caughtWindow: null,
    };
    for (const c of optArr(tpl.id, body['pokemonCondition'], 'pokemonCondition')) {
      const cond = reqRec(tpl.id, c, 'pokemonCondition entry');
      const type = reqStr(tpl.id, cond['type'], 'pokemonCondition.type');
      switch (type) {
        case 'WITH_POKEMON_CP_LIMIT': {
          const w = reqRec(tpl.id, cond['withPokemonCpLimit'], 'withPokemonCpLimit');
          league.cpCap = reqNum(tpl.id, w['maxCp'], 'withPokemonCpLimit.maxCp');
          break;
        }
        case 'POKEMON_LEVEL_RANGE': {
          const w = reqRec(tpl.id, cond['pokemonLevelRange'], 'pokemonLevelRange');
          league.maxLevel = reqNum(tpl.id, w['maxLevel'], 'pokemonLevelRange.maxLevel');
          break;
        }
        case 'WITH_UNIQUE_POKEMON':
          league.unique = true;
          break;
        case 'WITH_POKEMON_TYPE': {
          const w = reqRec(tpl.id, cond['withPokemonType'], 'withPokemonType');
          league.types = optArr(tpl.id, w['pokemonType'], 'pokemonType').map((t) =>
            typeName(tpl.id, t, 'pokemonType'),
          );
          break;
        }
        case 'POKEMON_WHITELIST': {
          const w = reqRec(tpl.id, cond['pokemonWhiteList'], 'pokemonWhiteList');
          league.allowed = optArr(tpl.id, w['pokemon'], 'pokemonWhiteList.pokemon').map((e) =>
            familyRef(tpl.id, e, 'pokemonWhiteList entry'),
          );
          break;
        }
        case 'POKEMON_BANLIST': {
          const w = reqRec(tpl.id, cond['pokemonBanList'], 'pokemonBanList');
          for (const e of optArr(tpl.id, w['pokemon'], 'pokemonBanList.pokemon')) {
            league.banned.push(familyRef(tpl.id, e, 'pokemonBanList entry'));
          }
          break;
        }
        case 'POKEMON_CAUGHT_TIMESTAMP': {
          const w = reqRec(tpl.id, cond['pokemonCaughtTimestamp'], 'pokemonCaughtTimestamp');
          league.caughtWindow = {
            after: Number(w['afterTimestamp']),
            before: Number(w['beforeTimestamp']),
          };
          if (
            !Number.isFinite(league.caughtWindow.after) ||
            !Number.isFinite(league.caughtWindow.before)
          ) {
            bad(tpl.id, 'pokemonCaughtTimestamp bounds must be numbers');
          }
          break;
        }
        default:
          warnings.push(`league ${id}: condition ${type} not modelled`);
      }
    }
    for (const b of optArr(tpl.id, body['bannedPokemon'], 'bannedPokemon')) {
      if (isRec(b)) {
        league.banned.push(familyRef(tpl.id, b, 'bannedPokemon entry'));
      } else {
        league.banned.push({
          family: reqStr(tpl.id, b, 'bannedPokemon entry').toLowerCase(),
          forms: null,
        });
      }
    }
    out[id] = league;
  }
  return out;
}
