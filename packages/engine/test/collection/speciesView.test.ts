import { describe, expect, it } from 'vitest';
import { DEFAULT_BUILD_OPTIONS } from '../../src/builds/eligibility.js';
import { markFielded, speciesMembers, speciesView } from '../../src/collection/speciesView.js';
import { GREAT_LEAGUE_DEF } from '../../src/gamedata/league.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { specimenVerdict, type Verdict, type VerdictDeps } from '../../src/verdicts/worth.js';
import { mon, syntheticIndex } from './synthetic.js';

const index = syntheticIndex();

const deps: VerdictDeps = {
  index,
  league: GREAT_LEAGUE_DEF,
  overall: new Map(),
  metaRanks: new Map(),
  view: new MatrixView({
    league: 'great',
    cp: 1500,
    scenarios: [],
    candidates: [],
    opponents: [],
    candidateMovesets: {},
    opponentMovesets: {},
    ratings: [],
  }),
  meta: [],
  sim: null,
  simOptions: {} as VerdictDeps['simOptions'],
  buildOptions: DEFAULT_BUILD_OPTIONS,
};

const ids = (list: { specimenId: string }[]): string[] => list.map((c) => c.specimenId);

describe('speciesMembers', () => {
  const all = [
    mon('u1', 'umbreon'),
    mon('e1', 'eevee'),
    mon('v1', 'vaporeon'),
    mon('s1', 'stunfisk'),
    mon('ms', 'mudkip_shadow'),
    mon('m1', 'mudkip'),
    // A Shadow saved with the flag on its plain id.
    mon('mf', 'mudkip', { shadow: true }),
  ];
  const members = (id: string): string[] => speciesMembers(id, all, index).map((s) => s.id);

  it('an evolved page holds its own copies and the lower forms, not its siblings', () => {
    expect(members('umbreon')).toEqual(['u1', 'e1']);
    expect(members('vaporeon')).toEqual(['e1', 'v1']);
  });

  it('a base page holds only the base: no evolved copy', () => {
    expect(members('eevee')).toEqual(['e1']);
  });

  it('a Shadow is on its Shadow page only, flag on a plain id included', () => {
    expect(members('mudkip_shadow')).toEqual(['ms', 'mf']);
    expect(members('mudkip')).toEqual(['m1']);
    expect(members('swampert')).toEqual(['m1']);
  });

  it('a species nothing evolves into holds only itself', () => {
    expect(members('stunfisk')).toEqual(['s1']);
    expect(members('stunfisk_galarian')).toEqual([]);
  });
});

describe('speciesView', () => {
  const good = mon('good', 'eevee', { ivs: { atk: 0, def: 15, sta: 15 } });
  const bad = mon('bad', 'eevee', { ivs: { atk: 15, def: 0, sta: 0 } });
  const blank = mon('blank', 'eevee', { ivs: null });
  const copies = [bad, blank, good];

  it('orders by IV rank for the page species, a copy with no IVs last', () => {
    const view = speciesView('umbreon', copies, {}, deps);
    const [first, second, last] = view.copies;
    expect(ids(view.copies)).toHaveLength(3);
    expect(last?.specimenId).toBe('blank');
    expect(last?.verdict.label).toBe('Needs rescan');
    expect(first!.verdict.build!.ivRank.rank).toBeLessThan(second!.verdict.build!.ivRank.rank);
  });

  it('judges each copy as the page species, not as its best stage', () => {
    const asUmbreon = speciesView('umbreon', [good], {}, deps).copies[0]!.verdict;
    const asVaporeon = speciesView('vaporeon', [good], {}, deps).copies[0]!.verdict;
    const asEevee = speciesView('eevee', [good], {}, deps).copies[0]!.verdict;
    expect(asUmbreon.build?.speciesId).toBe('umbreon');
    expect(asVaporeon.build?.speciesId).toBe('vaporeon');
    expect(asEevee.build?.speciesId).toBe('eevee');
    expect(asEevee.build?.stageOffset).toBe(0);
  });

  it('the pick is the default with no pin, and never a copy with no IVs', () => {
    const view = speciesView('umbreon', copies, {}, deps);
    expect(view.pickId).toBe(view.defaultId);
    expect(view.pickId).toBe(view.copies[0]?.specimenId);
    expect(view.unpinned).toBe(false);
  });

  it('a pin names the pick; the default is still reported', () => {
    const plain = speciesView('umbreon', copies, {}, deps);
    const other = plain.defaultId === 'good' ? 'bad' : 'good';
    const view = speciesView('umbreon', copies, { umbreon: other }, deps);
    expect(view.pickId).toBe(other);
    expect(view.defaultId).toBe(plain.defaultId);
  });

  it('unpinned: no pick, and it says so', () => {
    const view = speciesView('umbreon', copies, { umbreon: null }, deps);
    expect(view.pickId).toBeNull();
    expect(view.unpinned).toBe(true);
    expect(view.defaultId).not.toBeNull();
  });

  it('a pin naming a Pokemon that is gone falls back to the default', () => {
    const view = speciesView('umbreon', copies, { umbreon: 'removed-long-ago' }, deps);
    expect(view.pickId).toBe(view.defaultId);
    expect(view.pickId).not.toBeNull();
  });

  it('says which other species a lower form is also the pick for', () => {
    const view = speciesView('umbreon', [good], {}, deps);
    expect(view.copies[0]?.alsoPickFor).toEqual(['vaporeon']);
    // Its own species is not "also": Eevee's page lists nothing for the same copy's evolutions
    // beyond the two it can become.
    const own = speciesView('eevee', [good], {}, deps);
    expect(own.copies[0]?.alsoPickFor.sort()).toEqual(['umbreon', 'vaporeon']);
  });

  it('an evolved copy is the pick elsewhere for nothing', () => {
    const view = speciesView('umbreon', [mon('u1', 'umbreon'), good], {}, deps);
    expect(view.copies.find((c) => c.specimenId === 'u1')?.alsoPickFor).toEqual([]);
  });

  it('over the cap as the page species: not eligible, and the line names the stage', () => {
    const big = mon('big', 'eevee', {
      ivs: { atk: 15, def: 15, sta: 15 },
      level: { min: 45, max: 45 },
    });
    const view = speciesView('umbreon', [big], {}, deps);
    const v = view.copies[0]!.verdict;
    expect(v.label).toBe('Not eligible');
    expect(v.line).toBe('This eevee would be over 1500 CP as umbreon.');
    expect(view.pickId).toBeNull();
    expect(view.defaultId).toBeNull();
    // As itself it still fits.
    expect(speciesView('eevee', [big], {}, deps).copies[0]?.verdict.build).not.toBeNull();
  });

  it('holds nothing for a species the player has none of', () => {
    const view = speciesView('stunfisk', copies, {}, deps);
    expect(view.copies).toEqual([]);
    expect(view.pickId).toBeNull();
  });
});

describe('markFielded', () => {
  // Stunfisk evolves into nothing, so each copy's verdict is about Stunfisk itself.
  const good = mon('good', 'stunfisk', { ivs: { atk: 0, def: 15, sta: 15 } });
  const bad = mon('bad', 'stunfisk', { ivs: { atk: 15, def: 0, sta: 0 } });
  const judge = (list: (typeof good)[]): Record<string, Verdict> =>
    Object.fromEntries(list.map((s) => [s.id, specimenVerdict(s, deps)]));
  const marked = (list: (typeof good)[], pins = {}): Record<string, Verdict> =>
    markFielded(list, judge(list), pins, deps);

  it('marks the pick with how many copies it was chosen from, and no other copy', () => {
    const view = speciesView('stunfisk', [bad, good], {}, deps);
    const out = marked([bad, good]);
    const other = view.pickId === 'good' ? 'bad' : 'good';
    expect(out[view.pickId!]?.fieldedAmong).toBe(2);
    expect(out[other]?.fieldedAmong).toBeUndefined();
  });

  it('follows a pin, and marks nothing for an unpinned species', () => {
    const plain = speciesView('stunfisk', [bad, good], {}, deps);
    const other = plain.pickId === 'good' ? 'bad' : 'good';
    const pinned = marked([bad, good], { stunfisk: other });
    expect(pinned[other]?.fieldedAmong).toBe(2);
    expect(pinned[plain.pickId!]?.fieldedAmong).toBeUndefined();
    const none = marked([bad, good], { stunfisk: null });
    expect(none.good?.fieldedAmong).toBeUndefined();
    expect(none.bad?.fieldedAmong).toBeUndefined();
  });

  it('an only copy is fielded among one', () => {
    expect(marked([good]).good?.fieldedAmong).toBe(1);
  });

  it('leaves the verdicts it was given untouched', () => {
    const before = judge([bad, good]);
    markFielded([bad, good], before, {}, deps);
    expect(before.good?.fieldedAmong).toBeUndefined();
    expect(before.bad?.fieldedAmong).toBeUndefined();
  });
});
