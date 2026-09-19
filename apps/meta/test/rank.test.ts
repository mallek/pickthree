import { describe, expect, it } from 'vitest';
import type { MetaSummaryV1, SpeciesStats } from '../src/api.js';
import type { Baseline, BaselineSpecies } from '../src/baseline.js';
import {
  HALF_SAY_BATTLES,
  HALF_SAY_DEVICES,
  MEASURED_MIN,
  MEASURED_MIN_DEVICES,
  RANKED_SHARE,
  measuredSay,
  rank,
  rankSpecies,
} from '../src/rank.js';

/** PvPoke's overall order for the fixture: azumarill 1, medicham 2, registeel 3, lanturn 4. */
const RANKS = ['azumarill', 'medicham', 'registeel', 'lanturn'];

function baseline(ids: string[]): Baseline {
  const species = ids.map((speciesId, i) => ({
    speciesId,
    score: 100 - i,
    rating: 500,
    fastMove: 'F',
    chargedMoves: ['C'],
    fastUsage: [],
    chargedUsage: [],
  }));
  return {
    league: 'great',
    pvpokeCommit: 'abc123',
    pvpokeDate: '2026-09-10',
    species,
    byId: new Map(species.map((s) => [s.speciesId, s])),
  };
}

function stats(over: Partial<SpeciesStats> & { speciesId: string }): SpeciesStats {
  return { sightings: 0, wins: 0, losses: 0, runs: 0, runWins: 0, runLosses: 0, ...over };
}

function summary(over: Partial<MetaSummaryV1> = {}): MetaSummaryV1 {
  return {
    league: 'great',
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-30T00:00:00.000Z',
    band: 'all',
    battles: 0,
    tanked: 0,
    devices: 0,
    bands: {},
    sources: {},
    species: [],
    teams: [],
    previous: null,
    generatedAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

describe('measuredSay', () => {
  it('gives measured play no say at all with nothing behind it', () => {
    expect(measuredSay(0, 0)).toBe(0);
  });

  it('gives it half the say at the old battle threshold, with devices to match', () => {
    expect(measuredSay(HALF_SAY_BATTLES, 1000)).toBeCloseTo(0.5, 10);
  });

  it('holds one grinder to a sixth, however many battles they log', () => {
    // 900 battles is three quarters on its own; one device caps it at 1 / (1 + 5).
    expect(measuredSay(900, 1)).toBeCloseTo(1 / 6, 10);
    expect(measuredSay(100_000, 1)).toBeCloseTo(1 / 6, 10);
  });

  it('is the smaller of the two curves, whichever that is', () => {
    expect(measuredSay(30, 100)).toBeCloseTo(30 / 330, 10);
    expect(measuredSay(100_000, HALF_SAY_DEVICES)).toBeCloseTo(0.5, 10);
  });

  it('never flips: it moves a little for every battle', () => {
    expect(measuredSay(299, 50)).toBeLessThan(measuredSay(301, 50));
    expect(measuredSay(301, 50) - measuredSay(299, 50)).toBeLessThan(0.01);
  });
});

describe('rankSpecies with no measured play at all', () => {
  it("is PvPoke's list, in PvPoke's order, with nothing fabricated", () => {
    const r = rankSpecies(summary(), baseline(RANKS), RANKS);
    expect(r.say).toBe(0);
    expect(r.rows.map((x) => x.speciesId)).toEqual(RANKS);
    expect(r.rows[0]?.sightings).toBe(0);
    expect(r.rows[0]?.share).toBeNull();
    // 1/sqrt(1) normalised over 1 + 1/sqrt(2) + 1/sqrt(3) + 1/sqrt(4).
    const total = 1 + 1 / Math.SQRT2 + 1 / Math.sqrt(3) + 0.5;
    expect(r.rows[0]?.weight).toBeCloseTo(1 / total, 10);
  });
});

describe('rankSpecies as measured play arrives', () => {
  it('moves the list a little at a time rather than flipping', () => {
    const measured = [stats({ speciesId: 'lanturn', sightings: 60, wins: 30, losses: 30 })];
    const thin = rankSpecies(
      summary({ battles: 60, devices: 3, species: measured }),
      baseline(RANKS),
      RANKS,
    );
    const thick = rankSpecies(
      summary({
        battles: 600,
        devices: 12,
        species: [stats({ speciesId: 'lanturn', sightings: 600, wins: 300, losses: 300 })],
      }),
      baseline(RANKS),
      RANKS,
    );
    const at = (r: typeof thin, id: string): number =>
      r.rows.findIndex((x) => x.speciesId === id);
    const weightOf = (r: typeof thin, id: string): number =>
      r.rows.find((x) => x.speciesId === id)?.weight ?? 0;
    // lanturn is PvPoke's number four and is the only thing anyone actually faced. The
    // property that matters is the movement, not any one position: its weight climbs with the
    // evidence behind it, its place never slips back, and the say itself grows. A four species
    // fixture is far too small to keep a heavily faced species out of first place at any say
    // worth the name, so asserting a position here would be asserting the fixture's size.
    expect(weightOf(thick, 'lanturn')).toBeGreaterThan(weightOf(thin, 'lanturn'));
    expect(at(thick, 'lanturn')).toBeLessThanOrEqual(at(thin, 'lanturn'));
    expect(thin.say).toBeLessThan(thick.say);
    // And the move really is gradual: at a sixth of the say, PvPoke's prior is still most of
    // every weight, so azumarill has not been swept off the list.
    expect(weightOf(thin, 'azumarill')).toBeGreaterThan(weightOf(thin, 'medicham'));
  });

  it('lists a species PvPoke does not rank, on its measured record alone', () => {
    const r = rankSpecies(
      summary({
        battles: 300,
        devices: 5,
        species: [stats({ speciesId: 'surprise', sightings: 150, wins: 60, losses: 90 })],
      }),
      baseline(RANKS),
      RANKS,
    );
    const row = r.rows.find((x) => x.speciesId === 'surprise');
    expect(row).toBeDefined();
    expect(row?.pvpokeRank).toBeNull();
    expect(row?.inMetaGroup).toBe(false);
    expect(row?.decided).toBe(150);
  });

  it('gives an unranked species prior 0, so it never outranks a listed one for free', () => {
    // Faced once in 300 battles, against azumarill's 200. Its measured share is tiny and its
    // prior is nothing at all, so it must sit below PvPoke's number four rather than above it.
    // azumarill is here to hold the rest of the measured share: the observed term is a share of
    // what was sighted, so a lone sighted species would take the whole of it and the prior
    // would never get a word in.
    const r = rankSpecies(
      summary({
        battles: 300,
        devices: 5,
        species: [
          stats({ speciesId: 'surprise', sightings: 1 }),
          stats({ speciesId: 'azumarill', sightings: 200 }),
        ],
      }),
      baseline(RANKS),
      RANKS,
    );
    const surprise = r.rows.find((x) => x.speciesId === 'surprise');
    const lanturn = r.rows.find((x) => x.speciesId === 'lanturn');
    expect(surprise?.pvpokeRank).toBeNull();
    expect(surprise?.weight).toBeLessThan(lanturn?.weight ?? 0);
    // lanturn was never faced, so the whole of its weight is the prior surprise does not get.
    expect(lanturn?.sightings).toBe(0);
  });

  it('ranks a measured species PvPoke ranks but does not curate, on its real rank', () => {
    // 'lanturn' is in RANKS at position 4 but not in this baseline's curated group.
    const r = rankSpecies(
      summary({ battles: 300, devices: 5, species: [stats({ speciesId: 'lanturn', sightings: 30 })] }),
      baseline(['azumarill', 'medicham', 'registeel']),
      RANKS,
    );
    const row = r.rows.find((x) => x.speciesId === 'lanturn');
    expect(row?.pvpokeRank).toBe(4);
    expect(row?.inMetaGroup).toBe(false);
    expect(row?.weight).toBeGreaterThan(0);
  });

  it('keeps the weights summing to one so a screen can print a share', () => {
    const r = rankSpecies(
      summary({ battles: 480, devices: 9, species: [stats({ speciesId: 'medicham', sightings: 200 })] }),
      baseline(RANKS),
      RANKS,
    );
    const total = r.rows.reduce((a, x) => a + x.weight, 0);
    expect(total).toBeCloseTo(1, 8);
  });

  it('reports the say so a header can say how measured the ranking is', () => {
    const r = rankSpecies(summary({ battles: 480, devices: 9 }), baseline(RANKS), RANKS);
    expect(Math.round(r.say * 100)).toBe(Math.round(measuredSay(480, 9) * 100));
  });

  it('hands back the same weights the team projections reweigh the matrix with', () => {
    const r = rankSpecies(
      summary({ battles: 480, devices: 9, species: [stats({ speciesId: 'medicham', sightings: 200 })] }),
      baseline(RANKS),
      RANKS,
    );
    for (const row of r.rows) {
      expect(r.weights.get(row.speciesId)).toBe(row.weight);
    }
  });

  it('draws every bar against the heaviest row, so the top row is always full', () => {
    const r = rankSpecies(
      summary({ battles: 480, devices: 9, species: [stats({ speciesId: 'medicham', sightings: 200 })] }),
      baseline(RANKS),
      RANKS,
    );
    expect(r.rows[0]?.barPct).toBe(100);
    expect(r.rows.every((x) => x.barPct >= 0 && x.barPct <= 100)).toBe(true);
  });

  it('never lists a species a reporter ran but never faced', () => {
    // The worker emits a sightings-0 row for every species on a reported team. One of those is
    // not something this league faces, so it is not a row; PvPoke's curated group still is.
    const r = rankSpecies(
      summary({
        battles: 300,
        devices: 5,
        species: [stats({ speciesId: 'golbat', sightings: 0, runs: 5 })],
      }),
      baseline(RANKS),
      RANKS,
    );
    expect(r.rows.map((x) => x.speciesId)).toEqual(RANKS);
  });

  it('reads each row its own confidence, from its own decided battles', () => {
    const r = rankSpecies(
      summary({
        battles: 1000,
        devices: 20,
        species: [
          stats({ speciesId: 'azumarill', sightings: 400, wins: 200, losses: 200 }),
          stats({ speciesId: 'medicham', sightings: 40, wins: 20, losses: 20 }),
          stats({ speciesId: 'registeel', sightings: 2, wins: 1, losses: 1 }),
        ],
      }),
      baseline(RANKS),
      RANKS,
    );
    const of = (id: string): string | undefined =>
      r.rows.find((x) => x.speciesId === id)?.confidence;
    expect(of('azumarill')).toBe('many');
    expect(of('medicham')).toBe('some');
    expect(of('registeel')).toBe('few');
  });

  it('shows a trend only once both windows carry enough battles', () => {
    const species = [stats({ speciesId: 'azumarill', sightings: 200, wins: 90, losses: 110 })];
    const withPrev = rankSpecies(
      summary({
        battles: 1000,
        devices: 20,
        species,
        previous: { battles: 1000, species: [{ speciesId: 'azumarill', sightings: 150 }] },
      }),
      baseline(RANKS),
      RANKS,
    );
    expect(withPrev.rows.find((x) => x.speciesId === 'azumarill')?.trend).toBeCloseTo(5, 5);
    const noPrev = rankSpecies(
      summary({ battles: 1000, devices: 20, species }),
      baseline(RANKS),
      RANKS,
    );
    expect(noPrev.rows.every((x) => x.trend === null)).toBe(true);
  });

  it('stamps the ranking with the PvPoke build the prior came from', () => {
    const r = rankSpecies(summary(), baseline(RANKS), RANKS);
    expect(r.pvpokeCommit).toBe('abc123');
    expect(r.pvpokeDate).toBe('2026-09-10');
  });
});

// ---------------------------------------------------------------------------------------------
// The superseded flip. `rank()` and its thresholds still drive Overview.tsx, About.tsx and
// Species.tsx until Tasks 12 and 13 rewrite those screens onto `rankSpecies` above. Its tests
// stay until it does, so the shipping path is not left uncovered while it is still shipping.
// ---------------------------------------------------------------------------------------------

function sp(speciesId: string, sightings: number, wins = 0, losses = 0, runs = 0): SpeciesStats {
  return { speciesId, sightings, wins, losses, runs, runWins: 0, runLosses: 0 };
}

function meta(over: Partial<MetaSummaryV1> = {}): MetaSummaryV1 {
  return summary({ devices: 1, ...over });
}

function bs(speciesId: string, score: number | null): BaselineSpecies {
  return {
    speciesId,
    score,
    rating: score === null ? null : 600 + score,
    fastMove: 'BUBBLE',
    chargedMoves: ['ICE_BEAM'],
    fastUsage: [],
    chargedUsage: [],
  };
}

const legacyBaseline: Baseline = {
  league: 'great',
  pvpokeCommit: 'abc1234',
  pvpokeDate: '2026-09-10',
  species: [bs('azumarill', 93), bs('tinkaton', 90), bs('clodsire', 80)],
  byId: new Map(),
};
legacyBaseline.byId = new Map(legacyBaseline.species.map((s) => [s.speciesId, s]));

describe('rank, below the measured threshold', () => {
  const small = meta({
    battles: 40,
    devices: 6,
    species: [sp('medicham', 9, 4, 5), sp('lanturn', 2, 1, 1), sp('umbreon', 1, 1, 0)],
  });

  it('leads with PvPoke and says so through the source', () => {
    const r = rank(small, legacyBaseline);
    expect(r.source).toBe('baseline');
    expect(r.holdback).toBe('battles');
    expect(r.baseline.map((b) => b.speciesId)).toEqual(['azumarill', 'tinkaton', 'clodsire']);
    expect(r.pvpokeCommit).toBe('abc1234');
    expect(r.pvpokeDate).toBe('2026-09-10');
  });

  it('still shows every species faced twice or more, with its counts', () => {
    const r = rank(small, legacyBaseline);
    expect(r.measured.map((m) => m.speciesId)).toEqual(['medicham', 'lanturn']);
    expect(r.measured[0]).toMatchObject({ rank: 1, sightings: 9, wins: 4, losses: 5, decided: 9 });
    expect(r.tail).toBe(1);
  });

  it('never shows a share below the measured threshold, a count instead', () => {
    const r = rank(small, legacyBaseline);
    expect(r.measured.every((m) => m.share === null)).toBe(true);
  });

  it('never counts a species a reporter ran but never faced (sightings 0) in measured or tail', () => {
    // The worker emits a sightings-0 row for every species on a reported team, whether or not it
    // was ever seen across the table (it calls take() for each of the three team slots). Those
    // rows must not inflate the "faced once each" tail or slip onto the measured list.
    const withRunOnly = meta({
      battles: 40,
      devices: 6,
      species: [
        sp('medicham', 9, 4, 5),
        sp('lanturn', 2, 1, 1),
        sp('umbreon', 1, 1, 0),
        sp('golbat', 0, 0, 0, 5),
      ],
    });
    const r = rank(withRunOnly, legacyBaseline);
    expect(r.measured.map((m) => m.speciesId)).not.toContain('golbat');
    expect(r.tail).toBe(1);
  });

  it('shows no trend when there is no previous window to compare, rather than inventing one', () => {
    expect(rank(small, legacyBaseline).measured.every((m) => m.trend === null)).toBe(true);
  });
});

describe('rank, at and above the measured threshold', () => {
  const species = [sp('azumarill', 200, 90, 110), sp('tinkaton', 3, 1, 2)];
  const big = meta({ battles: MEASURED_MIN, devices: 40, species });

  it('leads with the measured list', () => {
    const r = rank(big, legacyBaseline);
    expect(r.source).toBe('measured');
    expect(r.battles).toBe(MEASURED_MIN);
  });

  it('drops species below the half percent cut', () => {
    // 3 of 300 is 1%, so raise the battle count until tinkaton falls under 0.5%.
    const r = rank(meta({ battles: 1000, devices: 40, species }), legacyBaseline);
    expect(r.measured.map((m) => m.speciesId)).toEqual(['azumarill']);
  });

  it('carries share and a bar relative to the most faced', () => {
    const r = rank(big, legacyBaseline);
    const top = r.measured[0]!;
    expect(top.share).toBeCloseTo(200 / MEASURED_MIN, 5);
    expect(top.barPct).toBe(100);
  });

  it('keeps a species at exactly the 0.5% share cut', () => {
    const atCut = meta({
      battles: 1000,
      devices: 40,
      species: [sp('azumarill', 5, 3, 2)],
    });
    expect(rank(atCut, legacyBaseline).measured.map((m) => m.speciesId)).toEqual(['azumarill']);
    expect(5 / 1000).toBe(RANKED_SHARE);
  });

  it('shows a trend once both windows are big enough', () => {
    const withPrev = meta({
      battles: 1000,
      devices: 40,
      species: [sp('azumarill', 200, 90, 110)],
      previous: { battles: 1000, species: [{ speciesId: 'azumarill', sightings: 150 }] },
    });
    expect(rank(withPrev, legacyBaseline).measured[0]!.trend).toBeCloseTo(5, 5);
  });

  it("still hands back PvPoke's list so the page can show it as a labelled section", () => {
    expect(rank(big, legacyBaseline).baseline).toHaveLength(3);
  });

  it('ranks a species that clears the share cut on too few battles for real confidence', () => {
    // The regression that matters most in this file: 2 of 300 battles clears the 0.5% share
    // cut and lands on the measured list, but the row must still carry 'few' confidence: the
    // overview no longer prints a rate at all (FIX 3), but a screen that reads confidence off
    // this row must never mistake "listed" for "trusted".
    const r = rank(
      meta({ battles: MEASURED_MIN, devices: 40, species: [sp('shuckle', 2, 1, 1)] }),
      legacyBaseline,
    );
    const row = r.measured[0]!;
    expect(row.sightings).toBe(2);
    expect(row.wins).toBe(1);
    expect(row.losses).toBe(1);
    expect(row.confidence).toBe('few');
  });

  it('reaches "some" confidence once a row clears 30 decided battles of its own', () => {
    const r = rank(
      meta({ battles: 1000, devices: 40, species: [sp('shuckle', 40, 20, 20)] }),
      legacyBaseline,
    );
    expect(r.measured[0]!.confidence).toBe('some');
  });

  it('reaches "many" confidence once a row clears 300 decided battles of its own', () => {
    const r = rank(
      meta({ battles: 1000, devices: 40, species: [sp('shuckle', 300, 150, 150)] }),
      legacyBaseline,
    );
    expect(r.measured[0]!.confidence).toBe('many');
  });
});

describe('rank, the devices floor', () => {
  it('holds back on battles when the battle count itself is short, however many devices', () => {
    const r = rank(meta({ battles: MEASURED_MIN - 1, devices: 100, species: [] }), legacyBaseline);
    expect(r.source).toBe('baseline');
    expect(r.holdback).toBe('battles');
  });

  it('holds back on devices when battles clear the floor but contributors do not', () => {
    // 300 battles from one device is one person's matchmaking queue, not what players face.
    const r = rank(
      meta({ battles: MEASURED_MIN, devices: MEASURED_MIN_DEVICES - 1, species: [] }),
      legacyBaseline,
    );
    expect(r.source).toBe('baseline');
    expect(r.holdback).toBe('devices');
  });

  it('has no holdback once both battles and devices clear their floors', () => {
    const r = rank(
      meta({ battles: MEASURED_MIN, devices: MEASURED_MIN_DEVICES, species: [] }),
      legacyBaseline,
    );
    expect(r.source).toBe('measured');
    expect(r.holdback).toBeNull();
  });

  it('still reads as baseline one battle short of the measured floor', () => {
    const r = rank(meta({ battles: MEASURED_MIN - 1, devices: 40, species: [] }), legacyBaseline);
    expect(r.source).toBe('baseline');
  });
});

describe('rank, sorting defensively', () => {
  it('sorts a shuffled species list by sightings before ranking, so a bad input cannot corrupt rank order', () => {
    const shuffled = [sp('lanturn', 2, 1, 1), sp('umbreon', 1, 1, 0), sp('medicham', 9, 4, 5)];
    const r = rank(meta({ battles: 40, devices: 6, species: shuffled }), legacyBaseline);
    expect(r.measured.map((m) => m.speciesId)).toEqual(['medicham', 'lanturn']);
    expect(r.measured.map((m) => m.rank)).toEqual([1, 2]);
  });

  it('sorts a shuffled baseline list by score before ranking', () => {
    const shuffledBaseline: Baseline = {
      ...legacyBaseline,
      species: [bs('clodsire', 80), bs('azumarill', 93), bs('tinkaton', 90)],
    };
    const r = rank(meta(), shuffledBaseline);
    expect(r.baseline.map((b) => b.speciesId)).toEqual(['azumarill', 'tinkaton', 'clodsire']);
    expect(r.baseline.map((b) => b.rank)).toEqual([1, 2, 3]);
  });
});

describe('rank, with nothing at all', () => {
  it('answers with an empty measured list rather than throwing', () => {
    const r = rank(meta(), legacyBaseline);
    expect(r.source).toBe('baseline');
    expect(r.measured).toEqual([]);
    expect(r.tail).toBe(0);
  });
});
