/**
 * Why this Pokemon, for your one. Analyze answers "is this team good"; these sentences answer the
 * narrower question the button was pressed for, and they come straight out of the matrix.
 *
 * A fill is credited only with what nothing before it already beat, so the second suggestion does
 * not restate the first one's coverage.
 */
import { fullName } from '../explain/explain.js';
import type { GameDataIndex } from '../gamedata/index.js';
import type { Candidate } from '../search/candidates.js';
import type { MatrixView } from '../search/matrixView.js';

/** How many opponents a line names before it counts the rest. */
export const NAMED = 3;

export interface Covered {
  /** Opponents this fill beats that nothing before it did, heaviest first. */
  covers: string[];
  line: string;
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] as string}`;
}

function lineFor(
  covers: string[],
  subjects: string[],
  wins: boolean[],
  index: GameDataIndex,
): string {
  if (covers.length === 0) {
    // It adds no new coverage, so it stands on what it beats by itself rather than on a borrowed
    // reason. A cheapest or community pick can legitimately land here.
    const total = wins.filter(Boolean).length;
    return `Beats ${total} of ${wins.length} in the meta group on its own.`;
  }
  const named = covers.slice(0, NAMED).map((id) => fullName(id, index));
  const rest = covers.length - named.length;
  const list = joinList(rest > 0 ? [...named, `${rest} more`] : named);
  const verb = subjects.length === 1 ? 'loses' : 'lose';
  return `Beats ${list} that ${joinList(subjects)} ${verb} to.`;
}

/**
 * One line per fill, in slot order. Each is framed against the pins and every fill before it, so
 * the reason a player reads is the reason that fill is there.
 */
export function coverLines(
  pins: Candidate[],
  fills: Candidate[],
  view: MatrixView,
  index: GameDataIndex,
  facing: ReadonlyMap<string, number>,
): Covered[] {
  const s11 = view.scenarioIndex([1, 1]);
  const beaten = new Array<boolean>(view.opponents.length).fill(false);
  const take = (wins: boolean[]): void => {
    wins.forEach((w, o) => {
      if (w) {
        beaten[o] = true;
      }
    });
  };
  for (const p of pins) {
    take(view.wins(p.matrixRow, s11));
  }
  const subjects = pins.map((p) => fullName(p.build.speciesId, index));
  const out: Covered[] = [];
  for (const f of fills) {
    const wins = view.wins(f.matrixRow, s11);
    const covers: string[] = [];
    wins.forEach((w, o) => {
      if (w && !beaten[o]) {
        covers.push(view.opponents[o] as string);
      }
    });
    covers.sort((a, b) => (facing.get(b) ?? 0) - (facing.get(a) ?? 0) || a.localeCompare(b));
    out.push({ covers, line: lineFor(covers, subjects, wins, index) });
    take(wins);
    subjects.push(fullName(f.build.speciesId, index));
  }
  return out;
}

/**
 * Below this share of the meta group beaten at 1-1 shields, a pin is weak enough to say so.
 * Silence is the reward for a strong pick.
 */
export const WEAK_PIN_SHARE = 1 / 3;

/**
 * The honest line about a weak favorite, or null when the pins hold their own.
 *
 * It is not a courtesy. Analyze is one tap away and will print a low number out of 100; saying
 * nothing first makes the app look like it wasted the player's time, and saying it first makes
 * that number confirm us. One line, one tier of copy: the numbers carry the severity.
 */
export function weakPinLine(
  pins: Candidate[],
  fills: number,
  view: MatrixView,
  index: GameDataIndex,
  leagueTitle: string,
): string | null {
  const s11 = view.scenarioIndex([1, 1]);
  const total = view.opponents.length;
  const weak = pins
    .map((p) => ({
      name: fullName(p.build.speciesId, index),
      wins: view.wins(p.matrixRow, s11).filter(Boolean).length,
    }))
    .filter((p) => p.wins / total < WEAK_PIN_SHARE);
  if (weak.length === 0) {
    return null;
  }
  const said = joinList(weak.map((p) => `${p.name} beats ${p.wins} of ${total}`));
  const subject = weak.length === 1 ? 'it' : 'they';
  const cover = fills === 1 ? 'This one covers' : 'These two cover';
  return `${said} in the current ${leagueTitle} meta group. ${cover} the most ${subject} ${
    weak.length === 1 ? 'loses' : 'lose'
  } to.`;
}
