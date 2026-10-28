import type { MoveBuffs, MoveData, MoveId, StageChange } from '../data/types.js';
import { bad, ofKind, optNum, reqRec, typeName, type Tpl } from './templates.js';

export interface MovePool {
  moves: Record<MoveId, MoveData>;
  byNumber: Map<number, MoveId>;
}

function stage(a: number | undefined, d: number | undefined): StageChange | undefined {
  const atk = a ?? 0;
  const def = d ?? 0;
  if (atk === 0 && def === 0) {
    return undefined;
  }
  return { atk, def };
}

export function extractMoves(tpls: Tpl[], types: string[]): MovePool {
  const moves: Record<MoveId, MoveData> = {};
  const byNumber = new Map<number, MoveId>();
  for (const { tpl, body } of ofKind(tpls, 'combatMove')) {
    const uid = body['uniqueId'];
    let id: MoveId;
    if (typeof uid === 'string') {
      id = uid;
    } else if (typeof uid === 'number' && Number.isInteger(uid)) {
      id = tpl.id.replace(/^COMBAT_(V\d{4}_MOVE_|VM_MOVE_)/, '');
      byNumber.set(uid, id);
    } else {
      return bad(tpl.id, 'uniqueId must be a string or an integer');
    }
    const type = typeName(tpl.id, body['type'], 'type');
    if (!types.includes(type)) {
      bad(tpl.id, `type ${type} is not a known type`);
    }
    const power = optNum(tpl.id, body['power'], 'power') ?? 0;
    const delta = optNum(tpl.id, body['energyDelta'], 'energyDelta') ?? 0;
    const move: MoveData = /_FAST(_|$)/.test(id)
      ? {
          id,
          type,
          category: 'fast',
          power,
          energy: 0,
          energyGain: delta,
          turns: (optNum(tpl.id, body['durationTurns'], 'durationTurns') ?? 0) + 1,
        }
      : {
          id,
          type,
          category: 'charged',
          power,
          energy: delta === 0 ? 0 : -delta,
          energyGain: 0,
          turns: 1,
        };
    if (body['buffs'] !== undefined) {
      const b = reqRec(tpl.id, body['buffs'], 'buffs');
      const keys = [
        'attackerAttackStatStageChange',
        'attackerDefenseStatStageChange',
        'targetAttackStatStageChange',
        'targetDefenseStatStageChange',
      ];
      if (keys.some((k) => b[k] !== undefined)) {
        const n = (k: string): number | undefined => optNum(tpl.id, b[k], k);
        const buffs: MoveBuffs = { chance: n('buffActivationChance') ?? 1 };
        const self = stage(n('attackerAttackStatStageChange'), n('attackerDefenseStatStageChange'));
        const opponent = stage(n('targetAttackStatStageChange'), n('targetDefenseStatStageChange'));
        if (self) {
          buffs.self = self;
        }
        if (opponent) {
          buffs.opponent = opponent;
        }
        move.buffs = buffs;
      }
    }
    moves[id] = move;
  }
  return { moves, byNumber };
}
