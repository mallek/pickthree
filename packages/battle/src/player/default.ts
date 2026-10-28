import { damageOf } from '../rules/damage.js';
import type { MoveData } from '../data/types.js';
import type { BattleView, CombatantView, Decision, IncomingCharged, Player } from './types.js';

// Untuned: shield when a hit takes at least this share of max hp.
const THREAT_SHARE = 0.3;

function damageAgainst(view: BattleView, move: MoveData): number {
  const me: CombatantView = view.self;
  const foe: CombatantView = view.opponent;
  return damageOf(view.data, {
    move,
    attackerTypes: me.types,
    defenderTypes: foe.types,
    atk: me.atk,
    def: foe.def,
    atkStage: me.atkStage,
    defStage: foe.defStage,
    attackerShadow: me.shadow,
    defenderShadow: foe.shadow,
    defenderMaxHp: foe.maxHp,
  });
}

/** Sensible, not tuned: kill with fast if possible, else throw the hardest affordable charged move, else fast. */
export class DefaultPlayer implements Player {
  decide(view: BattleView): Decision {
    if (damageAgainst(view, view.self.fastMove) >= view.opponent.hp) {
      return { kind: 'fast' };
    }
    let best = -1;
    let bestDamage = 0;
    view.self.chargedMoves.forEach((move, slot) => {
      if (view.self.energy < move.energy) {
        return;
      }
      const dmg = damageAgainst(view, move);
      const current = best >= 0 ? view.self.chargedMoves[best] : undefined;
      if (current === undefined || dmg > bestDamage || (dmg === bestDamage && move.energy < current.energy)) {
        best = slot;
        bestDamage = dmg;
      }
    });
    return best >= 0 ? { kind: 'charged', slot: best } : { kind: 'fast' };
  }

  shield(view: BattleView, incoming: IncomingCharged): boolean {
    if (incoming.blockedByMechanic) {
      return false;
    }
    return incoming.damage >= view.self.hp || incoming.damage >= THREAT_SHARE * view.self.maxHp;
  }
}
