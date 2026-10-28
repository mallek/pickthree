import {
  runBattle,
  ScriptedPlayer,
  scriptedRandom,
  type BattleData,
  type BattleSetup,
  type ScriptEntry,
  type TurnRecord,
} from '@pickthree/battle';

// The rules exam plays one script through our engine and through PvPoke (run-pvpoke.ts) and compares
// the two traces turn by turn. These shapes are what both runners return.

export interface ExamSide {
  speciesId: string;
  level: number;
  ivs: { atk: number; def: number; hp: number };
  fastMove: string;
  chargedMoves: [string] | [string, string];
  shadow?: boolean;
  shields: number;
}
/**
 * One played turn. `turn` is the turn number as both engines count it: the first turn of the battle
 * is 1, and the record holds the state after that turn resolved.
 */
export interface ExamTurn {
  turn: number;
  hp: [number, number];
  energy: [number, number];
  forms: [string, string];
}
export interface ExamRun {
  trace: ExamTurn[];
  /** The script entries the engine actually threw, in script order. */
  executed: ScriptEntry[];
  notes: string[];
}

/** Our battle setup for two exam sides. */
export function examSetup(sides: [ExamSide, ExamSide]): BattleSetup {
  const side = (s: ExamSide): BattleSetup['sides'][number] => ({
    team: [
      {
        formId: s.speciesId,
        level: s.level,
        ivs: { atk: s.ivs.atk, def: s.ivs.def, hp: s.ivs.hp },
        fastMove: s.fastMove,
        chargedMoves:
          s.chargedMoves.length === 1
            ? [s.chargedMoves[0]]
            : [s.chargedMoves[0], s.chargedMoves[1]],
        shadow: s.shadow === true,
      },
    ],
    shields: s.shields,
  });
  return { sides: [side(sides[0]), side(sides[1])] };
}

/** Drops what the exam does not compare: events, hash, maxHp, shields and stages. */
export function toExamTurn(t: TurnRecord): ExamTurn {
  return {
    turn: t.turn,
    hp: [t.hp[0], t.hp[1]],
    energy: [t.energy[0], t.energy[1]],
    forms: [t.forms[0], t.forms[1]],
  };
}

export function runOursScript(
  data: BattleData,
  sides: [ExamSide, ExamSide],
  script: readonly ScriptEntry[],
): ExamRun {
  const result = runBattle(
    data,
    examSetup(sides),
    [new ScriptedPlayer(0, script), new ScriptedPlayer(1, script)],
    scriptedRandom(script),
    { trace: true },
  );
  const thrown = result.trace.flatMap((t) => t.events.filter((e) => e.kind === 'charged'));
  const executed = script.filter((s) =>
    thrown.some((e) => e.actor === s.actor && e.turn === s.turn && e.slot === s.slot),
  );
  return { trace: result.trace.map(toExamTurn), executed, notes: [] };
}
