import { describe, expect, it } from 'vitest';
import type { BattleData } from '../src/data/types.js';
import type { MechanicsRule } from '../src/mechanics/vocabulary.js';
import type { IncomingCharged } from '../src/player/types.js';
import { seededRandom } from '../src/random.js';
import { runBattle, type BattleContext } from '../src/rules/battle.js';
import { stepTurn } from '../src/rules/turn.js';
import { active, createBattle, type BattleSetup } from '../src/state/state.js';
import { makeMove, makeSpecies } from './fixtures/synthetic.js';
import { duel, fixedRandom, makeBattleData, mon, player, thrower, type TestPlayer } from './fixtures/battle.js';

const CH_HIT = 40; // tank (atk 50) onto def 50 with CH

/** shape: fa (50/50, hp 100) and fb (150/100, hp 100). plain_fb: same stats as fb, no rules. */
function dataWith(family: string, rules: MechanicsRule[]): BattleData {
  const d = makeBattleData();
  d.species['fa'] = makeSpecies('fa', { family, baseStats: { atk: 100, def: 100, hp: 200 } });
  d.species['fb'] = makeSpecies('fb', { family, baseStats: { atk: 300, def: 200, hp: 200 } });
  d.species['plain_fb'] = makeSpecies('plain_fb', { family: 'plain_fb', baseStats: { atk: 300, def: 200, hp: 200 } });
  d.moves['FIREMV'] = makeMove('FIREMV', { category: 'charged', power: 50, energy: 50, energyGain: 0 });
  d.mechanics[family] = { family, source: 'synthetic', entered: '2026-10-27', resetOnSwitchOut: false, rules };
  return d;
}

function ctxOf(d: BattleData, p0: TestPlayer, p1: TestPlayer): BattleContext {
  return { data: d, players: [p0, p1], random: fixedRandom(0), events: [] };
}

function startedDuel(d: BattleData, setup: BattleSetup, p0: TestPlayer, p1: TestPlayer) {
  const state = createBattle(d, setup);
  const ctx = ctxOf(d, p0, p1);
  return { state, ctx };
}

describe('mechanics in the turn loop', () => {
  it('battleStart switches form and recomputes attack and defense, HP kept', () => {
    const d = dataWith('shape', [{ when: { event: 'battleStart' }, do: [{ effect: 'switchForm', to: 'fb' }] }]);
    const r = runBattle(d, duel(mon('fa', 'F0'), mon('tank', 'F0')), [player(), player()], seededRandom(1), {
      maxTurns: 1,
      trace: true,
    });
    const a = r.final.sides[0].team[0]!;
    expect(a.formId).toBe('fb');
    expect(a.startFormId).toBe('fa');
    expect(a.atk).toBe(150);
    expect(a.def).toBe(100);
    expect(a.hp).toBe(99); // one point from the opponent's zero-power fast move
    expect(a.maxHp).toBe(100);
    expect(r.trace[0]!.events.some((e) => e.kind === 'form' && e.form === 'fb' && e.actor === 0)).toBe(true);
  });

  it('battleStart runs for both sides in order, then use-priority is recomputed from the new forms', () => {
    const d = dataWith('shape', [{ when: { event: 'battleStart' }, do: [{ effect: 'switchForm', to: 'fb' }] }]);
    // fa and tank both have attack 50, so priority starts off
    expect(createBattle(d, duel(mon('fa', 'F0'), mon('tank', 'F0'))).usePriority).toBe(false);
    const r = runBattle(d, duel(mon('fa', 'F0'), mon('tank', 'F0')), [player(), player()], seededRandom(1), {
      maxTurns: 1,
    });
    expect(r.final.usePriority).toBe(true);
  });

  it('hpBelow fires once when guarded by a form condition', () => {
    const d = dataWith('shape', [
      { when: { event: 'hpBelow', fraction: 0.5, form: 'fa' }, do: [{ effect: 'switchForm', to: 'fb' }] },
    ]);
    const r = runBattle(d, duel(mon('fa', 'F0'), mon('tank', 'F1')), [player(), player()], seededRandom(1), {
      maxTurns: 10,
      trace: true,
    });
    const switches = r.trace.flatMap((t) => t.events).filter((e) => e.kind === 'form');
    expect(switches.length).toBe(1);
    expect(r.final.sides[0].team[0]!.formId).toBe('fb');
    expect(r.final.sides[0].team[0]!.hp).toBeGreaterThan(0);
    expect(r.final.sides[0].team[0]!.hp).toBeLessThan(50);
  });

  it('hpBelow does not fire on a hit that leaves the target at 0 HP', () => {
    const d = dataWith('shape', [{ when: { event: 'hpBelow', fraction: 0.5 }, do: [{ effect: 'switchForm', to: 'fb' }] }]);
    const { state, ctx } = startedDuel(d, duel(mon('fa', 'F0'), mon('tank', 'F0', { startEnergy: 50 })), player(), thrower());
    active(state, 0).hp = 30; // the 40 point hit leaves 0
    stepTurn(state, ctx);
    expect(state.outcome).toBe('win1');
    expect(active(state, 0).formId).toBe('fa');
  });

  it('beforeChargedMove switches form before damage, so damage uses the new attack', () => {
    const d = dataWith('shape', [{ when: { event: 'beforeChargedMove', form: 'fa' }, do: [{ effect: 'switchForm', to: 'fb' }] }]);
    const run = (formId: string) => {
      const r = runBattle(
        d,
        duel(mon(formId, 'F0', { startEnergy: 50 }), mon('tank', 'F0')),
        [thrower(), player()],
        seededRandom(1),
        { maxTurns: 1, trace: true },
      );
      return r.trace[0]!.events.find((e) => e.kind === 'charged')!.damage!;
    };
    const switched = run('fa');
    expect(switched).toBe(run('plain_fb'));
    expect(switched).toBeGreaterThan(CH_HIT);
  });

  it('beforeChargedMove moves filter: a rule for another move does not match', () => {
    const d = dataWith('shape', [
      { when: { event: 'afterChargedMove', moves: ['CHBUFF'] }, do: [{ effect: 'switchForm', to: 'fb' }] },
    ]);
    const { state, ctx } = startedDuel(d, duel(mon('fa', 'F0', { startEnergy: 50 }), mon('tank', 'F0')), thrower(), player());
    stepTurn(state, ctx);
    expect(active(state, 0).formId).toBe('fa');
    const again = startedDuel(
      d,
      duel(mon('fa', 'F0', { startEnergy: 50, chargedMoves: ['CHBUFF'] }), mon('tank', 'F0')),
      thrower(),
      player(),
    );
    stepTurn(again.state, again.ctx);
    expect(active(again.state, 0).formId).toBe('fb');
  });

  it('afterChargedMove picks a form by hpAbove / hpAtMost', () => {
    const d = dataWith('shape', [
      { when: { event: 'afterChargedMove', hpAbove: 0.5 }, do: [{ effect: 'switchForm', to: 'fa' }] },
      { when: { event: 'afterChargedMove', hpAtMost: 0.5 }, do: [{ effect: 'switchForm', to: 'fb' }] },
    ]);
    const healthy = startedDuel(d, duel(mon('fb', 'F0', { startEnergy: 50 }), mon('tank', 'F0')), thrower(), player());
    stepTurn(healthy.state, healthy.ctx);
    expect(active(healthy.state, 0).formId).toBe('fa');
    const hurt = startedDuel(d, duel(mon('fa', 'F0', { startEnergy: 50 }), mon('tank', 'F0')), thrower(), player());
    active(hurt.state, 0).hp = 50;
    stepTurn(hurt.state, hurt.ctx);
    expect(active(hurt.state, 0).formId).toBe('fb');
  });

  it('conditions are read before effects: a two-rule toggle flips once per charged move', () => {
    const d = dataWith('shape', [
      { when: { event: 'afterChargedMove', form: 'fa' }, do: [{ effect: 'switchForm', to: 'fb' }] },
      { when: { event: 'afterChargedMove', form: 'fb' }, do: [{ effect: 'switchForm', to: 'fa' }] },
    ]);
    const { state, ctx } = startedDuel(
      d,
      duel(mon('fa', 'F0', { startEnergy: 100 }), mon('giant', 'F0')),
      thrower(),
      player(),
    );
    stepTurn(state, ctx);
    expect(active(state, 0).formId).toBe('fb');
    stepTurn(state, ctx); // the turn after a charged move: no throw
    expect(active(state, 0).formId).toBe('fb');
    stepTurn(state, ctx);
    expect(active(state, 0).formId).toBe('fa');
  });

  it('shieldUsed switches form on the defender', () => {
    const d = dataWith('shape', [{ when: { event: 'shieldUsed', form: 'fa' }, do: [{ effect: 'switchForm', to: 'fb' }] }]);
    const defender = player(undefined, () => true);
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('fa', 'F0'), [0, 1]),
      [thrower(), defender],
      seededRandom(1),
      { maxTurns: 1, trace: true },
    );
    const b = r.final.sides[1].team[0]!;
    expect(b.formId).toBe('fb');
    expect(b.hp).toBe(b.maxHp - 1);
    expect(r.final.sides[1].shields).toBe(0);
    const form = r.trace[0]!.events.find((e) => e.kind === 'form')!;
    expect(form.actor).toBe(1);
  });

  it('hitByChargedMove with blockDamage: 1 damage, form switched, defense -1, flagged in the shield prompt', () => {
    const d = dataWith('shape', [
      {
        when: { event: 'hitByChargedMove', form: 'fa' },
        do: [{ effect: 'blockDamage' }, { effect: 'switchForm', to: 'fb' }, { effect: 'statStages', target: 'self', def: -1 }],
      },
    ]);
    // no shields
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('fa', 'F0')),
      [thrower(), player()],
      seededRandom(1),
      { maxTurns: 1, trace: true },
    );
    const b = r.final.sides[1].team[0]!;
    expect(b.hp).toBe(b.maxHp - 1);
    expect(b.formId).toBe('fb');
    expect(b.defStage).toBe(-1);
    expect(r.trace[0]!.events.find((e) => e.kind === 'charged')!.damage).toBe(1);
    // shield available but declined: the prompt says the mechanic blocks it anyway
    const seen: IncomingCharged[] = [];
    const defender = player(undefined, (_v, incoming) => {
      seen.push(incoming);
      return false;
    });
    const r2 = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('fa', 'F0'), [0, 1]),
      [thrower(), defender],
      seededRandom(1),
      { maxTurns: 1 },
    );
    expect(seen.length).toBe(1);
    expect(seen[0]!.blockedByMechanic).toBe(true);
    expect(r2.final.sides[1].shields).toBe(1);
    expect(r2.final.sides[1].team[0]!.hp).toBe(99);
    expect(r2.final.sides[1].team[0]!.formId).toBe('fb');
  });

  it('blocked flag is false when no rule blocks', () => {
    const d = dataWith('shape', []);
    const seen: IncomingCharged[] = [];
    const defender = player(undefined, (_v, incoming) => {
      seen.push(incoming);
      return false;
    });
    runBattle(d, duel(mon('tank', 'F0', { startEnergy: 50 }), mon('fa', 'F0'), [0, 1]), [thrower(), defender], seededRandom(1), {
      maxTurns: 1,
    });
    expect(seen[0]!.blockedByMechanic).toBe(false);
  });

  it('blockDamage does nothing when the defender shields', () => {
    const d = dataWith('shape', [
      {
        when: { event: 'hitByChargedMove', form: 'fa' },
        do: [{ effect: 'blockDamage' }, { effect: 'switchForm', to: 'fb' }],
      },
    ]);
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('fa', 'F0'), [0, 1]),
      [thrower(), player(undefined, () => true)],
      seededRandom(1),
      { maxTurns: 1 },
    );
    const b = r.final.sides[1].team[0]!;
    expect(r.final.sides[1].shields).toBe(0);
    expect(b.hp).toBe(b.maxHp - 1);
    expect(b.formId).toBe('fa'); // not hit, so the hit trigger never fired
  });

  it('fireMove resolves at once, unshieldable, even after its owner faints when ignoresFaint', () => {
    const rules: MechanicsRule[] = [
      { when: { event: 'hitByChargedMove' }, do: [{ effect: 'fireMove', move: 'FIREMV', ignoresFaint: true }] },
    ];
    const d = dataWith('bomb', rules);
    d.species['bomb'] = makeSpecies('bomb', { family: 'bomb', baseStats: { atk: 100, def: 100, hp: 10 } });
    const r = runBattle(
      d,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('bomb', 'F0'), [1, 0]),
      [thrower(), player()],
      seededRandom(1),
      { maxTurns: 1, trace: true },
    );
    // the bomb has no shield, the tank has one; neither prompt is raised for the fired move
    const a = r.final.sides[0].team[0]!;
    const b = r.final.sides[1].team[0]!;
    expect(b.hp).toBe(0);
    expect(b.energy).toBe(0);
    const fire = r.trace[0]!.events.find((e) => e.kind === 'fire')!;
    expect(fire.actor).toBe(1);
    expect(fire.move).toBe('FIREMV');
    expect(a.maxHp - a.hp).toBe(fire.damage);
    expect(r.final.sides[0].shields).toBe(1);
    // without ignoresFaint a fainted owner does not fire
    const quiet = dataWith('bomb', [{ when: { event: 'hitByChargedMove' }, do: [{ effect: 'fireMove', move: 'FIREMV' }] }]);
    quiet.species['bomb'] = makeSpecies('bomb', { family: 'bomb', baseStats: { atk: 100, def: 100, hp: 10 } });
    const r2 = runBattle(
      quiet,
      duel(mon('tank', 'F0', { startEnergy: 50 }), mon('bomb', 'F0')),
      [thrower(), player()],
      seededRandom(1),
      { maxTurns: 1, trace: true },
    );
    expect(r2.trace[0]!.events.some((e) => e.kind === 'fire')).toBe(false);
  });

  it('fireMove from a living owner costs no energy and does not raise charged triggers', () => {
    const d = dataWith('shape', [
      { when: { event: 'afterChargedMove' }, do: [{ effect: 'fireMove', move: 'FIREMV' }] },
      { when: { event: 'hitByChargedMove' }, do: [{ effect: 'statStages', target: 'self', atk: 1 }] },
    ]);
    const { state, ctx } = startedDuel(
      d,
      duel(mon('fa', 'F0', { startEnergy: 100 }), mon('giant', 'F0'), [0, 0]),
      thrower(),
      player(),
    );
    stepTurn(state, ctx);
    // CH cost 50, the fired move cost nothing; the giant took two hits but hitByChargedMove fired once
    expect(active(state, 0).energy).toBe(50);
    expect(ctx.events.filter((e) => e.kind === 'fire').length).toBe(1);
    expect(active(state, 1).atkStage).toBe(0);
    expect(active(state, 1).maxHp - active(state, 1).hp).toBeGreaterThan(CH_HIT);
  });

  it('replaceMove swaps a fast move and a charged move, and is a no-op when absent', () => {
    const d = dataWith('shape', [
      {
        when: { event: 'battleStart' },
        do: [
          { effect: 'replaceMove', from: 'F1', to: 'F2' },
          { effect: 'replaceMove', from: 'CH', to: 'CHBUFF' },
          { effect: 'replaceMove', from: 'NOT_THERE', to: 'F0' },
        ],
      },
    ]);
    const r = runBattle(d, duel(mon('fa', 'F1'), mon('tank', 'F1')), [player(), player()], seededRandom(1), {
      maxTurns: 1,
    });
    const a = r.final.sides[0].team[0]!;
    expect(a.fastMove).toBe('F2');
    expect(a.chargedMoves).toEqual(['CHBUFF']);
    expect(r.final.sides[1].team[0]!.fastMove).toBe('F1');
  });

  it('statStages hits self or opponent and clamps', () => {
    const d = dataWith('shape', [
      {
        when: { event: 'battleStart' },
        do: [
          { effect: 'statStages', target: 'self', atk: 9 },
          { effect: 'statStages', target: 'opponent', def: -9, atk: -1 },
        ],
      },
    ]);
    const r = runBattle(d, duel(mon('fa', 'F0'), mon('tank', 'F0')), [player(), player()], seededRandom(1), {
      maxTurns: 1,
    });
    expect(r.final.sides[0].team[0]!.atkStage).toBe(4);
    expect(r.final.sides[1].team[0]!.defStage).toBe(-4);
    expect(r.final.sides[1].team[0]!.atkStage).toBe(-1);
  });

  it('switchForm to startForm returns to the form the battle began in', () => {
    const d = dataWith('shape', [
      { when: { event: 'battleStart' }, do: [{ effect: 'switchForm', to: 'fb' }] },
      { when: { event: 'afterChargedMove', form: 'fb' }, do: [{ effect: 'switchForm', to: 'startForm' }] },
    ]);
    const { state, ctx } = startedDuel(d, duel(mon('fa', 'F0', { startEnergy: 50 }), mon('giant', 'F0')), thrower(), player());
    // run battleStart through the real entry point
    const r = runBattle(d, duel(mon('fa', 'F0', { startEnergy: 50 }), mon('giant', 'F0')), [thrower(), player()], seededRandom(1), {
      maxTurns: 1,
    });
    expect(r.final.sides[0].team[0]!.formId).toBe('fa');
    expect(r.final.sides[0].team[0]!.atk).toBe(50);
    expect(state.turn).toBe(1);
    expect(ctx.events.length).toBe(0);
  });

  it('animate freezes N turns: turn counter advances, HP and energy do not move', () => {
    const d = dataWith('shape', [{ when: { event: 'afterChargedMove' }, do: [{ effect: 'animate', turns: 3 }] }]);
    const { state, ctx } = startedDuel(
      d,
      duel(mon('fa', 'F1', { startEnergy: 50 }), mon('giant', 'F1')),
      thrower(),
      player(),
    );
    stepTurn(state, ctx);
    expect(state.frozenTurns).toBe(3);
    expect(ctx.events.some((e) => e.kind === 'animate')).toBe(true);
    expect(active(state, 0).cooldown).toBe(1);
    expect(active(state, 1).cooldown).toBe(1);
    const hp = [active(state, 0).hp, active(state, 1).hp];
    const energy = [active(state, 0).energy, active(state, 1).energy];
    const turn = state.turn;
    for (let i = 1; i <= 3; i += 1) {
      stepTurn(state, ctx);
      expect(state.turn).toBe(turn + i);
      expect([active(state, 0).hp, active(state, 1).hp]).toEqual(hp);
      expect([active(state, 0).energy, active(state, 1).energy]).toEqual(energy);
    }
    expect(state.frozenTurns).toBe(0);
  });

  it('animate raised outside a charged move still resets both cooldowns', () => {
    const d = dataWith('shape', [{ when: { event: 'hpBelow', fraction: 0.95 }, do: [{ effect: 'animate', turns: 2 }] }]);
    const { state, ctx } = startedDuel(d, duel(mon('fa', 'F2'), mon('tank', 'F1')), player(), player());
    stepTurn(state, ctx);
    expect(state.frozenTurns).toBe(2);
    expect(active(state, 0).cooldown).toBe(1);
    expect(active(state, 1).cooldown).toBe(1);
  });
});
