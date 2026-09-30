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
      mix: run.mixLine,
      pvpoke: run.pvpoke,
      resimulated: run.resimulated,
      boards,
    },
    null,
    2,
  )}\n`;
}
