import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameData, League, Move, Species } from '@pickthree/engine';
import type { GeneratedFile } from '@pickthree/engine/meta';
import { OUTPUT_DIR } from '../src/paths.js';
import { writeBaselineTeams } from '../src/build-baseline.js';

const have = fs.existsSync(path.join(OUTPUT_DIR, 'data-manifest.json'));

let dir: string | null = null;
afterEach(() => {
  if (dir !== null) {
    fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  }
});

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, ...parts), 'utf8')) as T;
}

describe.skipIf(!have)('writeBaselineTeams over the real data build', () => {
  it('writes a generated file for every non-special league with a matrix', () => {
    const great = readJson<League[]>('leagues.json').find((l) => l.id === 'great');
    if (!great) {
      throw new Error('great league missing from leagues.json');
    }
    const data: GameData = {
      ...readJson<Omit<GameData, 'species' | 'moves'>>('gamedata-meta.json'),
      species: readJson<Species[]>('pokemon.json'),
      moves: readJson<Move[]>('moves.json'),
    };
    const gameMaster: unknown = readJson('gamemaster.json');
    const manifest = readJson<{ pvpokeCommit: string; pvpokeDate: string }>('data-manifest.json');

    // Great only, so the draft runs once: its matrix and rankings, copied into a scratch dir.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-'));
    dir = tmp;
    fs.writeFileSync(path.join(tmp, 'leagues.json'), JSON.stringify([great]));
    fs.mkdirSync(path.join(tmp, 'matrix'));
    fs.copyFileSync(
      path.join(OUTPUT_DIR, 'matrix', 'great.json'),
      path.join(tmp, 'matrix', 'great.json'),
    );
    fs.cpSync(path.join(OUTPUT_DIR, 'rankings', 'great'), path.join(tmp, 'rankings', 'great'), {
      recursive: true,
    });
    // A league with no matrix (the PICKTHREE_SKIP_MATRIX case) and a special league are skipped.
    const noMatrix: League = { ...great, id: 'nomatrix' };
    const special: League = { ...great, id: 'specialcup', kind: 'special' };

    const written = writeBaselineTeams(tmp, [great, noMatrix, special], data, gameMaster, manifest);

    expect(written.map((w) => w.league)).toEqual(['great']);
    expect(fs.readdirSync(path.join(tmp, 'baseline'))).toEqual(['great-teams.json']);
    const file = JSON.parse(
      fs.readFileSync(path.join(tmp, 'baseline', 'great-teams.json'), 'utf8'),
    ) as GeneratedFile;
    expect(file.league).toBe('great');
    expect(file.source).toBe('generated');
    expect(file.pvpokeCommit).toBe(manifest.pvpokeCommit);
    expect(file.pvpokeDate).toBe(manifest.pvpokeDate);
    expect(typeof file.projectionSlope).toBe('number');
    expect(typeof file.projectionAnchor).toBe('number');
    expect(file.teams).toHaveLength(24);
    expect(written[0]?.teams).toBe(24);
    for (const team of file.teams) {
      expect(new Set(team.species).size).toBe(3);
      expect(team.strength).toBeGreaterThanOrEqual(0);
      expect(team.strength).toBeLessThanOrEqual(100);
    }
    // Drafting a 60-species pool is roughly 300 ms alone; parallel workers can slow it a lot.
  }, 20_000);
});
