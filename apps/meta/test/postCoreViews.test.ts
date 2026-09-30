import { describe, expect, it } from 'vitest';
import type { BoardRow, Candidate, CoreRowOut } from '@pickthree/engine';
import {
  HEADINGS,
  READING_LINES,
  SUBTITLES,
  coreBoardView,
  postCoreBoard,
  type CoreIndex,
} from '../scripts/post/coreViews.js';

const SPECIES: Record<string, { name: string; type: string; megaOf?: string }> = {
  alpha: { name: 'Alpha', type: 'water' },
  beta_shadow: { name: 'Beta (Shadow)', type: 'fire' },
  gamma: { name: 'Gamma', type: 'grass' },
  gamma_mega: { name: 'Gamma (Mega)', type: 'dragon', megaOf: 'gamma' },
};
const index: CoreIndex = {
  mustSpecies: (id) => {
    const s = SPECIES[id]!;
    return { speciesId: id, speciesName: s.name, types: [s.type, 'none'] } as never;
  },
  teamSpeciesOf: (id) => SPECIES[id]?.megaOf ?? id,
};

const cand = (id: string, elite = 0): Candidate =>
  ({
    build: { speciesId: id },
    moveset: {
      fast: { name: 'Fast Move', moveId: 'FAST_MOVE' },
      charged: [{ name: 'Big One', moveId: 'BIG_ONE' }],
      eliteTmCount: elite,
    },
  }) as never;

const team = (ids: string[], strength: number, exposure: string[] = []): BoardRow =>
  ({
    team: {
      species: ids,
      strength,
      coverage: 1,
      consistency: 2,
      safety: 3,
      structure: 'ABC',
      exposure,
    },
    members: ids.map((i) => cand(i)),
    megaId: null,
  }) as never;

const row = (): CoreRowOut => ({
  core: [cand('alpha', 1), cand('beta_shadow')],
  flexKind: 'mega',
  megaInCore: null,
  flex: [
    {
      third: cand('gamma_mega'),
      team: team(['alpha', 'beta_shadow', 'gamma_mega'], 92.5, [
        'alpha',
        'beta_shadow',
        'gamma',
        'x',
      ]),
    },
    { third: cand('gamma'), team: team(['alpha', 'beta_shadow', 'gamma'], 90) },
  ],
});

describe('coreViews', () => {
  it('selects subtitle, reading line and heading per board', () => {
    expect(SUBTITLES.budget).toBe('Budget Cores - No Elite TM');
    expect(HEADINGS.mega).toBe('Cores + Your Mega');
    expect(READING_LINES.mega).toContain('one Mega');
    expect(READING_LINES.top).toBe(READING_LINES.budget);
  });

  it('builds a board view with tags, elite, isMega, strengths and caution', () => {
    const v = coreBoardView(index, {
      id: 'mega',
      rows: [row()],
      title: 'Test Cup',
      label: 'LIVE',
      mixLine: 'mix',
      mascot: 'm',
    });
    expect(v.subtitle).toBe('Cores + Your Mega');
    expect(v.source[0]).toBe('Strength: pick3 sims vs the Test Cup meta');
    const r = v.rows[0]!;
    expect(r.core[0].tags).toEqual([{ kind: 'elite', text: 'Elite TM' }]);
    expect(r.core[1].tags).toEqual([{ kind: 'shadow', text: 'Shadow' }]);
    expect(r.core[1].sprite).toBe('beta');
    expect(r.core[0].moves).toEqual(['Fast Move', 'Big One']);
    expect(r.core[0].type).toBe('water');
    expect(r.core.map((m) => m.isMega)).toEqual([false, false]);
    expect(r.flex.map((f) => f.isMega)).toEqual([true, false]);
    expect(r.flex.map((f) => f.strength)).toEqual([92.5, 90]);
    expect(r.strength).toBe(92.5);
    expect(r.flexKind).toBe('mega');
    expect(r.caution).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(r.flex[0]).not.toHaveProperty('moves');
  });

  it('builds the post record with full names and whole teams', () => {
    const b = postCoreBoard(index, 'top', [row()]);
    expect(b.heading).toBe('Top Cores');
    const r = b.rows[0]!;
    expect(r.coreNames).toEqual(['Alpha', 'Beta (Shadow)']);
    expect(r.flex.map((f) => f.name)).toEqual(['Gamma (Mega)', 'Gamma']);
    expect(r.flex[0]!.team.moves[0]).toEqual(['FAST_MOVE', 'BIG_ONE']);
    expect(r.flex[0]!.team.strength).toBe(92.5);
  });
});
