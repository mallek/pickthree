import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { analyzeTeam, hypotheticalSpecimen, type TeamPick } from '../src/analyze.js';
import { buildOptionsFor } from '../src/builds/eligibility.js';
import { GameDataIndex } from '../src/gamedata/index.js';
import {
  REPO_ROOT,
  haveLeague,
  haveStaticData,
  loadStaticData,
  type StaticData,
} from './fixtures.js';

const gmPath = path.join(
  REPO_ROOT,
  'packages',
  'data',
  '.pvpoke',
  'src',
  'data',
  'gamemaster.json',
);
const ready = haveStaticData() && haveLeague('master') && fs.existsSync(gmPath);

describe.skipIf(!ready)('analyze a team with two Megas', () => {
  const base = loadStaticData('master');
  // A league with no exclusions, so Mega forms are allowed (the real Mega leagues arrive later).
  // The built static data may predate the Mega link, so the two forms used here carry it.
  const megaOf: Record<string, string> = {
    mewtwo_mega_x: 'mewtwo',
    mewtwo_mega_y: 'mewtwo',
    charizard_mega_y: 'charizard',
  };
  const data: StaticData = {
    ...base,
    league: { ...base.league, include: [], exclude: [] },
    species: base.species.map((s) => {
      const parent = megaOf[s.speciesId];
      return parent ? { ...s, megaOf: parent } : s;
    }),
  };
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const opts = buildOptionsFor(data.league);
  const specimens = ['mewtwo', 'charizard', 'swampert'].map((id) =>
    hypotheticalSpecimen(id, index, opts),
  );
  const [mewtwo, charizard, swampert] = specimens as [
    (typeof specimens)[number],
    (typeof specimens)[number],
    (typeof specimens)[number],
  ];

  it('flags two Megas and still analyzes the team', () => {
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'specimen', id: mewtwo.id, asSpeciesId: 'mewtwo_mega_y' },
      { kind: 'specimen', id: charizard.id, asSpeciesId: 'charizard_mega_y' },
      { kind: 'specimen', id: swampert.id },
    ];
    const r = analyzeTeam(picks, specimens, { order: 'given' }, { data, sim });
    expect(r.twoMegas).toBe(true);
    expect(r.team.slots).toHaveLength(3);
    expect(r.orders).toHaveLength(1);
  });

  it('does not flag a team with one Mega', () => {
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'specimen', id: mewtwo.id, asSpeciesId: 'mewtwo_mega_y' },
      { kind: 'specimen', id: charizard.id, asSpeciesId: 'charizard' },
      { kind: 'specimen', id: swampert.id },
    ];
    const r = analyzeTeam(picks, specimens, { order: 'given' }, { data, sim });
    expect(r.twoMegas).toBe(false);
  });

  it('flags two Megas picked by species, each a Mega build that is not ready', () => {
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'species', id: 'mewtwo_mega_y' },
      { kind: 'species', id: 'charizard_mega_y' },
      { kind: 'species', id: 'swampert' },
    ];
    const r = analyzeTeam(picks, [], { order: 'given' }, { data, sim });
    expect(r.twoMegas).toBe(true);
    const megas = r.team.slots
      .map((s) => s.candidate.build)
      .filter((b) => b.speciesId.includes('_mega'));
    expect(megas.map((b) => b.speciesId).sort()).toEqual(['charizard_mega_y', 'mewtwo_mega_y']);
    for (const b of megas) {
      expect(b.mega).toEqual({ ready: false, level4: false });
      expect(b.specimen.speciesId).toBe(b.speciesId.replace('_mega_y', ''));
    }
    expect([...r.hypothetical].sort()).toEqual(['charizard_mega_y', 'mewtwo_mega_y', 'swampert']);
  });

  it('flags one Mega picked by species next to an owned Mega', () => {
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'specimen', id: mewtwo.id, asSpeciesId: 'mewtwo_mega_y' },
      { kind: 'species', id: 'charizard_mega_y' },
      { kind: 'specimen', id: swampert.id },
    ];
    const r = analyzeTeam(picks, specimens, { order: 'given' }, { data, sim });
    expect(r.twoMegas).toBe(true);
  });

  it('flags two Megas even when they are also the same species', () => {
    const twin = { ...mewtwo, id: 'mewtwo-twin' };
    const picks: [TeamPick, TeamPick, TeamPick] = [
      { kind: 'specimen', id: mewtwo.id, asSpeciesId: 'mewtwo_mega_x' },
      { kind: 'specimen', id: twin.id, asSpeciesId: 'mewtwo_mega_y' },
      { kind: 'specimen', id: swampert.id },
    ];
    const r = analyzeTeam(picks, [...specimens, twin], { order: 'given' }, { data, sim });
    expect(r.twoMegas).toBe(true);
  });
});
