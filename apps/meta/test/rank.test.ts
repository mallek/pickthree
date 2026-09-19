import { describe, expect, it } from 'vitest';
import type { MetaSummaryV1, SpeciesStats } from '../src/api.js';
import type { Baseline, BaselineSpecies } from '../src/baseline.js';
import { MEASURED_MIN, MEASURED_MIN_DEVICES, RANKED_SHARE, rank } from '../src/rank.js';

function sp(speciesId: string, sightings: number, wins = 0, losses = 0, runs = 0): SpeciesStats {
  return { speciesId, sightings, wins, losses, runs, runWins: 0, runLosses: 0 };
}

function meta(over: Partial<MetaSummaryV1> = {}): MetaSummaryV1 {
  return {
    league: 'great',
    since: '2026-09-11T00:00:00.000Z',
    until: '2026-09-18T00:00:00.000Z',
    band: 'all',
    battles: 0,
    tanked: 0,
    devices: 1,
    bands: {},
    sources: {},
    species: [],
    teams: [],
    previous: null,
    generatedAt: '2026-09-18T12:00:00.000Z',
    ...over,
  };
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

const baseline: Baseline = {
  league: 'great',
  pvpokeCommit: 'abc1234',
  pvpokeDate: '2026-09-10',
  species: [bs('azumarill', 93), bs('tinkaton', 90), bs('clodsire', 80)],
  byId: new Map(),
};
baseline.byId = new Map(baseline.species.map((s) => [s.speciesId, s]));

describe('rank, below the measured threshold', () => {
  const small = meta({
    battles: 40,
    devices: 6,
    species: [sp('medicham', 9, 4, 5), sp('lanturn', 2, 1, 1), sp('umbreon', 1, 1, 0)],
  });

  it('leads with PvPoke and says so through the source', () => {
    const r = rank(small, baseline);
    expect(r.source).toBe('baseline');
    expect(r.holdback).toBe('battles');
    expect(r.baseline.map((b) => b.speciesId)).toEqual(['azumarill', 'tinkaton', 'clodsire']);
    expect(r.pvpokeCommit).toBe('abc1234');
    expect(r.pvpokeDate).toBe('2026-09-10');
  });

  it('still shows every species faced twice or more, with its counts', () => {
    const r = rank(small, baseline);
    expect(r.measured.map((m) => m.speciesId)).toEqual(['medicham', 'lanturn']);
    expect(r.measured[0]).toMatchObject({ rank: 1, sightings: 9, wins: 4, losses: 5, decided: 9 });
    expect(r.tail).toBe(1);
  });

  it('never shows a share below the measured threshold, a count instead', () => {
    const r = rank(small, baseline);
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
    const r = rank(withRunOnly, baseline);
    expect(r.measured.map((m) => m.speciesId)).not.toContain('golbat');
    expect(r.tail).toBe(1);
  });

  it('shows no trend when there is no previous window to compare, rather than inventing one', () => {
    expect(rank(small, baseline).measured.every((m) => m.trend === null)).toBe(true);
  });
});

describe('rank, at and above the measured threshold', () => {
  const species = [sp('azumarill', 200, 90, 110), sp('tinkaton', 3, 1, 2)];
  const big = meta({ battles: MEASURED_MIN, devices: 40, species });

  it('leads with the measured list', () => {
    const r = rank(big, baseline);
    expect(r.source).toBe('measured');
    expect(r.battles).toBe(MEASURED_MIN);
  });

  it('drops species below the half percent cut', () => {
    // 3 of 300 is 1%, so raise the battle count until tinkaton falls under 0.5%.
    const r = rank(meta({ battles: 1000, devices: 40, species }), baseline);
    expect(r.measured.map((m) => m.speciesId)).toEqual(['azumarill']);
  });

  it('carries share and a bar relative to the most faced', () => {
    const r = rank(big, baseline);
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
    expect(rank(atCut, baseline).measured.map((m) => m.speciesId)).toEqual(['azumarill']);
    expect(5 / 1000).toBe(RANKED_SHARE);
  });

  it('shows a trend once both windows are big enough', () => {
    const withPrev = meta({
      battles: 1000,
      devices: 40,
      species: [sp('azumarill', 200, 90, 110)],
      previous: { battles: 1000, species: [{ speciesId: 'azumarill', sightings: 150 }] },
    });
    expect(rank(withPrev, baseline).measured[0]!.trend).toBeCloseTo(5, 5);
  });

  it("still hands back PvPoke's list so the page can show it as a labelled section", () => {
    expect(rank(big, baseline).baseline).toHaveLength(3);
  });

  it('ranks a species that clears the share cut on too few battles for real confidence', () => {
    // The regression that matters most in this file: 2 of 300 battles clears the 0.5% share
    // cut and lands on the measured list, but the row must still carry 'few' confidence: the
    // overview no longer prints a rate at all (FIX 3), but a screen that reads confidence off
    // this row must never mistake "listed" for "trusted".
    const r = rank(
      meta({ battles: MEASURED_MIN, devices: 40, species: [sp('shuckle', 2, 1, 1)] }),
      baseline,
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
      baseline,
    );
    expect(r.measured[0]!.confidence).toBe('some');
  });

  it('reaches "many" confidence once a row clears 300 decided battles of its own', () => {
    const r = rank(
      meta({ battles: 1000, devices: 40, species: [sp('shuckle', 300, 150, 150)] }),
      baseline,
    );
    expect(r.measured[0]!.confidence).toBe('many');
  });
});

describe('rank, the devices floor', () => {
  it('holds back on battles when the battle count itself is short, however many devices', () => {
    const r = rank(
      meta({ battles: MEASURED_MIN - 1, devices: 100, species: [] }),
      baseline,
    );
    expect(r.source).toBe('baseline');
    expect(r.holdback).toBe('battles');
  });

  it('holds back on devices when battles clear the floor but contributors do not', () => {
    // 300 battles from one device is one person's matchmaking queue, not what players face.
    const r = rank(
      meta({ battles: MEASURED_MIN, devices: MEASURED_MIN_DEVICES - 1, species: [] }),
      baseline,
    );
    expect(r.source).toBe('baseline');
    expect(r.holdback).toBe('devices');
  });

  it('has no holdback once both battles and devices clear their floors', () => {
    const r = rank(
      meta({ battles: MEASURED_MIN, devices: MEASURED_MIN_DEVICES, species: [] }),
      baseline,
    );
    expect(r.source).toBe('measured');
    expect(r.holdback).toBeNull();
  });

  it('still reads as baseline one battle short of the measured floor', () => {
    const r = rank(
      meta({ battles: MEASURED_MIN - 1, devices: 40, species: [] }),
      baseline,
    );
    expect(r.source).toBe('baseline');
  });
});

describe('rank, sorting defensively', () => {
  it('sorts a shuffled species list by sightings before ranking, so a bad input cannot corrupt rank order', () => {
    const shuffled = [sp('lanturn', 2, 1, 1), sp('umbreon', 1, 1, 0), sp('medicham', 9, 4, 5)];
    const r = rank(meta({ battles: 40, devices: 6, species: shuffled }), baseline);
    expect(r.measured.map((m) => m.speciesId)).toEqual(['medicham', 'lanturn']);
    expect(r.measured.map((m) => m.rank)).toEqual([1, 2]);
  });

  it('sorts a shuffled baseline list by score before ranking', () => {
    const shuffledBaseline: Baseline = {
      ...baseline,
      species: [bs('clodsire', 80), bs('azumarill', 93), bs('tinkaton', 90)],
    };
    const r = rank(meta(), shuffledBaseline);
    expect(r.baseline.map((b) => b.speciesId)).toEqual(['azumarill', 'tinkaton', 'clodsire']);
    expect(r.baseline.map((b) => b.rank)).toEqual([1, 2, 3]);
  });
});

describe('rank, with nothing at all', () => {
  it('answers with an empty measured list rather than throwing', () => {
    const r = rank(meta(), baseline);
    expect(r.source).toBe('baseline');
    expect(r.measured).toEqual([]);
    expect(r.tail).toBe(0);
  });
});
