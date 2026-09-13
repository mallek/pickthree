import fs from 'node:fs';
import path from 'node:path';
import type {
  League,
  MetaEntry,
  MovesetOverride,
  RankingCategory,
  RankingEntry,
} from '@pickthree/engine';
import { GREAT_LEAGUE_DEF } from '@pickthree/engine';
import { GROUPS_DIR, OVERRIDES_DIR, RANKINGS_DIR } from './paths.js';

export const GREAT_CUP = 'all';
export const GREAT_CP = 1500;
export const CATEGORIES: RankingCategory[] = [
  'overall',
  'leads',
  'switches',
  'closers',
  'chargers',
];

interface RawRanking {
  speciesId: string;
  score: number;
  rating: number;
  moveset: string[];
  moves: {
    fastMoves: { moveId: string; uses: number }[];
    chargedMoves: { moveId: string; uses: number }[];
  };
  matchups: { opponent: string; rating: number }[];
  counters: { opponent: string; rating: number }[];
  stats?: { product: number };
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) as T;
}

export function readRankings(cup: string, cp: number, category: RankingCategory): RankingEntry[] {
  const file = path.join(RANKINGS_DIR, cup, category, `rankings-${cp}.json`);
  if (!fs.existsSync(file)) {
    return [];
  }
  const raw = readJson<RawRanking[]>(file);
  return raw.map((r) => ({
    speciesId: r.speciesId,
    score: r.score,
    rating: r.rating,
    moveset: [...r.moveset],
    fastMoves: r.moves.fastMoves.map((m) => ({ moveId: m.moveId, uses: m.uses })),
    chargedMoves: r.moves.chargedMoves.map((m) => ({ moveId: m.moveId, uses: m.uses })),
    matchups: r.matchups.map((m) => ({ opponent: m.opponent, rating: m.rating })),
    counters: r.counters.map((m) => ({ opponent: m.opponent, rating: m.rating })),
    statProduct: r.stats?.product ?? null,
  }));
}

export function readGreatRankings(category: RankingCategory): RankingEntry[] {
  return readRankings(GREAT_CUP, GREAT_CP, category);
}

export function readMeta(group: string): MetaEntry[] {
  const raw = readJson<{ speciesId: string; fastMove: string; chargedMoves: string[] }[]>(
    path.join(GROUPS_DIR, `${group}.json`),
  );
  return raw.map((m) => ({
    speciesId: m.speciesId,
    fastMove: m.fastMove,
    chargedMoves: [...m.chargedMoves],
  }));
}

export function readGreatMeta(): MetaEntry[] {
  return readMeta('great');
}

export function readOverrides(cup: string, cp: number): MovesetOverride[] {
  const file = path.join(OVERRIDES_DIR, cup, `${cp}.json`);
  if (!fs.existsSync(file)) {
    return [];
  }
  const raw = readJson<MovesetOverride[]>(file);
  return raw.map((o) => {
    const out: MovesetOverride = { speciesId: o.speciesId };
    if (o.fastMove) {
      out.fastMove = o.fastMove;
    }
    if (o.chargedMoves) {
      out.chargedMoves = [...o.chargedMoves];
    }
    if (o.weight !== undefined) {
      out.weight = o.weight;
    }
    return out;
  });
}

/**
 * The moveset PvPoke's ranker used for a species: the top-usage fast move and top two charged
 * moves from the rankings, with any override applied on top (mirrors GameMaster.overrideMoveset).
 * Returns [fast, charged1, charged2?].
 */
export function effectiveMoveset(
  speciesId: string,
  rankings: RankingEntry[],
  overrides: MovesetOverride[],
): string[] {
  const entry = rankings.find((r) => r.speciesId === speciesId);
  if (!entry) {
    throw new Error(`No ranking entry for ${speciesId}`);
  }
  let fast = entry.fastMoves[0]?.moveId ?? entry.moveset[0];
  let charged = entry.chargedMoves.slice(0, 2).map((m) => m.moveId);
  const o = overrides.find((x) => x.speciesId === speciesId);
  if (o?.fastMove) {
    fast = o.fastMove;
  }
  if (o?.chargedMoves) {
    // Cup overrides sometimes list three; a battle uses two.
    charged = o.chargedMoves.slice(0, 2);
  }
  if (!fast) {
    throw new Error(`No fast move for ${speciesId}`);
  }
  // PvPoke pads a one-move species (Unown) with "none".
  return [fast, ...charged.filter((id) => id !== 'none')];
}

export function readGreatOverrides(): MovesetOverride[] {
  return readOverrides(GREAT_CUP, GREAT_CP);
}

/** Rankings, meta group and overrides for one league, written under its id. */
export function writeLeagueRankings(outDir: string, league: League): { meta: MetaEntry[] } {
  const rankDir = path.join(outDir, 'rankings', league.id);
  fs.mkdirSync(rankDir, { recursive: true });
  for (const cat of CATEGORIES) {
    fs.writeFileSync(
      path.join(rankDir, `${cat}.json`),
      JSON.stringify(readRankings(league.cup, league.cp, cat)),
    );
  }
  fs.mkdirSync(path.join(outDir, 'meta'), { recursive: true });
  const meta = readMeta(league.meta);
  fs.writeFileSync(path.join(outDir, 'meta', `${league.id}.json`), JSON.stringify(meta));
  fs.mkdirSync(path.join(outDir, 'overrides'), { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'overrides', `${league.id}.json`),
    JSON.stringify(readOverrides(league.cup, league.cp)),
  );
  return { meta };
}

export function writeRankings(outDir: string): { meta: MetaEntry[] } {
  return writeLeagueRankings(outDir, GREAT_LEAGUE_DEF);
}
