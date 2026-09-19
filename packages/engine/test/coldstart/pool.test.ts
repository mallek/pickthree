import { describe, expect, it } from 'vitest';
import {
  coldStartBuilds,
  coldStartSpecimens,
  spreadsFromGameMaster,
} from '../../src/coldstart/pool.js';
import { buildOptionsFor } from '../../src/builds/eligibility.js';
import { haveStaticData, loadIndex, loadStaticData, readGameMaster } from '../fixtures.js';

describe('spreadsFromGameMaster', () => {
  it('reads PvPoke defaultIVs for the cap it was asked for', () => {
    const gm = {
      pokemon: [
        { speciesId: 'azumarill', defaultIVs: { cp1500: [43, 4, 15, 13], cp2500: [50, 15, 15, 15] } },
      ],
    };
    expect(spreadsFromGameMaster(gm, 1500)('azumarill')).toEqual({
      level: 43,
      ivs: { atk: 4, def: 15, sta: 13 },
    });
    expect(spreadsFromGameMaster(gm, 2500)('azumarill')).toEqual({
      level: 50,
      ivs: { atk: 15, def: 15, sta: 15 },
    });
    expect(spreadsFromGameMaster(gm, 1500)('nobody')).toBeNull();
  });

  it('falls back to 15/15/15 at the level cap when the battle is uncapped', () => {
    // PvPoke's Pokemon.initialize does exactly this for maxCP 10000; there is no cp10000 table.
    const gm = { pokemon: [{ speciesId: 'dialga', defaultIVs: { cp1500: [20, 0, 1, 2] } }] };
    expect(spreadsFromGameMaster(gm, 10_000)('dialga')).toEqual({
      level: 50,
      ivs: { atk: 15, def: 15, sta: 15 },
    });
  });

  it('survives a game master that is not the shape we expect', () => {
    expect(spreadsFromGameMaster({}, 1500)('azumarill')).toBeNull();
    expect(spreadsFromGameMaster(null, 1500)('azumarill')).toBeNull();
    expect(spreadsFromGameMaster({ pokemon: [{}] }, 1500)('azumarill')).toBeNull();
  });
});

const run = haveStaticData() ? describe : describe.skip;

run('the cold start pool over the real data', () => {
  function build() {
    const data = loadStaticData();
    const index = loadIndex();
    const spreads = spreadsFromGameMaster(readGameMaster(), data.league.cp);
    const specimens = coldStartSpecimens(data.matrix.candidates, spreads, index);
    const builds = coldStartBuilds(specimens, index, buildOptionsFor(data.league));
    return { data, index, spreads, specimens, builds };
  }

  it('produces one build per legal species, at PvPoke default IVs', () => {
    const { specimens, builds, spreads } = build();
    expect(specimens.length).toBeGreaterThan(900);
    expect(builds.length).toBeGreaterThan(800);

    // One build per species: never a pre-evolution standing in for its evolution.
    const ids = builds.map((b) => b.speciesId);
    expect(new Set(ids).size).toBe(ids.length);

    // Every build carries its own species' spread, not an ancestor's.
    for (const b of builds) {
      expect(b.ivs).toEqual(spreads(b.speciesId)?.ivs);
    }
  });

  it('puts every member of the meta group in the pool', () => {
    const { data, builds } = build();
    const have = new Set(builds.map((b) => b.speciesId));
    expect(data.meta.map((m) => m.speciesId).filter((id) => !have.has(id))).toEqual([]);
  });

  it('builds the meta group at exactly the level PvPoke would', () => {
    const { data, builds, spreads } = build();
    const byId = new Map(builds.map((b) => [b.speciesId, b]));
    for (const m of data.meta) {
      const b = byId.get(m.speciesId);
      expect(b?.level).toBe(spreads(m.speciesId)?.level);
    }
  });
});
