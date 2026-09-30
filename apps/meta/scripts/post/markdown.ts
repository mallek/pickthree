/** The post body Travis pastes under the images, and the raw record of the run. */
import { teamLink } from '@pickthree/engine';
import type { BoardId } from './fill.js';

export interface PostTeam {
  species: [string, string, string];
  /** Full species names, e.g. "Kingdra (Shadow)", in battle order. */
  names: [string, string, string];
  /** Move ids per member, fast first. */
  moves: [string[], string[], string[]];
  strength: number;
  coverage: number;
  consistency: number;
  safety: number;
  structure: string;
  exposure: string[];
}

export interface PostBoard {
  id: BoardId;
  heading: string;
  teams: PostTeam[];
}

export interface PostRun {
  leagueId: string;
  cupTitle: string;
  day: Date;
  mixLine: string;
  pvpoke: { commit: string; date: string };
  weights: 'prior' | 'blend';
  /** Shared battles and tournament events behind the blend; 0 and 0 for the prior. */
  battles: number;
  events: number;
  resimulated: Record<string, string[]>;
  boards: PostBoard[];
}

export function linkOf(leagueId: string, t: PostTeam): string {
  return teamLink(
    leagueId,
    t.species.map((speciesId, i) => {
      const [fast, ...charged] = t.moves[i]!;
      return { speciesId, moves: { fast: fast!, charged } };
    }),
  );
}

export function postMarkdown(run: PostRun): string {
  const hasMega = run.boards.some((b) => b.id === 'mega');
  const what = hasMega
    ? 'top teams, budget builds and the best team for each Mega'
    : 'top teams and budget builds';
  const lines = [
    `Title: ${run.cupTitle}: ${what} (pick3 sims)`,
    '',
    `Whole teams, not single Pokemon: each row is a complete team in battle order (lead, switch, closer), ranked by projected strength against the ${run.cupTitle} meta.`,
    'Every link opens the full analysis on pick3.gg, run against your own Pokemon if you have imported them.',
  ];
  for (const b of run.boards) {
    lines.push('', `**${b.heading}**`, '');
    b.teams.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.names.join(' / ')} - ${linkOf(run.leagueId, t)}`);
    });
  }
  lines.push(
    '',
    `How the number works: pick3 simulates each team against the ${run.cupTitle} meta, weighted by what players face (${run.mixLine}). It is a projection, not a measured win rate. PvPoke data from ${run.pvpoke.date}.`,
    '',
  );
  return lines.join('\n');
}

export function teamsJson(run: PostRun): string {
  const boards: Record<string, unknown[]> = {};
  for (const b of run.boards) {
    boards[b.id] = b.teams.map((t) => ({ ...t, link: linkOf(run.leagueId, t) }));
  }
  return `${JSON.stringify(
    {
      league: run.leagueId,
      cup: run.cupTitle,
      day: run.day.toISOString(),
      weights: run.weights,
      battles: run.battles,
      events: run.events,
      mix: run.mixLine,
      pvpoke: run.pvpoke,
      resimulated: run.resimulated,
      boards,
    },
    null,
    2,
  )}\n`;
}

export interface PostFlex {
  /** The third Pokemon's full species name, e.g. "Kingdra (Shadow)". */
  name: string;
  /** The whole team of three, with moves, that this flex option completes. */
  team: PostTeam;
}

export interface PostCoreRow {
  coreNames: [string, string];
  flexKind: 'mega' | 'regular';
  flex: PostFlex[];
}

export interface PostCoreBoard {
  id: BoardId;
  heading: string;
  rows: PostCoreRow[];
}

export interface PostCoreRun {
  leagueId: string;
  cupTitle: string;
  day: Date;
  mixLine: string;
  pvpoke: { commit: string; date: string };
  weights: 'prior' | 'blend';
  battles: number;
  events: number;
  resimulated: Record<string, string[]>;
  boards: PostCoreBoard[];
}

/** The post title, kept out of the body: it goes in Reddit's separate title field (title.txt). */
export function postTitleCores(run: PostCoreRun): string {
  const hasMega = run.boards.some((b) => b.id === 'mega');
  const what = hasMega
    ? 'top cores, budget cores and the best Mega picks'
    : 'top cores and budget cores';
  return `${run.cupTitle}: ${what} (pick3 sims)`;
}

/**
 * The post body in the shape Travis hand-edited it to: an intro paragraph, then per board a bold
 * heading, a numbered core line and one `*` bullet per flex option. The link text is just the added
 * Pokemon (the flex option's own name), the link opens the whole team with moves, and the
 * strength follows after an escaped dash. "Pokemon" is spelled with the accent in prose (the
 * only non-ASCII character this text allows; see assertPostText).
 */
export function postMarkdownCores(run: PostCoreRun): string {
  const lines = [
    `Each row is a core (keep both Pokémon) plus one flex pick for the third slot, ranked by projected strength against the ${run.cupTitle} meta. The flex options under a core are close, so pick whichever you own or like. Every link opens the full team analysis on [pick3.gg](https://pick3.gg), run against your own Pokémon if you have imported them.`,
  ];
  for (const b of run.boards) {
    lines.push('', `**${b.heading}**`, '');
    b.rows.forEach((row, i) => {
      lines.push(`${i + 1}. ${row.coreNames.join(' + ')} -`);
      for (const f of row.flex) {
        lines.push(`   * [${f.name}](${linkOf(run.leagueId, f.team)}) \\- ${f.team.strength.toFixed(1)}`);
      }
    });
  }
  lines.push(
    '',
    `How the number works: pick3 simulates each team against the ${run.cupTitle} meta, weighted by what players face (PvPoke meta combined with trainer reported matches on pick3). It is a projection, not a measured win rate.`,
    '',
  );
  return lines.join('\n');
}

/** Post text may hold the letter e-acute (Pokémon) and nothing else outside 7-bit ASCII. */
export function assertPostText(text: string): void {
  const m = /[^\t\n\r\x20-\x7eé]/.exec(text);
  if (m) {
    const code = m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    throw new Error(
      `Unexpected character U+${code} in the post text, near "${text.slice(Math.max(0, m.index - 20), m.index + 20)}"`,
    );
  }
}

export function teamsJsonCores(run: PostCoreRun): string {
  const boards: Record<string, unknown[]> = {};
  for (const b of run.boards) {
    boards[b.id] = b.rows.map((row) => ({
      core: row.coreNames,
      flexKind: row.flexKind,
      flex: row.flex.map((f) => ({
        name: f.name,
        strength: f.team.strength,
        coverage: f.team.coverage,
        consistency: f.team.consistency,
        safety: f.team.safety,
        structure: f.team.structure,
        exposure: f.team.exposure,
        species: f.team.species,
        moves: f.team.moves,
        link: linkOf(run.leagueId, f.team),
      })),
    }));
  }
  return `${JSON.stringify(
    {
      league: run.leagueId,
      cup: run.cupTitle,
      day: run.day.toISOString(),
      weights: run.weights,
      battles: run.battles,
      events: run.events,
      mix: run.mixLine,
      pvpoke: run.pvpoke,
      resimulated: run.resimulated,
      boards,
    },
    null,
    2,
  )}\n`;
}
