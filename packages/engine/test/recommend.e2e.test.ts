import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { toSpecimens } from '../src/collection/specimen.js';
import { parsePokeGenieCsv } from '../src/csv/parse.js';
import { GameDataIndex } from '../src/gamedata/index.js';
import { recommend, verdictsFor } from '../src/recommend.js';
import { REPO_ROOT, haveStaticData, loadFixtureCsv, loadStaticData } from './fixtures.js';

const gmPath = path.join(
  REPO_ROOT,
  'packages',
  'data',
  '.pvpoke',
  'src',
  'data',
  'gamemaster.json',
);
const ready = haveStaticData() && fs.existsSync(gmPath);

describe.skipIf(!ready)('recommend end to end', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sim = new PvPokeSimulator(loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8'))));
  const { specimens, report } = toSpecimens(parsePokeGenieCsv(loadFixtureCsv()), index);
  const deps = { data, sim };

  it('produces ranked teams from the fixture within budget', () => {
    const stages: string[] = [];
    const rec = recommend(specimens, {}, deps, (stage) => {
      if (stages.at(-1) !== stage) {
        stages.push(stage);
      }
    });
    console.log(
      `e2e: ${rec.stats.specimens} specimens, ${rec.stats.eligibleBuilds} builds, pool ${rec.stats.poolSize}, ${rec.stats.triosScored} trios, ${rec.stats.finalists} finalists, ${rec.teams.length} teams in ${rec.stats.ms} ms`,
    );
    expect(stages).toEqual(['eligibility', 'candidates', 'trios', 'simulate', 'score']);
    expect(rec.teams.length).toBeGreaterThanOrEqual(3);
    expect(rec.stats.ms).toBeLessThan(15_000);
    expect(rec.assumptions.pvpokeCommit).toBe(data.manifest.pvpokeCommit);
    expect(rec.assumptions.metaSize).toBe(data.meta.length);
    for (const team of rec.teams) {
      const species = team.slots.map((s) => s.candidate.build.speciesId);
      expect(new Set(species).size).toBe(3);
      expect(team.slots.map((s) => s.role)).toEqual(['lead', 'switch', 'closer']);
      expect(team.cost.stardust).toBeGreaterThanOrEqual(0);
      expect(team.score.total).toBeGreaterThanOrEqual(0);
      expect(team.score.total).toBeLessThanOrEqual(100);
      expect(['Strong', 'Solid', 'Situational']).toContain(team.score.fit);
      expect(['Easy', 'Moderate', 'Demanding']).toContain(team.score.difficulty);
      expect(team.explanation.why.length).toBeGreaterThan(20);
      expect(team.explanation.keyWins.length).toBeGreaterThanOrEqual(1);
      expect(team.explanation.alternatives.length).toBeGreaterThanOrEqual(1);
      for (const slot of team.slots) {
        expect(slot.candidate.moveset.charged.length).toBeGreaterThanOrEqual(1);
        expect(slot.sim.results.length).toBe(data.meta.length);
      }
    }
    const sorted = [...rec.teams].sort((a, b) => b.score.total - a.score.total);
    expect(rec.teams.map((t) => t.id)).toEqual(sorted.map((t) => t.id));
    const first = rec.teams[0]!;
    console.log(
      `top team: ${first.slots.map((s) => s.candidate.build.speciesId).join(' / ')} (${first.structure}, ${first.score.fit}, ${first.score.difficulty}) cost ${first.cost.stardust} dust ${first.cost.candy} candy ${first.cost.xlCandy} xl ${first.cost.eliteTm} etm\n  why: ${first.explanation.why}\n  wins: ${first.explanation.keyWins.map((w) => w.opponentName).join(', ')}\n  threats: ${first.explanation.keyThreats.map((w) => w.opponentName).join(', ')}`,
    );
  });

  it('respects exclusion filters', () => {
    const noShadow = recommend(specimens, { allowShadow: false, results: 5 }, deps);
    expect(noShadow.teams.every((t) => !t.hasShadow)).toBe(true);
    const noXl = recommend(specimens, { allowXl: false, results: 5 }, deps);
    expect(noXl.teams.every((t) => !t.needsXl)).toBe(true);
    const noEtm = recommend(specimens, { allowEliteTm: false, results: 5 }, deps);
    expect(noEtm.teams.every((t) => t.eliteTms === 0)).toBe(true);
    const abb = recommend(specimens, { style: 'abb', results: 5 }, deps);
    expect(abb.teams.every((t) => t.structure === 'ABB')).toBe(true);
  });

  it('produces verdicts covering the fixture design', () => {
    const verdicts = verdictsFor(specimens, {}, deps);
    const labels = new Set(Object.values(verdicts).map((v) => v.label));
    console.log(
      'verdicts:',
      Object.values(verdicts).reduce<Record<string, number>>((acc, v) => {
        acc[v.label] = (acc[v.label] ?? 0) + 1;
        return acc;
      }, {}),
    );
    expect(labels.has('Needs rescan')).toBe(true);
    expect(labels.has('Not eligible')).toBe(true);
    expect(labels.has('Worth building') || labels.has('Ready to use')).toBe(true);
    expect(Object.keys(verdicts).length).toBe(specimens.length);
    expect(report.missingIvs.count).toBe(
      Object.values(verdicts).filter((v) => v.label === 'Needs rescan').length,
    );
  });
});
