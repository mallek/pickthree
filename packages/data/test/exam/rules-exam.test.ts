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
  type BattleEvent,
  type TurnRecord,
} from '@pickthree/battle';
import { createPvPokeContext } from '@pickthree/sim-pvpoke';
import { pvpokeToBattleData } from '../../src/exam/convert.js';
import { expandScript, type PolicyScript } from '../../src/exam/expand.js';
import {
  firstDifference,
  judge,
  validateDifferences,
  type ExamResult,
} from '../../src/exam/judge.js';
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
          pvpoke: runPvPokeScript(
            ctx,
            s.sides,
            script,
            s.pvpokeCp === undefined ? {} : { cp: s.pvpokeCp },
          ),
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

  interface FormStep {
    record: TurnRecord;
    /** Index of the form event in record.events. */
    at: number;
    form: string;
  }

  /** Every form change of one side, in order (changes inside a turn show only in the events). */
  function formSteps(p: Played, side: 0 | 1): FormStep[] {
    const out: FormStep[] = [];
    for (const record of p.records) {
      record.events.forEach((e, at) => {
        if (e.kind === 'form' && e.actor === side && e.form !== undefined) {
          out.push({ record, at, form: e.form });
        }
      });
    }
    return out;
  }

  /** The last event before the form event that is not itself a form change or a buff. */
  function cause(step: FormStep): BattleEvent | undefined {
    return step.record.events
      .slice(0, step.at)
      .filter((e) => e.kind !== 'form' && e.kind !== 'buff')
      .pop();
  }

  /** The first event after the form event that is not a form change or the defender's shield. */
  function next(step: FormStep): BattleEvent | undefined {
    return step.record.events
      .slice(step.at + 1)
      .find((e) => e.kind !== 'form' && e.kind !== 'shield');
  }

  /**
   * Finds `path` in order among a side's form steps, each step accepted by its own test, each found
   * after the previous one. True when the whole path is found for some side of the family.
   */
  function walks(
    p: Played,
    family: string,
    path_: { form: string; test: (step: FormStep, side: 0 | 1) => boolean }[],
  ): boolean {
    return familySides(p, family).some((side) => {
      const steps = formSteps(p, side);
      let from = 0;
      for (const want of path_) {
        const found = steps.findIndex(
          (st, i) => i >= from && st.form === want.form && want.test(st, side),
        );
        if (found < 0) {
          return false;
        }
        from = found + 1;
      }
      return true;
    });
  }

  const other = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0);
  /** Changed by the side's own charged move, after it resolved (afterChargedMove). */
  const afterOwnCharged = (st: FormStep, side: 0 | 1): boolean =>
    cause(st)?.kind === 'charged' && cause(st)?.actor === side;
  /** Changed before the side's own charged move resolved (beforeChargedMove). */
  const beforeOwnCharged = (st: FormStep, side: 0 | 1): boolean =>
    next(st)?.kind === 'charged' && next(st)?.actor === side;
  /** Changed by an unshielded charged hit from the other side (hitByChargedMove). */
  const byUnshieldedHit = (st: FormStep, side: 0 | 1): boolean => {
    const c = cause(st);
    if (c?.kind !== 'charged' || c.actor !== other(side)) {
      return false;
    }
    // a shielded hit carries the defender's shield event (and its shieldUsed form changes) between
    // the previous charged move and this one
    const events = st.record.events;
    for (let k = events.indexOf(c) - 1; k >= 0 && events[k]?.kind !== 'charged'; k -= 1) {
      if (events[k]?.kind === 'shield' && events[k]?.actor === side) {
        return false;
      }
    }
    return true;
  };
  /** Changed after the side's Gulp Missile fired. */
  const afterMissile = (st: FormStep, side: 0 | 1): boolean =>
    cause(st)?.kind === 'fire' && cause(st)?.actor === side;

  function cramorantCycle(p: Played, form: string): boolean {
    const byDiveOrSurf = (st: FormStep, side: 0 | 1): boolean => {
      const c = cause(st);
      return afterOwnCharged(st, side) && (c?.move === 'DIVE' || c?.move === 'SURF');
    };
    return walks(p, 'cramorant', [
      { form, test: byDiveOrSurf },
      { form: 'cramorant', test: afterMissile },
    ]);
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
    'form-cramorant-gulping': (p) => cramorantCycle(p, 'cramorant_gulping'),
    'form-cramorant-gorging': (p) => cramorantCycle(p, 'cramorant_gorging'),
    'form-mimikyu': (p) => walks(p, 'mimikyu', [{ form: 'mimikyu_busted', test: byUnshieldedHit }]),
    // Shield to Blade before its own charged move, then back to Shield on shielding
    'form-aegislash': (p) =>
      walks(p, 'aegislash', [
        { form: 'aegislash_blade', test: beforeOwnCharged },
        {
          form: 'aegislash_shield',
          test: (st, side) => cause(st)?.kind === 'shield' && cause(st)?.actor === side,
        },
      ]),
    'form-morpeko': (p) => walks(p, 'morpeko', [{ form: 'morpeko_hangry', test: afterOwnCharged }]),
    // Meteor (battle start), then Core from a hit that leaves it standing below half HP
    'form-minior': (p) =>
      walks(p, 'minior', [
        { form: 'minior_meteor', test: () => true },
        {
          form: 'minior_core',
          test: (st, side) => {
            const c = cause(st);
            const hp = st.record.hp[side];
            return (
              c !== undefined &&
              c.actor === other(side) &&
              (c.damage ?? 0) > 0 &&
              hp > 0 &&
              hp / st.record.maxHp[side] < 0.5
            );
          },
        },
      ]),
  };

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

  it('a Cramorant script fires Gulp Missile after the hit that knocked Cramorant out (ignoresFaint)', () => {
    const fired = runAll().some((p) =>
      familySides(p, 'cramorant').some((side) =>
        p.records.some((record, n) => {
          const fire = record.events.findIndex((e) => e.kind === 'fire' && e.actor === side);
          if (fire < 0) {
            return false;
          }
          // HP before this turn, less every hit Cramorant took before its missile fired
          const start = n === 0 ? record.maxHp[side] : (p.records[n - 1] as TurnRecord).hp[side];
          const taken = record.events
            .slice(0, fire)
            .filter((e) => e.actor === other(side))
            .reduce((sum, e) => sum + (e.damage ?? 0), 0);
          return start - taken <= 0;
        }),
      ),
    );
    expect(fired).toBe(true);
  });

  it('raising PvPoke battle CP past the caps removes the form re-level divergence', () => {
    // Evidence for differences.yaml form-change-relevel and minior-hp-form-timing: at battle CP
    // 10000 PvPoke's getFormStats keeps the level, as ours does.
    const byId = new Map(runAll().map((p) => [p.s.id, p]));
    const aegislash = byId.get('aegislash') as Played;
    const raised = runPvPokeScript(ctx, aegislash.s.sides, aegislash.script, { cp: 10000 });
    expect(firstDifference(aegislash.ours, aegislash.pvpoke)).not.toBeNull();
    expect(firstDifference(aegislash.ours, raised)).toBeNull();
    expect(raised.executed).toEqual(aegislash.ours.executed);

    // Minior: at the default CP it differs from the battle start re-level on; at 10000 the first
    // difference comes only after the hp trigger turned it Core (the cooldown reset).
    const minior = byId.get('minior-core') as Played;
    const turnOf = (text: string | null): number =>
      Number(/turn (\d+)/.exec(text ?? '')?.[1] ?? Number.NaN);
    const coreTurn =
      formSteps(minior, 0).find((st) => st.form === 'minior_core')?.record.turn ?? Number.NaN;
    const atDefault = firstDifference(minior.ours, minior.pvpoke);
    const atRaised = firstDifference(
      minior.ours,
      runPvPokeScript(ctx, minior.s.sides, minior.script, { cp: 10000 }),
    );
    expect(turnOf(atDefault)).toBeLessThan(coreTurn);
    expect(turnOf(atRaised)).toBeGreaterThan(coreTurn);
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
