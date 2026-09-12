import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GREAT_LEAGUE } from '@pickthree/engine';
import type { MovesetOverride } from '@pickthree/engine';
import { loadPvPokeInNode } from '../src/node-host.js';
import { PvPokeSimulator } from '../src/PvPokeSimulator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pvpoke =
  process.env.PICKTHREE_PVPOKE_DIR ?? path.resolve(here, '..', '..', 'data', '.pvpoke');
const dataDir = path.join(pvpoke, 'src', 'data');
const havePvPoke = fs.existsSync(path.join(dataDir, 'gamemaster.json'));

interface RawRanking {
  speciesId: string;
  moves: { fastMoves: { moveId: string }[]; chargedMoves: { moveId: string }[] };
  matchups: { opponent: string; rating: number }[];
  counters: { opponent: string; rating: number }[];
}

function effectiveMoveset(
  id: string,
  rankings: RawRanking[],
  overrides: MovesetOverride[],
): string[] {
  const e = rankings.find((r) => r.speciesId === id);
  if (!e) {
    throw new Error(`no ranking for ${id}`);
  }
  let fast = e.moves.fastMoves[0]?.moveId ?? '';
  let charged = e.moves.chargedMoves.slice(0, 2).map((m) => m.moveId);
  const o = overrides.find((x) => x.speciesId === id);
  if (o?.fastMove) {
    fast = o.fastMove;
  }
  if (o?.chargedMoves) {
    charged = [...o.chargedMoves];
  }
  return [fast, ...charged];
}

describe.skipIf(!havePvPoke)('golden: reproduce PvPoke leads matchup ratings', () => {
  const gm = JSON.parse(fs.readFileSync(path.join(dataDir, 'gamemaster.json'), 'utf8')) as unknown;
  const leads = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'rankings', 'all', 'leads', 'rankings-1500.json'), 'utf8'),
  ) as RawRanking[];
  const overrides = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'overrides', 'all', '1500.json'), 'utf8'),
  ) as MovesetOverride[];
  const sim = new PvPokeSimulator(loadPvPokeInNode(gm));

  function spec(id: string): {
    speciesId: string;
    fastMove: string;
    chargedMoves: string[];
    shields: number;
  } {
    const [fast, ...charged] = effectiveMoveset(id, leads, overrides);
    return { speciesId: id, fastMove: fast ?? '', chargedMoves: charged, shields: 1 };
  }

  it('matches published ratings for the top 60 ranked species (>= 90% exact, all within 25)', () => {
    const sample = leads.slice(0, 60);
    let total = 0;
    let exact = 0;
    const misses: string[] = [];
    for (const entry of sample) {
      for (const m of [...entry.matchups, ...entry.counters]) {
        const r = sim.simulate(spec(entry.speciesId), spec(m.opponent), GREAT_LEAGUE);
        total += 1;
        if (r.rating === m.rating) {
          exact += 1;
        } else {
          misses.push(
            `${entry.speciesId} vs ${m.opponent}: got ${r.rating}, published ${m.rating}`,
          );
        }
        expect(
          Math.abs(r.rating - m.rating),
          `${entry.speciesId} vs ${m.opponent}`,
        ).toBeLessThanOrEqual(25);
      }
    }
    if (misses.length > 0) {
      console.log(`golden misses (${misses.length}/${total}):\n${misses.join('\n')}`);
    }
    expect(exact / total).toBeGreaterThanOrEqual(0.9);
  });

  it('matches azumarill vs altaria exactly', () => {
    const azu = leads.find((r) => r.speciesId === 'azumarill');
    const published = azu?.matchups.find((m) => m.opponent === 'altaria')?.rating;
    expect(published).toBeDefined();
    const r = sim.simulate(spec('azumarill'), spec('altaria'), GREAT_LEAGUE);
    expect(r.rating).toBe(published);
  });
});
