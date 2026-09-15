/**
 * Pokémon pictures for the app: one 96px WebP per PvPoke species, from the HOME renders in the
 * PokeAPI sprites repo. Resolution goes PvPoke id -> PokeAPI variety name -> pokemon id via the
 * species record, with fallbacks (default variety of the same dex, then the gen sprite) so every
 * species gets a picture. Downloads are cached under packages/data/.cache so a rebuild is cheap.
 *
 * Set PICKTHREE_SKIP_SPRITES=1 to leave them out (local engine work does not need them).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Species } from '@pickthree/engine';
import { DATA_PACKAGE_DIR } from './paths.js';

const CACHE_DIR = path.join(DATA_PACKAGE_DIR, '.cache');
const API = 'https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const SIZE = 96;
const CONCURRENCY = 8;

/** PvPoke ids whose PokeAPI variety name does not follow the suffix rules. */
const FIXUPS: Record<string, string> = {
  nidoran_female: 'nidoran-f',
  nidoran_male: 'nidoran-m',
  necrozma_dawn_wings: 'necrozma-dawn',
  necrozma_dusk_mane: 'necrozma-dusk',
  zacian_crowned_sword: 'zacian-crowned',
  zacian_hero: 'zacian',
  zamazenta_crowned_shield: 'zamazenta-crowned',
  zamazenta_hero: 'zamazenta',
  calyrex_ice_rider: 'calyrex-ice',
  koraidon_apex: 'koraidon',
  miraidon_ultimate: 'miraidon',
  minior_core: 'minior-red',
  minior_meteor: 'minior-red-meteor',
  hoopa_confined: 'hoopa',
  tauros_aqua: 'tauros-paldea-aqua-breed',
  tauros_blaze: 'tauros-paldea-blaze-breed',
  tauros_combat: 'tauros-paldea-combat-breed',
  darmanitan_standard: 'darmanitan-standard',
  darmanitan_galarian_standard: 'darmanitan-galar-standard',
  darmanitan_galarian_zen: 'darmanitan-galar-zen',
  wishiwashi_solo: 'wishiwashi-solo',
  wishiwashi_school: 'wishiwashi-school',
  zygarde_10: 'zygarde-10',
  zygarde_complete: 'zygarde-complete',
  mimikyu_busted: 'mimikyu-busted',
  eiscue_ice: 'eiscue-ice',
  eiscue_noice: 'eiscue-noice',
  morpeko_full_belly: 'morpeko-full-belly',
  morpeko_hangry: 'morpeko-hangry',
};

const SUFFIXES: [RegExp, string][] = [
  [/_alolan$/, '-alola'],
  [/_galarian$/, '-galar'],
  [/_hisuian$/, '-hisui'],
  [/_paldean$/, '-paldea'],
];

/** The PokeAPI variety name to try first for a PvPoke id (shadow suffix already removed). */
export function varietyNameFor(speciesId: string): string {
  const fixed = FIXUPS[speciesId];
  if (fixed) {
    return fixed;
  }
  let id = speciesId;
  for (const [re, to] of SUFFIXES) {
    if (re.test(id)) {
      id = id.replace(re, to);
      break;
    }
  }
  return id.replace(/_/g, '-');
}

interface SpeciesRecord {
  varieties: { is_default: boolean; pokemon: { name: string; url: string } }[];
}

async function cachedFetch(url: string, file: string): Promise<Buffer | null> {
  const missing = `${file}.missing`;
  if (fs.existsSync(file)) {
    return fs.readFileSync(file);
  }
  if (fs.existsSync(missing)) {
    return null;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url);
  if (res.status === 404) {
    fs.writeFileSync(missing, '');
    return null;
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

async function speciesRecord(dex: number): Promise<SpeciesRecord | null> {
  const buf = await cachedFetch(
    `${API}/pokemon-species/${dex}/index.json`,
    path.join(CACHE_DIR, 'pokeapi', 'species', `${dex}.json`),
  );
  return buf ? (JSON.parse(buf.toString('utf8')) as SpeciesRecord) : null;
}

function pokemonIdOf(url: string): number {
  const m = /\/pokemon\/(\d+)\/?$/.exec(url);
  return m ? Number(m[1]) : 0;
}

async function render(pokemonId: number): Promise<Buffer | null> {
  const home = await cachedFetch(
    `${SPRITES}/other/home/${pokemonId}.png`,
    path.join(CACHE_DIR, 'sprites', 'home', `${pokemonId}.png`),
  );
  if (home) {
    return home;
  }
  return cachedFetch(
    `${SPRITES}/${pokemonId}.png`,
    path.join(CACHE_DIR, 'sprites', 'gen', `${pokemonId}.png`),
  );
}

export interface SpriteReport {
  written: number;
  /** PvPoke ids that used the dex's default variety instead of their own form. */
  fellBack: string[];
  /** PvPoke ids with no picture at all. */
  missing: string[];
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

export async function writeSprites(outDir: string, species: Species[]): Promise<SpriteReport> {
  const dir = path.join(outDir, 'sprites');
  fs.mkdirSync(dir, { recursive: true });
  const bases = new Map<string, number>();
  for (const s of species) {
    const id = s.speciesId.replace(/_shadow$/, '');
    if (!bases.has(id) && s.dex > 0) {
      bases.set(id, s.dex);
    }
  }
  const report: SpriteReport = { written: 0, fellBack: [], missing: [] };
  const records = new Map<number, SpeciesRecord | null>();

  await runPool([...new Set(bases.values())], async (dex) => {
    records.set(dex, await speciesRecord(dex));
  });

  await runPool([...bases.entries()], async ([id, dex]) => {
    const rec = records.get(dex) ?? null;
    const wanted = varietyNameFor(id);
    const own = rec?.varieties.find((v) => v.pokemon.name === wanted);
    const def = rec?.varieties.find((v) => v.is_default) ?? rec?.varieties[0];
    let png: Buffer | null = null;
    if (own) {
      png = await render(pokemonIdOf(own.pokemon.url));
    }
    if (!png && def) {
      png = await render(pokemonIdOf(def.pokemon.url));
      if (png && wanted !== def.pokemon.name) {
        report.fellBack.push(id);
      }
    }
    if (!png) {
      png = await render(dex);
    }
    if (!png) {
      report.missing.push(id);
      return;
    }
    const out = await sharp(png)
      .trim({ threshold: 1 })
      .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: false })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();
    fs.writeFileSync(path.join(dir, `${id}.webp`), out);
    report.written += 1;
  });

  report.fellBack.sort();
  report.missing.sort();
  fs.writeFileSync(
    path.join(dir, 'report.json'),
    JSON.stringify({ written: report.written, fellBack: report.fellBack, missing: report.missing }),
  );
  return report;
}
