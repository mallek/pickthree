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
