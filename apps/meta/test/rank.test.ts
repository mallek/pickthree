import { describe, expect, it } from 'vitest';
import { facingWeight } from '@pickthree/engine/meta';
import type { MetaSummaryV1, SpeciesStats } from '../src/api.js';
import type { Baseline } from '../src/baseline.js';
import {
  HALF_SAY_BATTLES,
  HALF_SAY_DEVICES,
  HALF_SAY_EVENTS,
  HALF_SAY_TOURNAMENT_BATTLES,
  measuredSay,
  rankSpecies,
  tournamentSay,
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
    source: 'all',
    battles: 0,
    tanked: 0,
    devices: 0,
    bands: {},
    sources: {},
    species: [],
    teams: [],
    previous: null,
    tournament: null,
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
    const r = rankSpecies(summary(), baseline(RANKS), RANKS, { source: 'all', legal: null });
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
      { source: 'all', legal: null },
    );
    const thick = rankSpecies(
      summary({
        battles: 600,
        devices: 12,
        species: [stats({ speciesId: 'lanturn', sightings: 600, wins: 300, losses: 300 })],
      }),
      baseline(RANKS),
      RANKS,
      { source: 'all', legal: null },
    );
    const at = (r: typeof thin, id: string): number => r.rows.findIndex((x) => x.speciesId === id);
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
      { source: 'all', legal: null },
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
      { source: 'all', legal: null },
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
      summary({
        battles: 300,
        devices: 5,
        species: [stats({ speciesId: 'lanturn', sightings: 30 })],
      }),
      baseline(['azumarill', 'medicham', 'registeel']),
      RANKS,
      { source: 'all', legal: null },
    );
    const row = r.rows.find((x) => x.speciesId === 'lanturn');
    expect(row?.pvpokeRank).toBe(4);
    expect(row?.inMetaGroup).toBe(false);
    expect(row?.weight).toBeGreaterThan(0);
  });

  it('keeps the weights summing to one so a screen can print a share', () => {
    const r = rankSpecies(
      summary({
        battles: 480,
        devices: 9,
        species: [stats({ speciesId: 'medicham', sightings: 200 })],
      }),
      baseline(RANKS),
      RANKS,
      { source: 'all', legal: null },
    );
    const total = r.rows.reduce((a, x) => a + x.weight, 0);
    expect(total).toBeCloseTo(1, 8);
  });

  it('reports the say so a header can say how measured the ranking is', () => {
    const r = rankSpecies(summary({ battles: 480, devices: 9 }), baseline(RANKS), RANKS, {
      source: 'all',
      legal: null,
    });
    expect(Math.round(r.say * 100)).toBe(Math.round(measuredSay(480, 9) * 100));
  });

  it('hands back the same weights the team projections reweigh the matrix with', () => {
    const r = rankSpecies(
      summary({
        battles: 480,
        devices: 9,
        species: [stats({ speciesId: 'medicham', sightings: 200 })],
      }),
      baseline(RANKS),
      RANKS,
      { source: 'all', legal: null },
    );
    for (const row of r.rows) {
      expect(r.weights.get(row.speciesId)).toBe(row.weight);
    }
  });

  it('draws every bar against the heaviest row, so the top row is always full', () => {
    const r = rankSpecies(
      summary({
        battles: 480,
        devices: 9,
        species: [stats({ speciesId: 'medicham', sightings: 200 })],
      }),
      baseline(RANKS),
      RANKS,
      { source: 'all', legal: null },
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
      { source: 'all', legal: null },
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
      { source: 'all', legal: null },
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
      { source: 'all', legal: null },
    );
    expect(withPrev.rows.find((x) => x.speciesId === 'azumarill')?.trend).toBeCloseTo(5, 5);
    const noPrev = rankSpecies(
      summary({ battles: 1000, devices: 20, species }),
      baseline(RANKS),
      RANKS,
      { source: 'all', legal: null },
    );
    expect(noPrev.rows.every((x) => x.trend === null)).toBe(true);
  });

  it('stamps the ranking with the PvPoke build the prior came from', () => {
    const r = rankSpecies(summary(), baseline(RANKS), RANKS, { source: 'all', legal: null });
    expect(r.pvpokeCommit).toBe('abc123');
    expect(r.pvpokeDate).toBe('2026-09-10');
  });
});

/** PvPoke's own prior for rank 1 normalised over the two-species fixture list, computed
 *  from `facingWeight` rather than typed as a decimal, so this expectation cannot drift
 *  from the curve the blend actually runs. */
const PRIOR_RANK1 = facingWeight(1) / (facingWeight(1) + facingWeight(2));

function withTournament(over: {
  battles: number;
  events: number;
  species: { speciesId: string; picks: number; wins?: number; losses?: number }[];
  eventsOther?: number;
}): MetaSummaryV1 {
  return summary({
    tournament: {
      events: over.events,
      battles: over.battles,
      eventsOther: over.eventsOther ?? 0,
      species: over.species.map((s) => ({
        speciesId: s.speciesId,
        picks: s.picks,
        game1Picks: s.picks,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        unresolvedForms: 0,
      })),
    },
  });
}

describe('tournamentSay', () => {
  it('is the smaller of the battles curve and the events curve', () => {
    expect(tournamentSay(0, 0)).toBe(0);
    expect(tournamentSay(HALF_SAY_TOURNAMENT_BATTLES, 1000)).toBeCloseTo(0.5, 10);
    expect(tournamentSay(100_000, HALF_SAY_EVENTS)).toBeCloseTo(0.5, 10);
    // One event is a third of the say, whatever it holds: one event is one local meta.
    expect(tournamentSay(100_000, 1)).toBeCloseTo(1 / 3, 10);
  });

  it('is zero with battles but no events, and with events but no battles', () => {
    expect(tournamentSay(105, 0)).toBe(0);
    expect(tournamentSay(0, 3)).toBe(0);
  });
});

describe('the sequential blend', () => {
  const RANKS_4 = RANKS;
  const BASE = baseline(['azumarill', 'medicham']);

  it('is exactly today formula when there are no tournaments at all', () => {
    const meta = summary({
      battles: 300,
      devices: 10,
      species: [stats({ speciesId: 'medicham', sightings: 200 })],
    });
    const withNull = rankSpecies(meta, BASE, RANKS_4, { source: 'all', legal: null });
    const asLadder = rankSpecies(meta, BASE, RANKS_4, { source: 'ladder', legal: null });
    expect([...withNull.weights.entries()]).toEqual([...asLadder.weights.entries()]);
    expect(withNull.tournamentSay).toBe(0);
  });

  it('reproduces the spec worked case: 105 battles at 1 event is a third of the prior', () => {
    const meta = withTournament({
      battles: 105,
      events: 1,
      species: [
        { speciesId: 'medicham', picks: 60 },
        { speciesId: 'azumarill', picks: 40 },
      ],
    });
    const r = rankSpecies(meta, BASE, RANKS_4, { source: 'all', legal: null });
    expect(r.tournamentSay).toBeCloseTo(1 / 3, 6);
    expect(r.say).toBe(0);
    expect(r.tournamentBattles).toBe(105);
    expect(r.events).toBe(1);
    // aL is 0 with no shared battles, so the weights are p1 exactly.
    const medicham = r.rows.find((x) => x.speciesId === 'medicham')!;
    const azumarill = r.rows.find((x) => x.speciesId === 'azumarill')!;
    // Prior: facingWeight(1) and facingWeight(2), normalised. Tournament share: 0.6 and 0.4.
    const aT = 1 / 3;
    const priorA = PRIOR_RANK1;
    const priorM = 1 - priorA;
    expect(azumarill.weight).toBeCloseTo((1 - aT) * priorA + aT * 0.4, 6);
    expect(medicham.weight).toBeCloseTo((1 - aT) * priorM + aT * 0.6, 6);
  });

  it('runs the ladder blend over the top of the tournament blend, not beside it', () => {
    const meta = {
      ...withTournament({
        battles: 105,
        events: 1,
        species: [{ speciesId: 'medicham', picks: 100 }],
      }),
      battles: 300,
      devices: 10,
      species: [stats({ speciesId: 'azumarill', sightings: 100 })],
    };
    const r = rankSpecies(meta, BASE, RANKS_4, { source: 'all', legal: null });
    expect(r.say).toBeCloseTo(0.5, 6);
    expect(r.tournamentSay).toBeCloseTo(1 / 3, 6);
    const azumarill = r.rows.find((x) => x.speciesId === 'azumarill')!;
    // Every ladder sighting is Azumarill, so its ladder share is 1 and it carries half the
    // weight from that term alone.
    expect(azumarill.weight).toBeGreaterThan(0.5);
  });

  it('gives a banned species its plain prior, not a zero tournament share', () => {
    const meta = withTournament({
      battles: 105,
      events: 1,
      species: [{ speciesId: 'medicham', picks: 100 }],
    });
    const legal = { league: 'great', cup: 'championshipseries', banned: new Set(['azumarill']) };
    const r = rankSpecies(meta, baseline(['azumarill', 'medicham']), RANKS_4, {
      source: 'all',
      legal,
    });
    const azumarill = r.rows.find((x) => x.speciesId === 'azumarill')!;
    const priorA = PRIOR_RANK1;
    expect(azumarill.banned).toBe(true);
    expect(azumarill.weight).toBeCloseTo(priorA, 6);
    expect(r.rows.find((x) => x.speciesId === 'medicham')!.banned).toBe(false);
  });

  it('lists a species PvPoke does not rank but tournaments picked', () => {
    const meta = withTournament({
      battles: 105,
      events: 1,
      species: [{ speciesId: 'gligar', picks: 40 }],
    });
    const r = rankSpecies(meta, BASE, RANKS_4, { source: 'all', legal: null });
    const gligar = r.rows.find((x) => x.speciesId === 'gligar')!;
    expect(gligar.pvpokeRank).toBeNull();
    expect(gligar.tournamentPicks).toBe(40);
    expect(gligar.weight).toBeGreaterThan(0);
  });

  it('gives each view its own weights', () => {
    const meta = {
      ...withTournament({
        battles: 105,
        events: 1,
        species: [{ speciesId: 'medicham', picks: 100 }],
      }),
      battles: 300,
      devices: 10,
      species: [stats({ speciesId: 'azumarill', sightings: 100 })],
    };
    const view = (source: 'all' | 'prior' | 'ladder' | 'tournament') =>
      rankSpecies(meta, BASE, RANKS_4, { source, legal: null });
    expect(view('prior').say).toBe(0);
    expect(view('prior').tournamentSay).toBe(0);
    expect(view('ladder').tournamentSay).toBe(0);
    expect(view('ladder').say).toBeCloseTo(0.5, 6);
    expect(view('tournament').say).toBe(0);
    expect(view('tournament').tournamentSay).toBeCloseTo(1 / 3, 6);
    const prior = view('prior');
    const priorA = PRIOR_RANK1;
    expect(prior.rows.find((x) => x.speciesId === 'azumarill')!.weight).toBeCloseTo(priorA, 6);
  });

  it('carries the per-row tournament figures onto every row', () => {
    const meta = withTournament({
      battles: 10,
      events: 1,
      species: [{ speciesId: 'medicham', picks: 6, wins: 4, losses: 2 }],
      eventsOther: 2,
    });
    const r = rankSpecies(meta, BASE, RANKS_4, { source: 'tournament', legal: null });
    const medicham = r.rows.find((x) => x.speciesId === 'medicham')!;
    expect(medicham.tournamentPicks).toBe(6);
    expect(medicham.tournamentGame1Picks).toBe(6);
    expect([medicham.tournamentWins, medicham.tournamentLosses]).toEqual([4, 2]);
    expect(r.eventsOther).toBe(2);
    expect(r.rows.find((x) => x.speciesId === 'azumarill')!.tournamentPicks).toBe(0);
  });
});
