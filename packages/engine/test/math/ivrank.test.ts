import { describe, expect, it } from 'vitest';
import { toSpecimens } from '../../src/collection/specimen.js';
import { parsePokeGenieCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { ivRank } from '../../src/math/ivrank.js';
import { haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

describe.skipIf(!haveStaticData())('ivRank', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);

  it('ranks the PvPoke default azumarill spread near the top', () => {
    const r = ivRank(
      index.mustSpecies('azumarill').baseStats,
      { atk: 4, def: 15, sta: 13 },
      1500,
      50,
    );
    // PvPoke's default spread is a representative one, not the rank-1 spread.
    expect(r.total).toBe(4096);
    expect(r.rank).toBeLessThan(400);
    expect(r.level).toBe(43);
    expect(r.rankPct).toBeGreaterThan(97);
    expect(r.best.ivs.atk).toBeLessThanOrEqual(8);
    expect(r.best.level).toBeLessThanOrEqual(50);
  });

  it('gives rank 1 a zero gap and 100 percentile', () => {
    const base = index.mustSpecies('medicham').baseStats;
    const r0 = ivRank(base, { atk: 0, def: 0, sta: 0 }, 1500, 50);
    const best = ivRank(base, r0.best.ivs, 1500, 50);
    expect(best.rank).toBe(1);
    expect(best.gapPct).toBe(0);
    expect(best.percentile).toBe(100);
  });

  it('agrees with Poke Genie Rank # and Rank % for the fixture rows at level cap 51', () => {
    // Poke Genie ranks with a level-51 (best buddy) ceiling. Our product-only rank at cap 51 should
    // match its Rank # closely; small differences come from its rounding of stat product.
    const parsed = parsePokeGenieCsv(loadFixtureCsv());
    const { specimens } = toSpecimens(parsed, index);
    let compared = 0;
    let within5 = 0;
    let pctWithin1 = 0;
    const misses: string[] = [];
    for (const s of specimens) {
      const pg = s.raw.pokeGenie;
      if (!s.ivs || pg.rankNumG === null || pg.rankPctG === null || pg.nameG === null) {
        continue;
      }
      // Poke Genie ranks shadow Pokemon by a method of its own (its ranks come out lower than a
      // plain stat-product rank for the same IVs). PickThree follows PvPoke's method for both, so
      // the oracle comparison is limited to non-shadows.
      if (s.shadow) {
        continue;
      }
      // Poke Genie ranks the evolution it recommends (Name (G)), not necessarily the scanned stage.
      const target = data.species.find(
        (sp) => sp.speciesName === pg.nameG && !sp.speciesId.endsWith('_shadow'),
      );
      if (!target || pg.formG) {
        continue;
      }
      const r = ivRank(target.baseStats, s.ivs, 1500, 51);
      // Species that cannot reach the cap even at level 51 rank purely on raw stats with many
      // ties; Poke Genie breaks those ties differently and they are not competitive anyway.
      if (r.best.level >= 51) {
        continue;
      }
      compared += 1;
      if (Math.abs(r.rank - pg.rankNumG) <= 5) {
        within5 += 1;
      } else {
        misses.push(
          `${target.speciesId} ${s.ivs.atk}/${s.ivs.def}/${s.ivs.sta}: ours ${r.rank}, pg ${pg.rankNumG}`,
        );
      }
      // Poke Genie's "Rank %" is the percentile: (4097 - rank) / 4096.
      if (Math.abs(r.percentile - pg.rankPctG) <= 0.5) {
        pctWithin1 += 1;
      }
    }
    if (misses.length > 0) {
      console.log(`ivRank misses ${misses.length}/${compared}:\n${misses.slice(0, 15).join('\n')}`);
    }
    expect(compared).toBeGreaterThan(15);
    expect(within5 / compared).toBeGreaterThanOrEqual(0.85);
    expect(pctWithin1 / compared).toBeGreaterThanOrEqual(0.85);
  });
});
