/**
 * A league whose rankings, meta group, overrides and matrix are another league's, filtered to the
 * species its cup allows. The Play! Championship Series is PvPoke's `all` ranking minus megas and
 * Mimikyu (its own `rankingAlias` says so), and a matchup does not change because a third species
 * was banned, so filtering is exact and a second simulation would only be a slower way to the
 * same numbers.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { League, MatchupMatrix, MetaEntry, RankingEntry, Species } from '@pickthree/engine';
import { MatrixView, allowedInLeague, matrixIndex } from '@pickthree/engine';
import { CATEGORIES } from './build-rankings.js';

/** Every species id the league's cup allows, by the engine's own cup rules. */
export function legalSet(species: readonly Species[], league: League): Set<string> {
  const out = new Set<string>();
  for (const sp of species) {
    if (allowedInLeague(sp, league)) {
      out.add(sp.speciesId);
    }
  }
  return out;
}

/** Banned entries go, and so do banned opponents inside the entries that stay: a counters list
 *  naming a species the cup forbids would send a reader to a matchup they can never have. */
export function filterRankings(
  entries: readonly RankingEntry[],
  legal: ReadonlySet<string>,
): RankingEntry[] {
  return entries
    .filter((e) => legal.has(e.speciesId))
    .map((e) => ({
      ...e,
      moveset: [...e.moveset],
      fastMoves: e.fastMoves.map((m) => ({ ...m })),
      chargedMoves: e.chargedMoves.map((m) => ({ ...m })),
      matchups: e.matchups.filter((m) => legal.has(m.opponent)).map((m) => ({ ...m })),
      counters: e.counters.filter((m) => legal.has(m.opponent)).map((m) => ({ ...m })),
    }));
}

export function filterMeta(entries: readonly MetaEntry[], legal: ReadonlySet<string>): MetaEntry[] {
  return entries
    .filter((m) => legal.has(m.speciesId))
    .map((m) => ({ ...m, chargedMoves: [...m.chargedMoves] }));
}

/** The same matrix with banned rows and columns removed. Modelled on bake.ts's `sliceMatrix`:
 *  a `MatrixView` over the original resolves each surviving cell by its old coordinates. */
export function filterMatrix(
  m: MatchupMatrix,
  legal: ReadonlySet<string>,
  leagueId: string,
): MatchupMatrix {
  const candidates = m.candidates.filter((id) => legal.has(id));
  const opponents = m.opponents.filter((id) => legal.has(id));
  const out: MatchupMatrix = {
    league: leagueId,
    cp: m.cp,
    scenarios: m.scenarios.map((s) => ({ shields: s.shields, energy: s.energy })),
    candidates,
    opponents,
    candidateMovesets: Object.fromEntries(
      candidates.map((id) => [id, [...(m.candidateMovesets[id] ?? [])]]),
    ),
    opponentMovesets: Object.fromEntries(
      opponents.map((id) => [id, [...(m.opponentMovesets[id] ?? [])]]),
    ),
    ratings: [],
  };
  const view = new MatrixView(m);
  const oldColumn = opponents.map((id) => m.opponents.indexOf(id));
  const ratings = new Array<number>(
    candidates.length * opponents.length * m.scenarios.length,
  ).fill(0);
  candidates.forEach((id, ci) => {
    const from = view.rowOf(id) as number;
    oldColumn.forEach((oi, newOi) => {
      m.scenarios.forEach((_, si) => {
        ratings[matrixIndex(out, ci, newOi, si)] = view.rating(from, oi, si);
      });
    });
  });
  out.ratings = ratings;
  return out;
}

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(...parts), 'utf8')) as T;
}

/**
 * Writes `rankings/<id>/`, `meta/<id>.json`, `overrides/<id>.json` and `matrix/<id>.json` for a
 * derived league, reading the already-written files of `from`. The source league must have been
 * built first, which build.ts guarantees by ordering. The matrix is skipped when the source has
 * none, which is what PICKTHREE_SKIP_MATRIX=1 leaves behind.
 */
export function writeDerivedLeague(
  outDir: string,
  league: League,
  from: string,
  legal: ReadonlySet<string>,
): { meta: MetaEntry[] } {
  const rankDir = path.join(outDir, 'rankings', league.id);
  fs.mkdirSync(rankDir, { recursive: true });
  for (const cat of CATEGORIES) {
    const source = readJson<RankingEntry[]>(outDir, 'rankings', from, `${cat}.json`);
    fs.writeFileSync(
      path.join(rankDir, `${cat}.json`),
      JSON.stringify(filterRankings(source, legal)),
    );
  }

  fs.mkdirSync(path.join(outDir, 'meta'), { recursive: true });
  const meta = filterMeta(readJson<MetaEntry[]>(outDir, 'meta', `${from}.json`), legal);
  fs.writeFileSync(path.join(outDir, 'meta', `${league.id}.json`), JSON.stringify(meta));

  fs.mkdirSync(path.join(outDir, 'overrides'), { recursive: true });
  const overrides = readJson<{ speciesId: string }[]>(outDir, 'overrides', `${from}.json`);
  fs.writeFileSync(
    path.join(outDir, 'overrides', `${league.id}.json`),
    JSON.stringify(overrides.filter((o) => legal.has(o.speciesId))),
  );

  const sourceMatrix = path.join(outDir, 'matrix', `${from}.json`);
  if (fs.existsSync(sourceMatrix)) {
    const filtered = filterMatrix(
      JSON.parse(fs.readFileSync(sourceMatrix, 'utf8')) as MatchupMatrix,
      legal,
      league.id,
    );
    fs.writeFileSync(path.join(outDir, 'matrix', `${league.id}.json`), JSON.stringify(filtered));
  }

  return { meta };
}
