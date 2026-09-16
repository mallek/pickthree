import { describe, expect, it } from 'vitest';
import { facingWeight, type MetaRank } from '../../src/gamedata/metaRank.js';
import type { RankingEntry } from '../../src/gamedata/types.js';
import {
  buildFacingProfile,
  countSightings,
  countedBattles,
  facingLine,
} from '../../src/yourmeta/profile.js';
import type { LoggedBattle } from '../../src/yourmeta/types.js';

function rank(id: string, overall: number): [string, MetaRank] {
  return [id, { overall, score: 90, role: null, roleRank: null }];
}

function entry(speciesId: string, moveset: string[]): RankingEntry {
  return {
    speciesId,
    score: 80,
    rating: 600,
    moveset,
    fastMoves: [],
    chargedMoves: [],
    matchups: [],
    counters: [],
    statProduct: null,
  };
}

const opponents = ['tinkaton', 'azumarill', 'azumarill', 'clodsire'];
const ranks = new Map<string, MetaRank>([
  rank('tinkaton', 1),
  rank('azumarill', 3),
  rank('clodsire', 7),
  rank('dragonite_shadow', 120),
  rank('furret', 40),
  rank('unranked_thing', 500),
]);
const rankings: RankingEntry[] = [
  entry('tinkaton', ['FAIRY_WIND', 'GIGATON_HAMMER', 'BULLDOZE']),
  entry('dragonite_shadow', ['DRAGON_BREATH', 'DRAGON_CLAW', 'SUPERPOWER']),
  entry('furret', ['SUCKER_PUNCH', 'BRICK_BREAK', 'TRAILBLAZE']),
];

let n = 0;
function b(opponents: string[], tanked = false, at?: string): LoggedBattle {
  n += 1;
  return {
    id: `b${n}`,
    at:
      at ??
      `2026-09-${String(10 + (n % 5)).padStart(2, '0')}T${String(n % 24).padStart(2, '0')}:00:00Z`,
    opponents,
    result: tanked ? null : 'win',
    tanked,
  };
}

function battles(count: number, make: (i: number) => string[]): LoggedBattle[] {
  return Array.from({ length: count }, (_, i) => b(make(i)));
}

describe('countedBattles and countSightings', () => {
  it('drops tanked, keeps the most recent N, counts a species once per battle', () => {
    const list = [
      b(['tinkaton'], false, '2026-09-01T00:00:00Z'),
      b(['azumarill'], true, '2026-09-02T00:00:00Z'),
      b(['azumarill', 'azumarill'], false, '2026-09-03T00:00:00Z'),
      b(['clodsire'], false, '2026-09-04T00:00:00Z'),
    ];
    const kept = countedBattles(list, 2);
    expect(kept.map((x) => x.opponents[0])).toEqual(['clodsire', 'azumarill']);
    const s = countSightings(kept);
    expect(s.get('azumarill')).toBe(1);
    expect(s.get('clodsire')).toBe(1);
    expect(s.has('tinkaton')).toBe(false);
  });
});

describe('buildFacingProfile', () => {
  it('reproduces PvPoke weights per column when the switch is off', () => {
    const p = buildFacingProfile({
      battles: battles(40, () => ['dragonite_shadow']),
      opponents,
      ranks,
      rankings,
      blend: false,
    });
    expect(p.engaged).toBe(false);
    expect(p.reason).toBe('off');
    expect(p.outsiders).toEqual([]);
    expect(p.weights.get('tinkaton')).toBe(facingWeight(1));
    expect(p.weights.get('azumarill')).toBe(facingWeight(3));
    expect(p.weights.size).toBe(3);
    expect(p.battles).toBe(40);
  });

  it('reproduces PvPoke weights below 15 battles', () => {
    const p = buildFacingProfile({
      battles: battles(14, () => ['dragonite_shadow']),
      opponents,
      ranks,
      rankings,
      blend: true,
    });
    expect(p.reason).toBe('too-few');
    expect(p.weights.get('clodsire')).toBe(facingWeight(7));
    expect(p.outsiders).toEqual([]);
  });

  it('engages at 15, blends, and picks outsiders with a rankings entry', () => {
    const p = buildFacingProfile({
      battles: [
        ...battles(10, () => ['dragonite_shadow', 'tinkaton']),
        ...battles(3, () => ['furret']),
        ...battles(2, () => ['unranked_thing']),
        b(['furret'], true),
      ],
      opponents,
      ranks,
      rankings,
      blend: true,
    });
    expect(p.engaged).toBe(true);
    expect(p.battles).toBe(15);
    expect(p.sightings).toBe(25);
    expect(p.outsiders.map((o) => o.speciesId)).toEqual(['dragonite_shadow', 'furret']);
    expect(p.outsiders[0]).toEqual({
      speciesId: 'dragonite_shadow',
      fastMove: 'DRAGON_BREATH',
      chargedMoves: ['DRAGON_CLAW', 'SUPERPOWER'],
    });
    expect(p.outsiderWeights.get('dragonite_shadow')).toBeGreaterThan(
      p.outsiderWeights.get('furret') as number,
    );
    // The seen matrix species outweighs an unseen one of similar rank.
    expect(p.weights.get('tinkaton')).toBeGreaterThan(p.weights.get('azumarill') as number);
    // The map is keyed by species id, so the two azumarill columns share one entry and the
    // species weights sum to one.
    let sum = 0;
    for (const v of p.weights.values()) {
      sum += v;
    }
    for (const v of p.outsiderWeights.values()) {
      sum += v;
    }
    expect(sum).toBeCloseTo(1);
  });

  it('caps outsiders and needs two sightings', () => {
    const many = Array.from({ length: 12 }, (_, i) => `spice_${i}`);
    const rk = new Map(ranks);
    const rs = [...rankings];
    many.forEach((id, i) => {
      rk.set(id, { overall: 200 + i, score: 50, role: null, roleRank: null });
      rs.push(entry(id, ['A', 'B', 'C']));
    });
    const p = buildFacingProfile({
      battles: [
        ...many.flatMap((id, i) => battles(i < 10 ? 2 : 1, () => [id])),
        ...battles(5, () => ['tinkaton']),
      ],
      opponents,
      ranks: rk,
      rankings: rs,
      blend: true,
      // 2*10 + 2 + 5 = 27 battles
    });
    expect(p.outsiders).toHaveLength(8);
    expect(p.outsiders.map((o) => o.speciesId)).toEqual(many.slice(0, 8));
  });
});

describe('facingLine', () => {
  const base = {
    weights: new Map<string, number>(),
    outsiderWeights: new Map<string, number>(),
    sightings: 0,
  };
  it('describes each state', () => {
    expect(facingLine({ ...base, outsiders: [], battles: 40, engaged: false, reason: 'off' })).toBe(
      'PvPoke weights only (your log is switched off)',
    );
    expect(
      facingLine({ ...base, outsiders: [], battles: 13, engaged: false, reason: 'too-few' }),
    ).toBe('PvPoke weights only (13 of 15 battles logged)');
    const o = [{ speciesId: 'x', fastMove: 'A', chargedMoves: ['B'] }];
    expect(
      facingLine({ ...base, outsiders: o, battles: 42, engaged: true, reason: 'engaged' }),
    ).toBe(
      "Weighted by your log: 42 battles this season, 1 opponent outside PvPoke's list simulated",
    );
    expect(
      facingLine({ ...base, outsiders: [], battles: 42, engaged: true, reason: 'engaged' }),
    ).toBe("Weighted by your log: 42 battles this season, no opponents outside PvPoke's list");
    expect(
      facingLine(
        { ...base, outsiders: o, battles: 42, engaged: true, reason: 'engaged' },
        'counters',
      ),
    ).toBe(
      "Weighted by your log: 42 battles this season; opponents outside PvPoke's list counted, not simulated",
    );
  });
});
