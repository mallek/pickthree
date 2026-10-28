import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPvPokeContext } from '@pickthree/sim-pvpoke';
import { pvpokeToBattleData } from '../../src/exam/convert.js';
import { expandScript, type PolicyScript } from '../../src/exam/expand.js';
import { runOursScript, type ExamRun, type ExamSide } from '../../src/exam/run-ours.js';
import { runPvPokeScript } from '../../src/exam/run-pvpoke.js';
import { GAMEMASTER_PATH } from '../../src/paths.js';

// Live, invariants only: both runners play the same script and must agree with each other. No
// PvPoke numbers are pinned; turns for charged moves come from expandScript, not from a constant.

const here = path.dirname(fileURLToPath(import.meta.url));
const MECHANICS_PATH = path.resolve(here, '..', '..', 'src', 'exam', 'pvpoke-mechanics.yaml');

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);
if (!havePvPoke && process.env.PICKTHREE_REQUIRE_PVPOKE === '1') {
  throw new Error('PvPoke checkout missing. Run npm run data:fetch');
}

const MEDICHAM: ExamSide = {
  speciesId: 'medicham',
  level: 25,
  ivs: { atk: 4, def: 14, hp: 12 },
  fastMove: 'COUNTER',
  chargedMoves: ['ICE_PUNCH', 'PSYCHIC'],
  shields: 1,
};
const AZUMARILL: ExamSide = {
  speciesId: 'azumarill',
  level: 30,
  ivs: { atk: 10, def: 6, hp: 15 },
  fastMove: 'BUBBLE',
  chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'],
  shields: 1,
};
const MINIOR: ExamSide = {
  speciesId: 'minior_core',
  level: 20,
  ivs: { atk: 5, def: 10, hp: 12 },
  fastMove: 'ROLLOUT',
  chargedMoves: ['POWER_GEM'],
  shields: 0,
};

function policy(
  id: string,
  sides: [ExamSide, ExamSide],
  times: [number, number],
  shields: [boolean[], boolean[]] = [[], []],
  buffs: boolean[] = [],
): PolicyScript {
  return {
    id,
    covers: [],
    sides,
    policy: [
      { slot: 0, times: times[0] },
      { slot: 0, times: times[1] },
    ],
    shields,
    buffs,
  };
}

/** hp and energy per turn, the numbers the exam compares. */
function numbers(run: ExamRun): { turn: number; hp: [number, number]; energy: [number, number] }[] {
  return run.trace.map((t) => ({ turn: t.turn, hp: t.hp, energy: t.energy }));
}

describe.skipIf(!havePvPoke)('exam script runners', () => {
  const gamemaster = JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown;
  const ctx = createPvPokeContext(gamemaster);
  const data = pvpokeToBattleData(ctx, fs.readFileSync(MECHANICS_PATH, 'utf8'), 'test-commit');

  it('a fast-only mirror gives traces of the same length from both runners, nothing executed', () => {
    const sides: [ExamSide, ExamSide] = [MEDICHAM, MEDICHAM];
    const script = expandScript(data, policy('mirror', sides, [0, 0]));
    expect(script).toEqual([]);
    const ours = runOursScript(data, sides, script);
    const theirs = runPvPokeScript(ctx, sides, script);
    expect(ours.trace.length).toBeGreaterThan(0);
    expect(theirs.trace.length).toBe(ours.trace.length);
    expect(ours.executed).toEqual([]);
    expect(theirs.executed).toEqual([]);
  });

  it('numbers turns from 1, one record per turn, on both runners', () => {
    const sides: [ExamSide, ExamSide] = [MEDICHAM, AZUMARILL];
    for (const run of [runOursScript(data, sides, []), runPvPokeScript(ctx, sides, [])]) {
      expect(run.trace.map((t) => t.turn)).toEqual(run.trace.map((_, i) => i + 1));
    }
  });

  it('a fast-only battle agrees turn by turn on hp and energy (turn alignment)', () => {
    const sides: [ExamSide, ExamSide] = [MEDICHAM, AZUMARILL];
    const ours = runOursScript(data, sides, []);
    const theirs = runPvPokeScript(ctx, sides, []);
    expect(numbers(theirs)).toEqual(numbers(ours));
  });

  it('a script with one charged move on side 0 is executed by both runners', () => {
    const sides: [ExamSide, ExamSide] = [MEDICHAM, AZUMARILL];
    const script = expandScript(data, policy('one-charged', sides, [1, 0]));
    expect(script.length).toBe(1);
    const [entry] = script;
    expect(entry?.actor).toBe(0);
    const ours = runOursScript(data, sides, script);
    const theirs = runPvPokeScript(ctx, sides, script);
    expect(ours.executed).toEqual(script);
    expect(theirs.executed).toEqual(script);
    expect(numbers(theirs)).toEqual(numbers(ours));
  });

  it('a shielded charged move is shielded on both runners', () => {
    const sides: [ExamSide, ExamSide] = [MEDICHAM, AZUMARILL];
    const script = expandScript(data, policy('shielded', sides, [1, 0], [[], [true]]));
    expect(script.map((e) => e.shielded)).toEqual([true]);
    const ours = runOursScript(data, sides, script);
    const theirs = runPvPokeScript(ctx, sides, script);
    expect(theirs.executed).toEqual(script);
    expect(numbers(theirs)).toEqual(numbers(ours));
  });

  it('expandScript is deterministic and its scripted rerun executes every entry', () => {
    const s = policy('both-throw', [MEDICHAM, AZUMARILL], [3, 3], [[true], [false, true]], [true]);
    const first = expandScript(data, s);
    const second = expandScript(data, s);
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(1);
    expect(runOursScript(data, s.sides, first).executed).toEqual(first);
  });

  it('records each side its form every turn; Minior starts in Meteor form on both runners', () => {
    const sides: [ExamSide, ExamSide] = [MINIOR, AZUMARILL];
    const ours = runOursScript(data, sides, []);
    const theirs = runPvPokeScript(ctx, sides, []);
    expect(ours.trace[0]?.forms[0]).toBe('minior_meteor');
    expect(theirs.trace[0]?.forms[0]).toBe('minior_meteor');
    expect(theirs.trace[0]?.forms[1]).toBe('azumarill');
  });
});
