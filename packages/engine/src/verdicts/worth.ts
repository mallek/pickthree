import { buildCost, type Cost } from '../builds/cost.js';
import { buildsFor, type Build, type BuildOptions } from '../builds/eligibility.js';
import { recommendMoveset, type Moveset } from '../builds/moves.js';
import type { Specimen } from '../collection/specimen.js';
import { fullName } from '../explain/explain.js';
import type { GameDataIndex } from '../gamedata/index.js';
import type { MetaEntry, RankingEntry } from '../gamedata/types.js';
import { statProduct } from '../math/cp.js';
import type { MatrixView } from '../search/matrixView.js';
import type { BattleSimulator, SimOptions } from '../sim/BattleSimulator.js';

export type VerdictLabel =
  'Great League ready' | 'Worth building' | 'Wait for better IVs' | 'Not eligible' | 'Needs rescan';

export interface Verdict {
  specimenId: string;
  label: VerdictLabel;
  line: string;
  /** The stage the verdict is about (may be a later evolution). */
  build: Build | null;
  moveset: Moveset | null;
  cost: Cost | null;
  /** Wins the rank-1 twin gets minus this specimen's wins across the meta, 1-1 shields. */
  perfectDelta: number | null;
  perfectLine: string | null;
  metaWins: number | null;
  metaSize: number;
}

export interface VerdictDeps {
  index: GameDataIndex;
  overall: Map<string, RankingEntry>;
  view: MatrixView;
  meta: MetaEntry[];
  sim: BattleSimulator | null;
  simOptions: SimOptions;
  buildOptions: BuildOptions;
}

/** Pick the stage with the best PvPoke overall score, ties to the cheaper build. */
export function bestBuild(builds: Build[], overall: Map<string, RankingEntry>): Build | null {
  let best: Build | null = null;
  let bestScore = -1;
  for (const b of builds) {
    const score = overall.get(b.speciesId)?.score ?? 0;
    if (score > bestScore || (score === bestScore && best && b.level < best.level)) {
      best = b;
      bestScore = score;
    }
  }
  return best;
}

function simWins(
  spec: { speciesId: string; ivs: Build['ivs']; level: number; moveset: Moveset },
  deps: VerdictDeps,
): number {
  if (!deps.sim) {
    return 0;
  }
  let wins = 0;
  for (const m of deps.meta) {
    const r = deps.sim.simulate(
      {
        speciesId: spec.speciesId,
        fastMove: spec.moveset.fast.moveId,
        chargedMoves: spec.moveset.charged.map((c) => c.moveId),
        ivs: spec.ivs,
        level: spec.level,
        shields: 1,
      },
      {
        speciesId: m.speciesId,
        fastMove: m.fastMove,
        chargedMoves: m.chargedMoves.slice(0, 2),
        shields: 1,
      },
      deps.simOptions,
    );
    if (r.rating > 500) {
      wins += 1;
    }
  }
  return wins;
}

export function specimenVerdict(s: Specimen, deps: VerdictDeps): Verdict {
  const metaSize = deps.meta.length;
  const base = {
    specimenId: s.id,
    build: null,
    moveset: null,
    cost: null,
    perfectDelta: null,
    perfectLine: null,
    metaWins: null,
    metaSize,
  };
  const name = fullName(s.speciesId, deps.index);
  if (!s.ivs) {
    return {
      ...base,
      label: 'Needs rescan',
      line: `Poke Genie did not read the IVs for this ${name}. Rescan it with the appraisal screen open.`,
    };
  }
  const builds = buildsFor(s, deps.index, { ...deps.buildOptions, minCp: 0 });
  const build = bestBuild(builds, deps.overall);
  if (!build) {
    const over = deps.index.species(s.speciesId)?.greatLeagueIneligible
      ? 'is not allowed in Great League'
      : 'is over 1500 CP and cannot be powered down';
    return { ...base, label: 'Not eligible', line: `This ${name} ${over}.` };
  }
  const moveset = recommendMoveset(
    build.speciesId,
    deps.overall,
    s.currentMoves,
    { allowEliteTm: deps.buildOptions.allowEliteTm },
    deps.index,
  );
  const cost = buildCost(build, moveset, deps.index);
  const stageName = fullName(build.speciesId, deps.index);
  const rank = build.ivRank;
  const topPct = Math.max(1, Math.round((rank.rank / rank.total) * 100));
  const ranked = deps.overall.get(build.speciesId);
  const competitive = (ranked?.score ?? 0) >= 70 && build.cp >= deps.buildOptions.minCp;

  let metaWins: number | null = null;
  let perfectDelta: number | null = null;
  let perfectLine: string | null = null;
  if (deps.sim && competitive) {
    metaWins = simWins(
      { speciesId: build.speciesId, ivs: build.ivs, level: build.level, moveset },
      deps,
    );
    const species = deps.index.mustSpecies(build.speciesId);
    const bestIvs = { atk: rank.best.ivs.atk, def: rank.best.ivs.def, sta: rank.best.ivs.sta };
    const bestWins = simWins(
      { speciesId: build.speciesId, ivs: bestIvs, level: rank.best.level, moveset },
      deps,
    );
    perfectDelta = bestWins - metaWins;
    const productGap =
      Math.round(
        ((statProduct(species.baseStats, bestIvs, rank.best.level) - rank.product) / rank.product) *
          1000,
      ) / 10;
    perfectLine =
      perfectDelta <= 0
        ? `A perfect one would not win any more of the ${metaSize} meta matchups.`
        : `A perfect one would win ${perfectDelta} more of ${metaSize} meta matchups (${productGap}% more stat product).`;
  }

  const alreadyBuilt = build.level <= s.level.max + 0.5 && build.stageOffset === 0;
  const evoNote = build.stageOffset > 0 ? ` as ${stageName}` : '';
  if (!competitive) {
    return {
      ...base,
      build,
      moveset,
      cost,
      metaWins,
      perfectDelta,
      perfectLine,
      label: 'Wait for better IVs',
      line: `${stageName} is not a strong Great League pick right now (PvPoke score ${ranked?.score ?? 0}). Keep it for fun, not for ranked play.`,
    };
  }
  if (alreadyBuilt && topPct <= 25) {
    return {
      ...base,
      build,
      moveset,
      cost,
      metaWins,
      perfectDelta,
      perfectLine,
      label: 'Great League ready',
      line: `Top ${topPct}% for Great League and already at level ${s.level.max}. Use it.`,
    };
  }
  if (topPct <= 25 || (s.shadow && topPct <= 40) || (perfectDelta !== null && perfectDelta <= 1)) {
    return {
      ...base,
      build,
      moveset,
      cost,
      metaWins,
      perfectDelta,
      perfectLine,
      label: 'Worth building',
      line: `Top ${topPct}% for Great League${evoNote}. ${perfectDelta !== null && perfectDelta <= 1 ? 'A better one would barely change results.' : 'Worth the Stardust.'}`,
    };
  }
  return {
    ...base,
    build,
    moveset,
    cost,
    metaWins,
    perfectDelta,
    perfectLine,
    label: 'Wait for better IVs',
    line: `Top ${topPct}% for Great League${evoNote}. Usable, but a better one is likely to show up before you finish the build.`,
  };
}
