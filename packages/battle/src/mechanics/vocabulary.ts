import type { FormId, MoveId } from '../data/types.js';

export const EVENTS = [
  'battleStart',
  'hpBelow',
  'beforeChargedMove',
  'afterChargedMove',
  'shieldUsed',
  'hitByChargedMove',
] as const;
export const EFFECTS = [
  'switchForm',
  'blockDamage',
  'replaceMove',
  'statStages',
  'fireMove',
  'animate',
] as const;
export type EventName = (typeof EVENTS)[number];
export interface When {
  event: EventName;
  fraction?: number; // hpBelow only: fires when hp / maxHp < fraction and hp > 0
  moves?: MoveId[]; // before/afterChargedMove: absent means any charged move
  form?: FormId | FormId[]; // condition: current form is (one of) these
  hpAbove?: number; // condition: hp / maxHp > value
  hpAtMost?: number; // condition: hp / maxHp <= value
}
export type Effect =
  | { effect: 'switchForm'; to: FormId | 'startForm' }
  | { effect: 'blockDamage' }
  | { effect: 'replaceMove'; from: MoveId; to: MoveId }
  | { effect: 'statStages'; target: 'self' | 'opponent'; atk?: number; def?: number }
  | { effect: 'fireMove'; move: MoveId; ignoresFaint?: boolean }
  | { effect: 'animate'; turns: number };
export interface MechanicsRule {
  when: When;
  do: Effect[];
}
export interface MechanicsEntry {
  family: string;
  source: string;
  entered: string; // YYYY-MM-DD
  resetOnSwitchOut: boolean; // stored for spec 2, unused in 1v1
  rules: MechanicsRule[];
}
