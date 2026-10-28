import type { BattleState, CombatantState, QueuedAction, SideState } from './state.js';

function copyCombatant(c: CombatantState): CombatantState {
  return {
    startFormId: c.startFormId,
    formId: c.formId,
    level: c.level,
    ivs: { atk: c.ivs.atk, def: c.ivs.def, hp: c.ivs.hp },
    shadow: c.shadow,
    atk: c.atk,
    def: c.def,
    maxHp: c.maxHp,
    hp: c.hp,
    energy: c.energy,
    atkStage: c.atkStage,
    defStage: c.defStage,
    fastMove: c.fastMove,
    chargedMoves: c.chargedMoves.slice(),
    cooldown: c.cooldown,
    faintSource: c.faintSource,
  };
}

function copySide(s: SideState): SideState {
  return {
    shields: s.shields,
    active: s.active,
    team: s.team.map(copyCombatant),
    switchTimer: s.switchTimer,
  };
}

function copyAction(a: QueuedAction): QueuedAction {
  return { actor: a.actor, kind: a.kind, turn: a.turn, slot: a.slot };
}

export function snapshot(s: BattleState): BattleState {
  return {
    turn: s.turn,
    sides: [copySide(s.sides[0]), copySide(s.sides[1])],
    queue: s.queue.map(copyAction),
    chargedLastTurn: s.chargedLastTurn,
    frozenTurns: s.frozenTurns,
    usePriority: s.usePriority,
    outcome: s.outcome,
  };
}

/** Copies `from` into `into` in place. `into` shares no objects with `from` afterwards. */
export function restore(into: BattleState, from: BattleState): void {
  const c = snapshot(from);
  into.turn = c.turn;
  into.sides = c.sides;
  into.queue = c.queue;
  into.chargedLastTurn = c.chargedLastTurn;
  into.frozenTurns = c.frozenTurns;
  into.usePriority = c.usePriority;
  into.outcome = c.outcome;
}

const f64 = new Float64Array(1);
const bytes = new Uint8Array(f64.buffer);

// Two independent 32-bit FNV-1a lanes: same offset-basis style seeds, different primes.
class Hasher {
  a = 0x811c9dc5;
  b = (0x01000193 ^ 0x9e3779b9) >>> 0;

  byte(v: number): void {
    this.a = Math.imul(this.a ^ v, 0x01000193) >>> 0;
    this.b = Math.imul(this.b ^ v, 0x85ebca6b) >>> 0;
  }
  num(n: number): void {
    f64[0] = n;
    for (let i = 0; i < 8; i += 1) {
      this.byte(bytes[i] as number);
    }
  }
  bool(v: boolean): void {
    this.byte(v ? 1 : 0);
  }
  str(v: string): void {
    this.num(v.length);
    for (let i = 0; i < v.length; i += 1) {
      const u = v.charCodeAt(i);
      this.byte(u & 0xff);
      this.byte(u >>> 8);
    }
  }
  nullableStr(v: string | null): void {
    if (v === null) {
      this.byte(0);
    } else {
      this.byte(1);
      this.str(v);
    }
  }
  hex(): string {
    return this.a.toString(16).padStart(8, '0') + this.b.toString(16).padStart(8, '0');
  }
}

export function hashState(s: BattleState): string {
  const h = new Hasher();
  h.num(s.turn);
  for (const side of s.sides) {
    h.num(side.shields);
    h.num(side.active);
    h.num(side.team.length);
    for (const c of side.team) {
      h.str(c.startFormId);
      h.str(c.formId);
      h.num(c.level);
      h.num(c.ivs.atk);
      h.num(c.ivs.def);
      h.num(c.ivs.hp);
      h.bool(c.shadow);
      h.num(c.atk);
      h.num(c.def);
      h.num(c.maxHp);
      h.num(c.hp);
      h.num(c.energy);
      h.num(c.atkStage);
      h.num(c.defStage);
      h.str(c.fastMove);
      h.num(c.chargedMoves.length);
      for (const m of c.chargedMoves) {
        h.str(m);
      }
      h.num(c.cooldown);
      h.nullableStr(c.faintSource);
    }
    h.num(side.switchTimer);
  }
  h.num(s.queue.length);
  for (const q of s.queue) {
    h.num(q.actor);
    h.str(q.kind);
    h.num(q.turn);
    h.num(q.slot);
  }
  h.bool(s.chargedLastTurn);
  h.num(s.frozenTurns);
  h.bool(s.usePriority);
  h.nullableStr(s.outcome);
  return h.hex();
}
