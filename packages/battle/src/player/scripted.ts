import type { BattleView, Decision, IncomingCharged, Player, RandomSource } from './types.js';

export interface ScriptEntry {
  actor: 0 | 1;
  turn: number;
  slot: number;
  shielded: boolean;
  buff?: boolean;
}

export class ScriptedPlayer implements Player {
  constructor(
    private readonly actor: 0 | 1,
    private readonly script: readonly ScriptEntry[],
  ) {}

  decide(view: BattleView): Decision {
    const entry = this.script.find((e) => e.actor === view.actor && e.turn === view.turn);
    if (entry) {
      return { kind: 'charged', slot: entry.slot };
    }
    return { kind: 'fast' };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  shield(view: BattleView, _incoming: IncomingCharged): boolean {
    const attacker: 0 | 1 = this.actor === 0 ? 1 : 0;
    const entry = this.script.find((e) => e.actor === attacker && e.turn === view.turn);
    return entry ? entry.shielded : false;
  }
}

export function scriptedRandom(script: readonly ScriptEntry[]): RandomSource {
  return {
    buffProcs(ctx) {
      const entry = script.find((e) => e.actor === ctx.actor && e.turn === ctx.turn);
      return entry?.buff ?? false;
    },
    cmpTieWinner() {
      return 0;
    },
  };
}
