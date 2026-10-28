import type { ScriptEntry } from '@pickthree/battle';
import type { PvPokeContext } from '@pickthree/sim-pvpoke';
import type { PvPokeCombatant, PvPokeSandboxBattle } from './pvpoke-types.js';
import type { ExamRun, ExamSide, ExamTurn } from './run-ours.js';

export type { ExamRun, ExamSide, ExamTurn } from './run-ours.js';

// Plays a script through the vendored PvPoke simulator in sandbox mode (Battle.js setSandboxMode,
// setActions). Verified against Battle.js (vendored copy, pinned commit):
// - simulate() sets mode "simulate" then start(), which sets turns = 1 (Battle.js:269). Each step()
//   plays turn `turns` and ends with turns++ (:519), so after a step getTurns() - 1 is the turn just
//   played: 1 for the first. Our TurnRecord.turn counts the same way (state.turn starts at 1).
// - A turn is one 500 ms deltaTime tick (:38, :307); fast move cooldowns are ms, so a 2-turn fast
//   move is 1000 ms. A charged turn adds 10000 ms to PvPoke's display clock but is still one step.
// - Sandbox takes a charged action only when the actor is free (cooldown 0) on exactly a.turn and
//   can afford it (:752-:761); otherwise it taps a fast move, as our engine does.
// - Sandbox does NOT skip battle_start form changes: start() checks mode == "simulate" (:245), not
//   sandbox, and simulate() always sets that mode first. Minior starts in Meteor form; no patch.
// - step() reads `this`, so the wrapper must call it with the battle as receiver.

interface TimelineActionCtor {
  new (
    type: 'charged',
    actor: 0 | 1,
    turn: number,
    value: number,
    settings: { shielded: boolean; buffs: boolean; priority: number },
  ): { processed: boolean };
}

const actionCtors = new WeakMap<PvPokeContext, TimelineActionCtor>();

function timelineAction(ctx: PvPokeContext): TimelineActionCtor {
  let ctor = actionCtors.get(ctx);
  if (ctor === undefined) {
    ctor = ctx.evaluate<TimelineActionCtor>('TimelineAction');
    actionCtors.set(ctx, ctor);
  }
  return ctor;
}

function buildPokemon(
  ctx: PvPokeContext,
  side: ExamSide,
  index: 0 | 1,
  battle: PvPokeSandboxBattle,
): PvPokeCombatant {
  if (!ctx.runtime.gm.getPokemonById(side.speciesId)) {
    throw new Error(`runPvPokeScript: unknown speciesId ${side.speciesId}`);
  }
  // PvPokeSimulator.buildPokemon: IVs, then setLevel(level, true), then moves
  const p = new ctx.runtime.Pokemon(side.speciesId, index, battle) as PvPokeCombatant;
  p.setIV('atk', side.ivs.atk);
  p.setIV('def', side.ivs.def);
  p.setIV('hp', side.ivs.hp);
  p.setLevel(side.level, true);
  p.selectMove('fast', side.fastMove);
  side.chargedMoves.forEach((id, i) => {
    p.selectMove('charged', id, i);
  });
  if (side.chargedMoves.length === 1) {
    p.selectMove('charged', 'none', 1);
  }
  if (side.shadow === true) {
    p.setShadowType('shadow');
  }
  return p;
}

export function runPvPokeScript(
  ctx: PvPokeContext,
  sides: [ExamSide, ExamSide],
  script: readonly ScriptEntry[],
): ExamRun {
  const battle = new ctx.runtime.Battle() as PvPokeSandboxBattle;
  battle.setCP(1500);
  battle.setLevelCap(51);
  const pokes: [PvPokeCombatant, PvPokeCombatant] = [
    buildPokemon(ctx, sides[0], 0, battle),
    buildPokemon(ctx, sides[1], 1, battle),
  ];
  pokes.forEach((p, i) => {
    battle.setNewPokemon(p, i as 0 | 1, false);
  });
  pokes.forEach((p, i) => {
    p.reset();
    p.setShields(sides[i as 0 | 1].shields);
  });

  const TimelineAction = timelineAction(ctx);
  const actions = script.map(
    (e) =>
      new TimelineAction('charged', e.actor, e.turn, e.slot, {
        shielded: e.shielded,
        buffs: e.buff ?? false,
        priority: 0,
      }),
  );
  battle.setSandboxMode(true);
  battle.setActions(actions);

  const trace: ExamTurn[] = [];
  const inner = battle.step;
  battle.step = (): void => {
    inner.call(battle);
    const [a, b] = pokes;
    trace.push({
      turn: battle.getTurns() - 1,
      hp: [a.hp, b.hp],
      energy: [a.energy, b.energy],
      forms: [a.activeFormId, b.activeFormId],
    });
  };
  battle.simulate();

  const executed = script.filter((_, i) => actions[i]?.processed === true);
  return { trace, executed, notes: [] };
}
