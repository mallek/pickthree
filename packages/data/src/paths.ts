import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_PACKAGE_DIR = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(DATA_PACKAGE_DIR, '..', '..');
export const LOCK_PATH = path.join(DATA_PACKAGE_DIR, 'pvpoke.lock.json');
export const PVPOKE_DIR =
  process.env.PICKTHREE_PVPOKE_DIR ?? path.join(DATA_PACKAGE_DIR, '.pvpoke');
export const OUTPUT_DIR =
  process.env.PICKTHREE_DATA_OUT ?? path.join(REPO_ROOT, 'apps', 'web', 'public', 'data');

export const GAMEMASTER_PATH = path.join(PVPOKE_DIR, 'src', 'data', 'gamemaster.json');
export const RANKINGS_DIR = path.join(PVPOKE_DIR, 'src', 'data', 'rankings');
export const GROUPS_DIR = path.join(PVPOKE_DIR, 'src', 'data', 'groups');
export const OVERRIDES_DIR = path.join(PVPOKE_DIR, 'src', 'data', 'overrides');
export const PVPOKE_JS_DIR = path.join(PVPOKE_DIR, 'src', 'js');

/** The hand-kept meta reset list, beside seasons.json; the data build ships a validated copy. */
export const EPOCHS_PATH = path.join(DATA_PACKAGE_DIR, 'epochs.json');

/** The pinned PokeMiners game master: lock beside pvpoke.lock.json, download cached by commit. */
export const DATAMINE_LOCK_PATH = path.join(DATA_PACKAGE_DIR, 'datamine.lock.json');
export const DATAMINE_DIR =
  process.env.PICKTHREE_DATAMINE_DIR ?? path.join(DATA_PACKAGE_DIR, '.datamine');
/** Hand-kept battle engine inputs, and the generated battle data (gitignored). */
export const BATTLE_INPUT_DIR = path.join(DATA_PACKAGE_DIR, 'battle');
export const BATTLE_OUT_DIR =
  process.env.PICKTHREE_BATTLE_OUT ?? path.join(DATA_PACKAGE_DIR, '.battle');
