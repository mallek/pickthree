import { describe, expect, it } from 'vitest';
import {
  damageOf,
  formStats,
  runBattle,
  seededRandom,
  type BattleData,
  type BattleEvent,
  type BattleResult,
  type BattleView,
  type FormId,
  type MoveData,
  type MoveId,
  type Player,
  type SideSetup,
  type TurnRecord,
} from '@pickthree/battle';
import { liveBattleData } from './live-data.js';

// Every entry in packages/data/battle/mechanics.yaml, run in a real battle on our own extracted data.
// Invariants only: no PvPoke values, no pinned damage numbers.

const IVS = { atk: 15, def: 15, hp: 15 };
const OPPONENT = 'azumarill';
// Above our side's level 20, so the opponent lives long enough to reach every trigger.
const OPP_LEVEL = 50;
// Cramorant needs the HP to take a charged hit, Dive, and live to be hit again.
const CRAMORANT_LEVEL = 40;
const never = (): boolean => false;

function live(): BattleData {
  const d = liveBattleData();
  if (d === null) {
    throw new Error('live battle data unavailable');
  }
  return d;
}

interface PolicyOptions {
  slot?: number;
  when?: (v: BattleView) => boolean;
  shields?: boolean[];
}

/** Fires `slot` whenever affordable and `when` holds, else fast; answers shield prompts from `shields` in order. */
function policy(opts: PolicyOptions = {}): Player {
  const slot = opts.slot ?? 0;
  const when = opts.when ?? (() => true);
  const answers = [...(opts.shields ?? [])];
  return {
    decide(v) {
      const move = v.self.chargedMoves[slot];
      if (move !== undefined && v.self.energy >= move.energy && when(v)) {
        return { kind: 'charged', slot };
      }
      return { kind: 'fast' };
    },
    shield() {
      return answers.shift() ?? false;
    },
  };
}

function side(
  formId: FormId,
  fastMove: MoveId,
  chargedMove: MoveId,
  shields: number,
  level = 20,
): SideSetup {
  return { team: [{ formId, level, ivs: IVS, fastMove, chargedMoves: [chargedMove] }], shields };
}

/** That species' first fast move and first charged move without buffs, no shields. */
function plainOpponent(data: BattleData, formId: FormId, level: number): SideSetup {
  const species = data.species[formId];
  if (!species) {
    throw new Error(`unknown form ${formId}`);
  }
  const fast = species.fast[0];
  const charged = species.charged.find((id) => {
    const m = data.moves[id];
    return m !== undefined && m.buffs === undefined;
  });
  if (fast === undefined || charged === undefined) {
    throw new Error(`no unbuffed charged move for ${formId}`);
  }
  return side(formId, fast, charged, 0, level);
}

function battle(s0: SideSetup, s1: SideSetup, p0: Player, p1: Player, seed = 1): BattleResult {
  return runBattle(live(), { sides: [s0, s1] }, [p0, p1], seededRandom(seed), { trace: true });
}

/** The first turn (1-based, trace[turn - 1]) with a matching event. */
function turnOf(
  trace: TurnRecord[],
  pred: (e: BattleEvent) => boolean,
  label: string,
  after = 0,
): number {
  const rec = trace.find((r) => r.turn > after && r.events.some(pred));
  if (!rec) {
    throw new Error(`scenario never reached: ${label}`);
  }
  return rec.turn;
}

function recordAt(trace: TurnRecord[], turn: number): TurnRecord {
  const rec = trace[turn - 1];
  if (!rec || rec.turn !== turn) {
    throw new Error(`no record for turn ${turn}`);
  }
  return rec;
}

function eventAt(
  trace: TurnRecord[],
  turn: number,
  pred: (e: BattleEvent) => boolean,
): BattleEvent {
  const e = recordAt(trace, turn).events.find(pred);
  if (!e) {
    throw new Error(`no matching event at turn ${turn}`);
  }
  return e;
}

/** The animation length an entry states. Every animate effect in one entry states the same N. */
function statedTurns(data: BattleData, family: string): number {
  const entry = data.mechanics[family];
  if (!entry) {
    throw new Error(`no mechanics entry for ${family}`);
  }
  const turns = entry.rules
    .flatMap((r) => r.do)
    .flatMap((e) => (e.effect === 'animate' ? [e.turns] : []));
  const first = turns[0];
  if (first === undefined || turns.some((t) => t !== first)) {
    throw new Error(`${family}: expected one stated animate length, got [${turns.join(', ')}]`);
  }
  return first;
}

/**
 * Every animate event at turn t states N: records t+1 .. t+N hold hp and energy and carry no events.
 * An animation on the turn that ends the battle has nothing to freeze; at least one other must exist.
 */
function assertFrozen(trace: TurnRecord[], stated: number): void {
  let seen = 0;
  const last = trace[trace.length - 1];
  for (const rec of trace) {
    for (const e of rec.events) {
      if (e.kind !== 'animate') {
        continue;
      }
      expect(e.turns).toBe(stated);
      if (rec === last) {
        continue;
      }
      seen += 1;
      for (let k = 1; k <= stated; k += 1) {
        const frozen = recordAt(trace, rec.turn + k);
        expect(frozen.hp).toEqual(rec.hp);
        expect(frozen.energy).toEqual(rec.energy);
        expect(frozen.events).toEqual([]);
      }
    }
  }
  if (seen === 0) {
    throw new Error('scenario never reached: an animate event');
  }
}

function memo<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => {
    if (value === undefined) {
      value = make();
    }
    return value;
  };
}

const isCharged = (actor: 0 | 1) => (e: BattleEvent) => e.kind === 'charged' && e.actor === actor;
const isFast = (actor: 0 | 1) => (e: BattleEvent) => e.kind === 'fast' && e.actor === actor;
const isForm = (actor: 0 | 1, form?: FormId) => (e: BattleEvent) =>
  e.kind === 'form' && e.actor === actor && (form === undefined || e.form === form);
const isFire = (actor: 0 | 1, move: MoveId) => (e: BattleEvent) =>
  e.kind === 'fire' && e.actor === actor && e.move === move;

function allEvents(trace: TurnRecord[], pred: (e: BattleEvent) => boolean): BattleEvent[] {
  return trace.flatMap((r) => r.events.filter(pred));
}

// ---------------------------------------------------------------- families

function mimikyu(): void {
  const data = memo(live);
  // Mimikyu holds its charged move so the battle lasts long enough for a second opponent hit
  const open = memo(() =>
    battle(
      side('mimikyu_disguised', 'SHADOW_CLAW_FAST', 'PLAY_ROUGH', 0),
      plainOpponent(data(), OPPONENT, OPP_LEVEL),
      policy({ when: never }),
      policy(),
    ),
  );
  const shielded = memo(() =>
    battle(
      side('mimikyu_disguised', 'SHADOW_CLAW_FAST', 'PLAY_ROUGH', 1),
      plainOpponent(data(), OPPONENT, OPP_LEVEL),
      policy({ when: never, shields: [true] }),
      policy(),
    ),
  );

  it('the first unshielded charged hit deals 1 damage, busts the disguise, Defense -1', () => {
    const r = open();
    const t = turnOf(r.trace, isCharged(1), 'opponent charged hit on disguised Mimikyu');
    const before = recordAt(r.trace, t - 1);
    expect(before.forms[0]).toBe('mimikyu_disguised');
    const hit = eventAt(r.trace, t, isCharged(1));
    expect(hit.damage).toBe(1);
    const rec = recordAt(r.trace, t);
    expect(rec.forms[0]).toBe('mimikyu_busted');
    expect(rec.stages[0].def).toBe(before.stages[0].def - 1);
    expect(rec.events.some(isForm(0, 'mimikyu_busted'))).toBe(true);
  });

  it('busted, the next charged hit is not blocked and it never re-disguises', () => {
    const r = open();
    const first = turnOf(r.trace, isCharged(1), 'first opponent charged hit');
    const second = turnOf(r.trace, isCharged(1), 'second opponent charged hit', first);
    expect(eventAt(r.trace, second, isCharged(1)).damage).toBeGreaterThan(1);
    expect(allEvents(r.trace, isForm(0)).length).toBe(1);
    for (const rec of r.trace.slice(first - 1)) {
      expect(rec.forms[0]).toBe('mimikyu_busted');
    }
  });

  it('a shielded hit leaves the disguise up', () => {
    const r = shielded();
    const t = turnOf(
      r.trace,
      (e) => e.kind === 'shield' && e.actor === 0,
      'Mimikyu shields a charged move',
    );
    const rec = recordAt(r.trace, t);
    expect(rec.forms[0]).toBe('mimikyu_disguised');
    expect(rec.stages[0].def).toBe(0);
    expect(rec.shields[0]).toBe(0);
    expect(rec.events.some(isForm(0))).toBe(false);
    // shields gone, the next hit busts it for 1
    const next = turnOf(r.trace, isCharged(1), 'the unshielded hit after the shield', t);
    expect(eventAt(r.trace, next, isCharged(1)).damage).toBe(1);
    expect(recordAt(r.trace, next).forms[0]).toBe('mimikyu_busted');
  });

  it('the bust animation freezes the stated turns', () => {
    assertFrozen(open().trace, statedTurns(data(), 'mimikyu'));
  });
}

function aegislash(): void {
  const data = memo(live);
  const open = memo(() =>
    battle(
      side('aegislash_shield', 'PSYCHO_CUT_FAST', 'GYRO_BALL', 0),
      plainOpponent(data(), OPPONENT, OPP_LEVEL),
      policy(),
      policy(),
    ),
  );
  // the opponent fires only once Aegislash is in Blade form, so the shield lands on Blade
  const guarded = memo(() =>
    battle(
      side('aegislash_shield', 'PSYCHO_CUT_FAST', 'GYRO_BALL', 1),
      plainOpponent(data(), OPPONENT, OPP_LEVEL),
      policy({ shields: [true] }),
      policy({ when: (v) => v.opponent.formId === 'aegislash_blade' }),
    ),
  );

  it('starts in Shield form with the charge fast moves', () => {
    const r = open();
    expect(r.trace[0]!.forms[0]).toBe('aegislash_shield');
    const t = turnOf(r.trace, isFast(0), 'Aegislash fast move');
    expect(eventAt(r.trace, t, isFast(0)).move).toBe('AEGISLASH_CHARGE_PSYCHO_CUT');
  });

  it('flips to Blade on its charged move, before damage', () => {
    const d = data();
    const r = open();
    const t = turnOf(r.trace, isCharged(0), 'Aegislash charged move');
    const events = recordAt(r.trace, t).events;
    const formAt = events.findIndex(isForm(0, 'aegislash_blade'));
    const hitAt = events.findIndex(isCharged(0));
    expect(formAt).toBeGreaterThanOrEqual(0);
    expect(formAt).toBeLessThan(hitAt);
    expect(recordAt(r.trace, t - 1).forms[0]).toBe('aegislash_shield');
    // the hit used Blade's attack: equal to the Blade-form damage, and more than Shield form would deal
    const before = recordAt(r.trace, t - 1);
    const move = d.moves['GYRO_BALL'] as MoveData;
    const opp = formStats(d, OPPONENT, IVS, OPP_LEVEL);
    const dmg = (formId: FormId) =>
      damageOf(d, {
        move,
        attackerTypes: d.species[formId]!.types,
        defenderTypes: d.species[OPPONENT]!.types,
        atk: formStats(d, formId, IVS, 20).atk,
        def: opp.def,
        atkStage: before.stages[0].atk,
        defStage: before.stages[1].def,
        attackerShadow: false,
        defenderShadow: false,
        defenderMaxHp: before.maxHp[1],
      });
    expect(events[hitAt]!.damage).toBe(dmg('aegislash_blade'));
    expect(dmg('aegislash_blade')).toBeGreaterThan(dmg('aegislash_shield'));
    // later fast moves are Blade's own
    const later = turnOf(r.trace, isFast(0), 'Aegislash fast move after Blade', t);
    expect(eventAt(r.trace, later, isFast(0)).move).toBe('PSYCHO_CUT_FAST');
  });

  it('goes back to Shield when it shields', () => {
    const r = guarded();
    const t = turnOf(
      r.trace,
      (e) => e.kind === 'shield' && e.actor === 0,
      'Aegislash shields in Blade form',
    );
    expect(recordAt(r.trace, t - 1).forms[0]).toBe('aegislash_blade');
    const events = recordAt(r.trace, t).events;
    const shieldAt = events.findIndex((e) => e.kind === 'shield' && e.actor === 0);
    const formAt = events.findIndex(isForm(0, 'aegislash_shield'));
    expect(formAt).toBeGreaterThan(shieldAt);
    expect(recordAt(r.trace, t).forms[0]).toBe('aegislash_shield');
    const later = turnOf(r.trace, isFast(0), 'Aegislash fast move after shielding', t);
    expect(eventAt(r.trace, later, isFast(0)).move).toBe('AEGISLASH_CHARGE_PSYCHO_CUT');
  });

  it('each form change freezes the stated turns', () => {
    const stated = statedTurns(data(), 'aegislash');
    assertFrozen(open().trace, stated);
    assertFrozen(guarded().trace, stated);
  });
}

/** After Cramorant's first charged event: the turn it fired, and the next opponent charged hit. */
function gulpTurns(r: BattleResult): { dive: number; hit: number } {
  const dive = turnOf(r.trace, isCharged(0), 'Cramorant fires Dive');
  const hit = turnOf(r.trace, isCharged(1), 'opponent charged hit after Dive', dive);
  return { dive, hit };
}

function cramorant(): void {
  const data = memo(live);
  const run = (when: (v: BattleView) => boolean, oppLevel = OPP_LEVEL) =>
    battle(
      side('cramorant', 'WATER_GUN_FAST', 'DIVE', 0, CRAMORANT_LEVEL),
      plainOpponent(data(), OPPONENT, oppLevel),
      policy({ when }),
      policy(),
    );
  const healthy = memo(() => run(() => true));
  const hurt = (v: BattleView) => v.self.hp / v.self.maxHp <= 0.5;
  const low = memo(() => run(hurt));

  it('Dive above half HP makes it gulping; the next charged hit fires Gulp Missile and returns it to base', () => {
    const r = healthy();
    const { dive, hit } = gulpTurns(r);
    const before = recordAt(r.trace, dive - 1);
    expect(before.hp[0] / before.maxHp[0]).toBeGreaterThan(0.5);
    expect(recordAt(r.trace, dive).forms[0]).toBe('cramorant_gulping');
    for (let t = dive; t < hit; t += 1) {
      expect(recordAt(r.trace, t).forms[0]).toBe('cramorant_gulping');
    }
    const fire = eventAt(r.trace, hit, isFire(0, 'GULP_MISSILE_GULPING'));
    expect(fire.damage).toBeGreaterThan(0);
    expect(recordAt(r.trace, hit).forms[0]).toBe('cramorant');
    expect(allEvents(r.trace, isFire(0, 'GULP_MISSILE_GORGING'))).toEqual([]);
  });

  it('Dive at or below half HP makes it gorging and fires the gorging missile', () => {
    const r = low();
    const { dive, hit } = gulpTurns(r);
    const before = recordAt(r.trace, dive - 1);
    expect(before.hp[0] / before.maxHp[0]).toBeLessThanOrEqual(0.5);
    expect(recordAt(r.trace, dive).forms[0]).toBe('cramorant_gorging');
    const fire = eventAt(r.trace, hit, isFire(0, 'GULP_MISSILE_GORGING'));
    expect(fire.damage).toBeGreaterThan(0);
    expect(recordAt(r.trace, hit).forms[0]).toBe('cramorant');
    expect(allEvents(r.trace, isFire(0, 'GULP_MISSILE_GULPING'))).toEqual([]);
  });

  it('Gulp Missile still fires when the hit knocks Cramorant out', () => {
    const lethal: { level: number; r: BattleResult; hit: number }[] = [];
    for (let level = 20; level <= 50; level += 5) {
      const r = run(hurt, level);
      const dive = r.trace.find((rec) => rec.events.some(isCharged(0)));
      if (!dive || dive.forms[0] !== 'cramorant_gorging') {
        continue;
      }
      const hit = r.trace.find((rec) => rec.turn > dive.turn && rec.events.some(isCharged(1)));
      if (hit && hit.hp[0] === 0) {
        lethal.push({ level, r, hit: hit.turn });
      }
    }
    if (lethal.length === 0) {
      throw new Error('scenario never reached: a lethal hit on gorging Cramorant');
    }
    for (const { r, hit } of lethal) {
      expect(hit).toBe(r.trace.length);
      const rec = recordAt(r.trace, hit);
      const fire = eventAt(r.trace, hit, isFire(0, 'GULP_MISSILE_GORGING'));
      expect(fire.damage).toBeGreaterThan(0);
      // the missile is the only damage the opponent takes on that turn: a fainted Cramorant's fast move never lands
      const prior = recordAt(r.trace, hit - 1).hp[1];
      expect(rec.hp[1]).toBe(Math.max(0, prior - fire.damage!));
      expect(rec.hp[1]).toBeLessThan(prior);
    }
  });
}

function morpeko(): void {
  const data = memo(live);
  const open = memo(() =>
    battle(
      side('morpeko_full_belly', 'THUNDER_SHOCK_FAST', 'AURA_WHEEL_ELECTRIC', 0),
      plainOpponent(data(), OPPONENT, OPP_LEVEL),
      policy(),
      policy(),
    ),
  );

  it('toggles form and Aura Wheel on every charged move', () => {
    const r = open();
    const turns = r.trace.filter((rec) => rec.events.some(isCharged(0)));
    if (turns.length < 2) {
      throw new Error('scenario never reached: two Morpeko charged moves');
    }
    turns.forEach((rec, i) => {
      const even = i % 2 === 0;
      expect(eventAt(r.trace, rec.turn, isCharged(0)).move).toBe(
        even ? 'AURA_WHEEL_ELECTRIC' : 'AURA_WHEEL_DARK',
      );
      expect(rec.forms[0]).toBe(even ? 'morpeko_hangry' : 'morpeko_full_belly');
      expect(rec.events.some(isForm(0))).toBe(true);
    });
  });

  it('each toggle freezes the stated turns', () => {
    assertFrozen(open().trace, statedTurns(data(), 'morpeko'));
  });
}

function minior(): void {
  const data = memo(live);
  const open = memo(() =>
    battle(
      side('minior_red', 'ROLLOUT_FAST', 'POWER_GEM', 0),
      plainOpponent(data(), OPPONENT, OPP_LEVEL),
      policy({ when: never }),
      policy(),
    ),
  );

  it('registered as a color form, it starts in Meteor form', () => {
    const r = open();
    expect(r.trace[0]!.forms[0]).toBe('minior');
    expect(allEvents(r.trace, isForm(0))[0]!.form).toBe('minior');
  });

  it('turns Core (its own color) once below half HP, and only once', () => {
    const r = open();
    const i = r.trace.findIndex((rec) => rec.hp[0] / rec.maxHp[0] < 0.5);
    if (i < 0) {
      throw new Error('scenario never reached: Minior below half HP');
    }
    const rec = r.trace[i]!;
    expect(rec.hp[0]).toBeGreaterThan(0);
    expect(rec.forms[0]).toBe('minior_red');
    expect(rec.events.some(isForm(0, 'minior_red'))).toBe(true);
    for (const earlier of r.trace.slice(0, i)) {
      expect(earlier.forms[0]).toBe('minior');
    }
    for (const later of r.trace.slice(i)) {
      expect(later.forms[0]).toBe('minior_red');
    }
    // one switch to Meteor at battle start, then exactly one to Core
    expect(allEvents(r.trace, isForm(0)).map((e) => e.form)).toEqual(['minior', 'minior_red']);
  });

  it('the Core animation freezes the stated turns', () => {
    assertFrozen(open().trace, statedTurns(data(), 'minior'));
  });

  // Registered as plain Meteor there is no Core color to turn into: it stays Meteor and never
  // freezes the battle again and again below half HP.
  const meteor = memo(() =>
    battle(
      // level 40 so it lives for several hits below half HP
      side('minior', 'ROLLOUT_FAST', 'POWER_GEM', 0, 40),
      plainOpponent(data(), OPPONENT, OPP_LEVEL),
      policy({ when: never }),
      policy(),
    ),
  );

  it('registered as Meteor, it stays Meteor below half HP and animates at most once', () => {
    const r = meteor();
    const below = r.trace.filter((rec) => rec.hp[0] > 0 && rec.hp[0] / rec.maxHp[0] < 0.5);
    if (below.length < 2) {
      throw new Error('scenario never reached: Minior below half HP for more than one turn');
    }
    expect(
      allEvents(r.trace, (e) => e.kind === 'animate' && e.actor === 0).length,
    ).toBeLessThanOrEqual(1);
    expect(allEvents(r.trace, isForm(0))).toEqual([]);
    for (const rec of r.trace) {
      expect(rec.forms[0]).toBe('minior');
    }
  });
}

const SCENARIOS: Record<string, () => void> = { mimikyu, aegislash, cramorant, morpeko, minior };

describe.skipIf(liveBattleData() === null)('shipped mechanics run in battle on our data', () => {
  it('every family in mechanics.yaml has a scenario here', () => {
    expect(Object.keys(live().mechanics).sort()).toEqual(Object.keys(SCENARIOS).sort());
  });
  for (const [family, register] of Object.entries(SCENARIOS)) {
    describe(family, register);
  }
});
