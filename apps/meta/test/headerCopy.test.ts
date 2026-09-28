import { describe, expect, it } from 'vitest';
import { blendParts, sourceHeaderLine } from '../src/headerCopy.js';
import type { SpeciesRanking } from '../src/rank.js';

const ZERO = "PvPoke's list. No shared battles in this window yet.";

function ranking(over: Partial<SpeciesRanking>): SpeciesRanking {
  return {
    source: 'all',
    say: 0,
    tournamentSay: 0,
    battles: 0,
    devices: 0,
    tournamentBattles: 0,
    events: 0,
    eventsOther: 0,
    rows: [],
    weights: new Map(),
    pvpokeCommit: 'abc1234def',
    pvpokeDate: '2026-09-10',
    ...over,
  };
}

describe('sourceHeaderLine', () => {
  // `say` and `tournamentSay` are inputs here, not recomputed: this file tests the SENTENCE,
  // and rank.test.ts tests the curves that produce those two numbers. So the counts below are
  // chosen to be the ones that actually produce the say they sit next to.
  // measuredSay(148, 9) = min(148/448, 9/14) = 0.330; tournamentSay(105, 1) = min(105/205, 1/3)
  // = 0.333. The spec's own worked example prints the same three percentages beside 480 battles
  // and 9 devices, which would really be 62%; see the plan's Self-review, "Still open".
  it('states all three weights and both populations under All', () => {
    const r = ranking({
      source: 'all',
      say: 0.33,
      tournamentSay: 1 / 3,
      battles: 148,
      devices: 9,
      tournamentBattles: 105,
      events: 1,
    });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      'PvPoke 45%, tournaments 22%, GBL 33%. From 148 shared battles by 9 devices and 105 tournament battles from 1 event.',
    );
  });

  it('says so plainly when tournaments are all there is', () => {
    const r = ranking({
      source: 'all',
      tournamentSay: 1 / 3,
      tournamentBattles: 105,
      events: 1,
    });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      'PvPoke 67%, tournaments 33%. From 105 tournament battles from 1 event. No shared ladder battles in this window yet.',
    );
  });

  it('falls back to the ladder sentence under All when no event is in the window', () => {
    const r = ranking({ source: 'all', say: 0.5, battles: 300, devices: 10 });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      '50% measured, from 300 shared battles by 10 devices',
    );
  });

  // The literal `ladder` source is not wired into any screen yet (Task 13/14 does that), but its
  // wording must stay byte-identical to today's inline sentence in Pokemon.tsx, Teams.tsx and
  // Species.tsx (see pokemon.test.tsx:108, teams.test.tsx:422, species.test.tsx:423): "battles
  // shared by", the OLD word order, not the "shared battles by" the All fallback above uses. Same
  // inputs as the test above, different source, deliberately a different string, so a future wire-
  // up cannot quietly swap the two wordings.
  it('keeps the literal ladder sentence in the word order screens already print', () => {
    const r = ranking({ source: 'ladder', say: 0.5, battles: 300, devices: 10 });
    expect(sourceHeaderLine(r, ZERO)).toBe('50% measured, from 300 battles shared by 10 devices');
  });

  it('uses the screen own zero sentence when nothing at all was measured', () => {
    expect(sourceHeaderLine(ranking({ source: 'all' }), ZERO)).toBe(ZERO);
    expect(sourceHeaderLine(ranking({ source: 'ladder' }), ZERO)).toBe(ZERO);
  });

  it('states the tournament split and disowns the ladder under Tournaments', () => {
    const r = ranking({
      source: 'tournament',
      tournamentSay: 1 / 3,
      tournamentBattles: 105,
      events: 1,
    });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      '33% from tournaments, 67% PvPoke. From 105 battles at 1 event. Not shared ladder play.',
    );
    expect(sourceHeaderLine(ranking({ source: 'tournament' }), ZERO)).toBe(
      "PvPoke's list. No tournament battles in this window yet.",
    );
  });

  it('names the commit and the date under PvPoke, and claims nothing measured', () => {
    expect(sourceHeaderLine(ranking({ source: 'prior' }), ZERO)).toBe(
      "PvPoke's list, commit abc1234 from 2026-09-10. Nothing measured.",
    );
  });

  it('pluralises events and devices', () => {
    const r = ranking({
      source: 'tournament',
      tournamentSay: 0.5,
      tournamentBattles: 1,
      events: 2,
    });
    expect(sourceHeaderLine(r, ZERO)).toBe(
      '50% from tournaments, 50% PvPoke. From 1 battle at 2 events. Not shared ladder play.',
    );
  });
});

describe('blendParts', () => {
  it('says PvPoke alone under the PvPoke source', () => {
    expect(blendParts(ranking({ source: 'prior' }))).toEqual(['PvPoke 100%']);
  });

  it('says so plainly when there are no tournament battles yet, under Tournaments', () => {
    expect(blendParts(ranking({ source: 'tournament' }))).toEqual([
      'PvPoke 100%',
      'No tournament battles yet',
    ]);
  });

  it('splits PvPoke and Tournaments under Tournaments', () => {
    const r = ranking({
      source: 'tournament',
      tournamentSay: 1 / 3,
      tournamentBattles: 105,
      events: 1,
    });
    expect(blendParts(r)).toEqual(['PvPoke 67%', 'Tournaments 33%']);
  });

  it('says so plainly when there are no shared battles yet, under GBL', () => {
    expect(blendParts(ranking({ source: 'ladder' }))).toEqual([
      'PvPoke 100%',
      'No shared battles yet',
    ]);
  });

  it('splits PvPoke and GBL under GBL', () => {
    const r = ranking({ source: 'ladder', say: 0.5, battles: 300, devices: 10 });
    expect(blendParts(r)).toEqual(['PvPoke 50%', 'GBL 50%']);
  });

  it('says so plainly when there is nothing measured at all, under All', () => {
    expect(blendParts(ranking({ source: 'all' }))).toEqual([
      'PvPoke 100%',
      'No shared battles yet',
    ]);
  });

  it('drops the GBL part under All when there are tournament battles but no ladder ones', () => {
    const r = ranking({
      source: 'all',
      say: 0,
      tournamentSay: 0.37,
      tournamentBattles: 105,
      events: 1,
    });
    expect(blendParts(r)).toEqual(['PvPoke 63%', 'Tournaments 37%']);
  });

  it('drops the Tournaments part under All when there are ladder battles but no tournament ones', () => {
    const r = ranking({ source: 'all', say: 0.4, battles: 200, devices: 5 });
    expect(blendParts(r)).toEqual(['PvPoke 60%', 'GBL 40%']);
  });

  it('states all three parts under All when both populations are present', () => {
    const r = ranking({
      source: 'all',
      say: 0.33,
      tournamentSay: 1 / 3,
      battles: 148,
      devices: 9,
      tournamentBattles: 105,
      events: 1,
    });
    expect(blendParts(r)).toEqual(['PvPoke 45%', 'Tournaments 22%', 'GBL 33%']);
  });

  it("never disagrees with sourceHeaderLine's own percentages for the same ranking", () => {
    const r = ranking({
      source: 'all',
      say: 0.33,
      tournamentSay: 1 / 3,
      battles: 148,
      devices: 9,
      tournamentBattles: 105,
      events: 1,
    });
    // sourceHeaderLine's own sentence for these inputs (pinned above): "PvPoke 45%, tournaments
    // 22%, GBL 33%. ...". blendParts must carry the identical three numbers.
    expect(sourceHeaderLine(r, ZERO)).toContain('PvPoke 45%, tournaments 22%, GBL 33%');
    expect(blendParts(r)).toEqual(['PvPoke 45%', 'Tournaments 22%', 'GBL 33%']);
  });
});
