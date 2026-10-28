import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  formStats,
  runBattle,
  ScriptedPlayer,
  scriptedRandom,
  type BattleData,
  type MoveData,
  type ScriptEntry,
  type TurnRecord,
} from '@pickthree/battle';
import { createPvPokeContext } from '@pickthree/sim-pvpoke';
import { pvpokeToBattleData } from '../../src/exam/convert.js';
import { expandScript, type PolicyScript } from '../../src/exam/expand.js';
import { judge, validateDifferences, type ExamResult } from '../../src/exam/judge.js';
import { examSetup, runOursScript, type ExamRun } from '../../src/exam/run-ours.js';
import { runPvPokeScript } from '../../src/exam/run-pvpoke.js';
import { COVERAGE, EXAM_SCRIPTS } from '../../src/exam/scripts.js';
import { BATTLE_INPUT_DIR, GAMEMASTER_PATH } from '../../src/paths.js';

// The rules exam (live): every script in scripts.ts plays through our engine and through PvPoke on
// the same converted numbers, and the two traces must agree turn by turn unless differences.yaml
// explains the script. No PvPoke values are pinned: the engines are compared to each other, and the
// coverage checks read the converted data at runtime.

const here = path.dirname(fileURLToPath(import.meta.url));
const MECHANICS_PATH = path.resolve(here, '..', '..', 'src', 'exam', 'pvpoke-mechanics.yaml');
const DIFFERENCES_PATH = path.join(BATTLE_INPUT_DIR, 'differences.yaml');

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);
if (!havePvPoke && process.env.PICKTHREE_REQUIRE_PVPOKE === '1') {
  throw new Error('PvPoke checkout missing. Run npm run data:fetch');
}

const differences = validateDifferences(
  parse(fs.readFileSync(DIFFERENCES_PATH, 'utf8')) as unknown,
);

describe('rules exam inputs', () => {
  it('differences.yaml is valid and has no em dashes', () => {
    expect(differences.length).toBeGreaterThan(0);
    expect(fs.readFileSync(DIFFERENCES_PATH, 'utf8')).not.toContain(String.fromCharCode(0x2014));
  });

  it('script ids are unique and every script covers only known tags', () => {
    const ids = EXAM_SCRIPTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of EXAM_SCRIPTS) {
      expect(s.covers.length, s.id).toBeGreaterThan(0);
      for (const tag of s.covers) {
        expect(COVERAGE, `${s.id} covers ${tag}`).toContain(tag);
      }
    }
  });
});

interface Played {
  s: PolicyScript;
  script: ScriptEntry[];
  ours: ExamRun;
  pvpoke: ExamRun;
  /** Our full trace, events included: form changes inside a turn show only here. */
  records: TurnRecord[];
}

const FORM_FAMILY: Record<string, string> = {
  'form-mimikyu': 'mimikyu',
  'form-aegislash': 'aegislash',
  'form-morpeko': 'morpeko',
  'form-minior': 'minior',
};

describe.skipIf(!havePvPoke)('rules exam', () => {
  const gamemaster = JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8')) as unknown;
  const ctx = createPvPokeContext(gamemaster);
  const data: BattleData = pvpokeToBattleData(ctx, fs.readFileSync(MECHANICS_PATH, 'utf8'), 'exam');

  let played: Played[] | null = null;
  function runAll(): Played[] {
    if (played === null) {
      played = EXAM_SCRIPTS.map((s) => {
        const script = expandScript(data, s);
        return {
          s,
          script,
          ours: runOursScript(data, s.sides, script),
          pvpoke: runPvPokeScript(ctx, s.sides, script),
          records: runBattle(
            data,
            examSetup(s.sides),
            [new ScriptedPlayer(0, script), new ScriptedPlayer(1, script)],
            scriptedRandom(script),
            { trace: true },
          ).trace,
        };
      });
    }
    return played;
  }

  /** The charged move each executed entry threw, as the side named it at the start. */
  function thrown(p: Played): { entry: ScriptEntry; move: MoveData }[] {
    return p.ours.executed.map((entry) => {
      const id = p.s.sides[entry.actor].chargedMoves[entry.slot] as string;
      return { entry, move: data.moves[id] as MoveData };
    });
  }

  function atkOf(p: Played, side: 0 | 1): number {
    const x = p.s.sides[side];
    return formStats(data, x.speciesId, x.ivs, x.level).atk;
  }

  /** Both sides threw on the same turn. */
  function sameTurnPairs(p: Played): number[] {
    const turns0 = new Set(p.script.filter((e) => e.actor === 0).map((e) => e.turn));
    return p.script.filter((e) => e.actor === 1 && turns0.has(e.turn)).map((e) => e.turn);
  }

  function familySides(p: Played, family: string): (0 | 1)[] {
    return ([0, 1] as const).filter((i) => data.species[p.s.sides[i].speciesId]?.family === family);
  }

  /** The forms a side passed through, in order, from its starting form and every form event. */
  function formPath(p: Played, side: 0 | 1): string[] {
    const out = [p.s.sides[side].speciesId];
    for (const t of p.records) {
      for (const e of t.events) {
        if (e.kind === 'form' && e.actor === side && e.form !== undefined) {
          out.push(e.form);
        }
      }
    }
    return out;
  }

  function cramorantVisits(p: Played, form: string): boolean {
    return familySides(p, 'cramorant').some((side) => {
      const path_ = formPath(p, side);
      const at = path_.indexOf(form);
      return at >= 0 && path_.slice(at + 1).includes('cramorant');
    });
  }

  const has = (p: Played, test: (m: MoveData, e: ScriptEntry) => boolean): boolean =>
    thrown(p).some(({ move, entry }) => test(move, entry));
  const sure = (m: MoveData): boolean => m.buffs !== undefined && m.buffs.chance >= 1;
  const chancy = (m: MoveData): boolean => m.buffs !== undefined && m.buffs.chance < 1;

  const CHECKS: Record<string, (p: Played) => boolean> = {
    'fast-trade': (p) => p.s.policy.every((x) => x.times === 0) && p.script.length === 0,
    'charged-timing': (p) => new Set(p.ours.executed.map((e) => e.actor)).size === 2,
    'cmp-higher-atk': (p) => sameTurnPairs(p).length > 0 && atkOf(p, 0) !== atkOf(p, 1),
    'cmp-tie': (p) => sameTurnPairs(p).length > 0 && atkOf(p, 0) === atkOf(p, 1),
    shield: (p) => has(p, (_m, e) => e.shielded && p.s.sides[e.actor === 0 ? 1 : 0].shields > 0),
    'buff-self-atk': (p) => has(p, (m) => sure(m) && (m.buffs?.self?.atk ?? 0) > 0),
    'buff-self-def': (p) => has(p, (m) => sure(m) && (m.buffs?.self?.def ?? 0) > 0),
    'debuff-opponent-atk': (p) => has(p, (m) => sure(m) && (m.buffs?.opponent?.atk ?? 0) < 0),
    'debuff-opponent-def': (p) => has(p, (m) => sure(m) && (m.buffs?.opponent?.def ?? 0) < 0),
    'buff-chance-proc': (p) => has(p, (m, e) => chancy(m) && e.buff === true),
    'buff-chance-miss': (p) => has(p, (m, e) => chancy(m) && e.buff === false),
    'shadow-attacker': (p) => has(p, (_m, e) => p.s.sides[e.actor].shadow === true),
    'shadow-defender': (p) => has(p, (_m, e) => p.s.sides[e.actor === 0 ? 1 : 0].shadow === true),
    'form-cramorant-gulping': (p) => cramorantVisits(p, 'cramorant_gulping'),
    'form-cramorant-gorging': (p) => cramorantVisits(p, 'cramorant_gorging'),
  };
  for (const [tag, family] of Object.entries(FORM_FAMILY)) {
    CHECKS[tag] = (p) => familySides(p, family).some((side) => formPath(p, side).length >= 2);
  }

  it('every coverage tag has a script whose moves really have that property', () => {
    expect(Object.keys(CHECKS).sort()).toEqual([...COVERAGE].sort());
    const results = runAll();
    for (const tag of COVERAGE) {
      const claims = results.filter((p) => p.s.covers.includes(tag));
      expect(claims.length, `${tag} has no script`).toBeGreaterThan(0);
      const check = CHECKS[tag] as (p: Played) => boolean;
      for (const p of claims) {
        expect(check(p), `${p.s.id} claims ${tag}`).toBe(true);
      }
    }
  });

  it('every script ends in a knockout well inside both engines clocks', () => {
    // PvPoke times out at 240000 ms counting 10000 ms per charged move; ours at roundTurns turns.
    // The clocks cannot be aligned, so no script may reach either.
    for (const p of runAll()) {
      for (const run of [p.ours, p.pvpoke]) {
        const last = run.trace[run.trace.length - 1];
        expect(last, p.s.id).toBeDefined();
        expect(
          last?.hp.some((hp) => hp === 0),
          `${p.s.id} ends in a knockout`,
        ).toBe(true);
        const clockMs = run.trace.length * 500 + run.executed.length * 10000;
        expect(clockMs, `${p.s.id} stays inside PvPoke's clock`).toBeLessThan(240000);
        expect(run.trace.length, `${p.s.id} stays inside ours`).toBeLessThan(
          data.settings.roundTurns,
        );
      }
    }
  });

  it('a Cramorant script fires Gulp Missile from a knocked-out Cramorant (ignoresFaint)', () => {
    const fired = runAll().some((p) => {
      const sides = familySides(p, 'cramorant');
      return p.records.some((t) =>
        t.events.some((e) => e.kind === 'fire' && sides.includes(e.actor) && t.hp[e.actor] === 0),
      );
    });
    expect(fired).toBe(true);
  });

  it('the rules exam passes: every mismatch is explained', () => {
    const results: ExamResult[] = runAll().map((p) => ({
      id: p.s.id,
      ours: p.ours,
      pvpoke: p.pvpoke,
      script: p.script,
    }));
    const { verdicts, stale, report } = judge(results, differences);
    console.log(report);
    expect(
      verdicts.filter((v) => v.status === 'mismatch' || v.status === 'unexecuted'),
      report,
    ).toEqual([]);
    expect(stale, report).toEqual([]);
  });
});
