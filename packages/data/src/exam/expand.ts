import {
  runBattle,
  ScriptedPlayer,
  scriptedRandom,
  type BattleData,
  type BattleView,
  type Decision,
  type IncomingCharged,
  type Player,
  type RandomSource,
  type ScriptEntry,
  type TurnRecord,
} from '@pickthree/battle';
import { examSetup, type ExamSide } from './run-ours.js';

/** Fire this slot whenever affordable, up to `times`; times 0 = fast only. */
export interface SidePolicy {
  slot: number;
  times: number;
}
export interface PolicyScript {
  id: string;
  covers: string[];
  sides: [ExamSide, ExamSide];
  policy: [SidePolicy, SidePolicy];
  /** Per side: answers for that side's shield prompts, in order; missing = false. */
  shields: [boolean[], boolean[]];
  /** Answers for chance buff rolls, in order; missing = false. */
  buffs: boolean[];
  /** PvPoke's battle CP for this script (runPvPokeScript `cp`); omitted = 1500. */
  pvpokeCp?: number;
}

const key = (actor: 0 | 1, turn: number): string => `${actor}:${turn}`;

/** Throws its slot while it can afford it and is under `times`; answers shield prompts in order. */
class PolicyPlayer implements Player {
  private fired = 0;
  private prompts = 0;

  constructor(
    private readonly policy: SidePolicy,
    private readonly answers: readonly boolean[],
    /** Shield answers given, by attacker and turn. */
    private readonly shieldLog: Map<string, boolean>,
    /** Every charged move this player chose, in the order chosen. */
    private readonly chosen: { actor: 0 | 1; turn: number; slot: number }[],
  ) {}

  decide(view: BattleView): Decision {
    const move = view.self.chargedMoves[this.policy.slot];
    if (this.fired < this.policy.times && move !== undefined && view.self.energy >= move.energy) {
      this.fired += 1;
      this.chosen.push({ actor: view.actor, turn: view.turn, slot: this.policy.slot });
      return { kind: 'charged', slot: this.policy.slot };
    }
    return { kind: 'fast' };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  shield(view: BattleView, _incoming: IncomingCharged): boolean {
    const answer = this.answers[this.prompts] ?? false;
    this.prompts += 1;
    const attacker: 0 | 1 = view.actor === 0 ? 1 : 0;
    this.shieldLog.set(key(attacker, view.turn), answer);
    return answer;
  }
}

/** Answers chance buff rolls from `answers` in roll order; CMP ties go to side 0, as scriptedRandom. */
function recordingRandom(answers: readonly boolean[], buffLog: Map<string, boolean>): RandomSource {
  let rolls = 0;
  return {
    buffProcs(ctx) {
      const answer = answers[rolls] ?? false;
      rolls += 1;
      buffLog.set(key(ctx.actor, ctx.turn), answer);
      return answer;
    },
    cmpTieWinner() {
      return 0;
    },
  };
}

function sameTurn(a: TurnRecord, b: TurnRecord): boolean {
  return (
    a.turn === b.turn && a.hash === b.hash && JSON.stringify(a.events) === JSON.stringify(b.events)
  );
}

/**
 * Plays a policy through our engine and returns the charged moves it chose as a script, each with the
 * shield answer its defender gave and the buff answer its roll used. The script, replayed through
 * ScriptedPlayer, must reproduce the policy run turn for turn; that is checked here.
 *
 * The script holds every charged move the policy chose, not only those that resolved: a move chosen
 * on the turn its thrower is knocked out by the other side's charged move never resolves in our
 * engine, but leaving it out would change the rerun (a fast move queued instead). Each runner's
 * `executed` says which entries actually resolved; that is where the engines may disagree.
 */
export function expandScript(data: BattleData, s: PolicyScript): ScriptEntry[] {
  s.policy.forEach((p, side) => {
    const charged = s.sides[side as 0 | 1].chargedMoves;
    if (p.times > 0 && charged[p.slot] === undefined) {
      throw new Error(`expandScript ${s.id}: side ${side} has no charged slot ${p.slot}`);
    }
  });
  const setup = examSetup(s.sides);
  const shieldLog = new Map<string, boolean>();
  const buffLog = new Map<string, boolean>();
  const chosen: { actor: 0 | 1; turn: number; slot: number }[] = [];
  const policyRun = runBattle(
    data,
    setup,
    [
      new PolicyPlayer(s.policy[0], s.shields[0], shieldLog, chosen),
      new PolicyPlayer(s.policy[1], s.shields[1], shieldLog, chosen),
    ],
    recordingRandom(s.buffs, buffLog),
    { trace: true },
  );

  // Players decide side 0 then side 1 each turn, so `chosen` is already in turn, actor order.
  const script = chosen.map((c): ScriptEntry => {
    const entry: ScriptEntry = {
      actor: c.actor,
      turn: c.turn,
      slot: c.slot,
      shielded: shieldLog.get(key(c.actor, c.turn)) ?? false,
    };
    const buff = buffLog.get(key(c.actor, c.turn));
    if (buff !== undefined) {
      entry.buff = buff;
    }
    return entry;
  });

  const rerun = runBattle(
    data,
    setup,
    [new ScriptedPlayer(0, script), new ScriptedPlayer(1, script)],
    scriptedRandom(script),
    { trace: true },
  );
  const turns = Math.max(policyRun.trace.length, rerun.trace.length);
  for (let i = 0; i < turns; i += 1) {
    const a = policyRun.trace[i];
    const b = rerun.trace[i];
    if (a === undefined || b === undefined || !sameTurn(a, b)) {
      const n = a?.turn ?? b?.turn ?? i + 1;
      throw new Error(`expandScript ${s.id}: scripted rerun diverged at turn ${n}`);
    }
  }
  return script;
}
