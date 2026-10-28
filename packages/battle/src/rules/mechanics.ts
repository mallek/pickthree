import type { MoveId } from '../data/types.js';
import type { Effect, EventName, MechanicsRule, When } from '../mechanics/vocabulary.js';
import { active, type BattleState, type CombatantState } from '../state/state.js';
import type { BattleContext } from './battle.js';
import { applyChange, resolveFire } from './charged.js';
import { formStats } from './stats.js';

export interface EventInfo {
  move?: MoveId;
}

const CHARGED_EVENTS: readonly EventName[] = ['beforeChargedMove', 'afterChargedMove', 'hitByChargedMove'];

function rulesFor(state: BattleState, ctx: BattleContext, side: 0 | 1): MechanicsRule[] {
  const species = ctx.data.species[active(state, side).formId];
  if (!species) {
    return [];
  }
  return ctx.data.mechanics[species.family]?.rules ?? [];
}

function matches(when: When, c: CombatantState, event: EventName, info: EventInfo): boolean {
  if (when.event !== event) {
    return false;
  }
  const fraction = c.hp / c.maxHp;
  if (event === 'hpBelow') {
    if (when.fraction === undefined || !(c.hp > 0 && fraction < when.fraction)) {
      return false;
    }
  }
  if (when.moves && CHARGED_EVENTS.includes(event)) {
    if (info.move === undefined || !when.moves.includes(info.move)) {
      return false;
    }
  }
  if (when.form !== undefined) {
    const forms = Array.isArray(when.form) ? when.form : [when.form];
    if (!forms.includes(c.formId)) {
      return false;
    }
  }
  if (when.hpAbove !== undefined && !(fraction > when.hpAbove)) {
    return false;
  }
  if (when.hpAtMost !== undefined && !(fraction <= when.hpAtMost)) {
    return false;
  }
  return true;
}

function switchForm(state: BattleState, ctx: BattleContext, side: 0 | 1, to: string): void {
  const c = active(state, side);
  const formId = to === 'startForm' ? c.startFormId : to;
  const stats = formStats(ctx.data, formId, c.ivs, c.level);
  c.formId = formId;
  c.atk = stats.atk;
  c.def = stats.def;
  ctx.events.push({ turn: state.turn, actor: side, kind: 'form', form: formId });
}

function runEffect(state: BattleState, ctx: BattleContext, side: 0 | 1, effect: Effect): void {
  const other: 0 | 1 = side === 0 ? 1 : 0;
  switch (effect.effect) {
    case 'switchForm':
      switchForm(state, ctx, side, effect.to);
      break;
    case 'replaceMove': {
      const c = active(state, side);
      if (c.fastMove === effect.from) {
        c.fastMove = effect.to;
      }
      c.chargedMoves = c.chargedMoves.map((id) => (id === effect.from ? effect.to : id));
      break;
    }
    case 'statStages': {
      const target = active(state, effect.target === 'self' ? side : other);
      applyChange(ctx, target, { atk: effect.atk ?? 0, def: effect.def ?? 0 });
      break;
    }
    case 'fireMove':
      resolveFire(state, ctx, side, effect.move, effect.ignoresFaint === true);
      break;
    case 'animate':
      state.frozenTurns = Math.max(state.frozenTurns, effect.turns);
      ctx.animated = true;
      ctx.events.push({ turn: state.turn, actor: side, kind: 'animate', turns: effect.turns });
      break;
    case 'blockDamage':
      // handled by blocksDamage before damage is applied
      break;
  }
}

/** Raises `event` on `side`: every rule's condition is read first, then the matching rules run in file order. */
export function fireEvent(
  state: BattleState,
  ctx: BattleContext,
  side: 0 | 1,
  event: EventName,
  info: EventInfo = {},
): void {
  const c = active(state, side);
  const matched = rulesFor(state, ctx, side).filter((rule) => matches(rule.when, c, event, info));
  for (const rule of matched) {
    for (const effect of rule.do) {
      runEffect(state, ctx, side, effect);
    }
  }
}

/** True when a matching hitByChargedMove rule on `defender` carries blockDamage. */
export function blocksDamage(state: BattleState, ctx: BattleContext, defender: 0 | 1, move?: MoveId): boolean {
  const c = active(state, defender);
  const info: EventInfo = move === undefined ? {} : { move };
  return rulesFor(state, ctx, defender).some(
    (rule) =>
      matches(rule.when, c, 'hitByChargedMove', info) && rule.do.some((effect) => effect.effect === 'blockDamage'),
  );
}
