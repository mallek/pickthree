/**
 * npm run post -- <league> [--prior] [--date YYYY-MM-DD]
 *
 * Runs the engine for one cup on production data and writes posts/<date>-<league>/: top.png,
 * budget.png, mega.png (Mega leagues), post.md and teams.json. Spec:
 * docs/superpowers/specs/2026-09-30-cup-team-boards-design.md. Nothing is posted or committed.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import {
  GameDataIndex,
  cautionNames,
  cupBoards,
  memberDisplay,
  type BoardRow,
} from '@pickthree/engine';
import { readEpochs, resolveWindow } from '@pickthree/engine/meta';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { priorWeights } from '../bake.js';
import { loadCupData } from './data.js';
import { assertAscii, fillBoards, type BoardId, type BoardView, type MemberView, type RowView } from './fill.js';
import { postMarkdown, teamsJson, type PostBoard, type PostTeam } from './markdown.js';
import { blendedWeights, fetchSummary, mixLine, runLabel, type WeightMix } from './weights.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..', '..');
const ROLES = ['LEAD', 'SWITCH', 'CLOSER'] as const;
const HEADINGS: Record<BoardId, string> = {
  top: 'Top Teams',
  budget: 'Budget Builds - No Elite TM',
  mega: 'Best Team for Each Mega',
};
const MASCOT: Record<BoardId, string> = {
  top: 'mascot-pointing.png',
  budget: 'mascot-thinking.png',
  mega: 'mascot-fingerguns.png',
};

function parseArgs(argv: string[]): { league: string; prior: boolean; date: string | null } {
  const league = argv.find((a) => !a.startsWith('--'));
  if (!league) {
    throw new Error('Usage: npm run post -- <league> [--prior] [--date YYYY-MM-DD]');
  }
  const at = argv.indexOf('--date');
  const date = at >= 0 ? (argv[at + 1] ?? null) : null;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`--date wants YYYY-MM-DD, got "${date}"`);
  }
  return { league, prior: argv.includes('--prior'), date };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = args.date ? new Date(`${args.date}T12:00:00Z`) : new Date();
  const day = now.toISOString().slice(0, 10);

  const data = await loadCupData(args.league);
  const index = new GameDataIndex(data.pokemon, data.moves);

  let weights: ReadonlyMap<string, number>;
  let mix: WeightMix;
  if (args.prior) {
    weights = priorWeights(data.rankings.overall, data.matrix.opponents);
    mix = { kind: 'prior' };
  } else {
    const w = resolveWindow(
      'meta',
      { league: data.league.id, seasons: data.seasons, epochs: readEpochs(data.epochs) },
      now,
    );
    const summary = await fetchSummary(data.league.id, w);
    weights = blendedWeights(summary, data);
    mix = { kind: 'blend', battles: summary.battles, events: summary.tournament?.events ?? 0 };
  }

  const mega = data.schedule.some((e) => e.league === data.league.id && e.mega === true);
  const sim = new PvPokeSimulator(loadPvPokeInNode(data.gameMaster));
  const boards = cupBoards({
    league: data.league,
    index,
    matrix: data.matrix,
    rankings: data.rankings,
    gameMaster: data.gameMaster,
    weights,
    sim,
    mega,
  });

  const nameOf = (id: string): string =>
    memberDisplay(index.mustSpecies(id).speciesName, id).name;
  const memberView = (row: BoardRow, j: number): MemberView => {
    const c = row.members[j]!;
    const id = c.build.speciesId;
    const sp = index.mustSpecies(id);
    const d = memberDisplay(sp.speciesName, id);
    return {
      role: ROLES[j]!,
      name: d.name,
      sprite: d.sprite,
      type: sp.types[0],
      tags: [
        ...d.tags,
        ...(c.moveset.eliteTmCount > 0 ? [{ kind: 'elite' as const, text: 'Elite TM' }] : []),
      ],
      moves: [c.moveset.fast.name, ...c.moveset.charged.map((m) => m.name)] as [string, string, ...string[]],
      hero: row.megaId === id,
    };
  };
  const rowView = (row: BoardRow): RowView => ({
    strength: row.team.strength,
    members: [memberView(row, 0), memberView(row, 1), memberView(row, 2)],
    caution: cautionNames(row.team.exposure, nameOf),
  });
  const postTeam = (row: BoardRow): PostTeam => ({
    species: row.team.species,
    names: row.members.map((c) => index.mustSpecies(c.build.speciesId).speciesName) as [string, string, string],
    moves: row.members.map((c) => [c.moveset.fast.moveId, ...c.moveset.charged.map((m) => m.moveId)]) as [
      string[],
      string[],
      string[],
    ],
    strength: row.team.strength,
    coverage: row.team.coverage,
    consistency: row.team.consistency,
    safety: row.team.safety,
    structure: row.team.structure,
    exposure: row.team.exposure,
  });

  const title = data.league.title;
  const label = runLabel(data.schedule, data.league.id, now);
  const source: [string, string, string] = [
    `Strength: pick3 sims vs the ${title} meta`,
    mixLine(mix, now),
    'Full analysis of every team: links in the post',
  ];
  const mascot = (id: BoardId): string =>
    `data:image/png;base64,${readFileSync(join(here, 'assets', MASCOT[id])).toString('base64')}`;
  const present: [BoardId, BoardRow[]][] = [
    ['top', boards.top],
    ['budget', boards.budget],
    ...(boards.mega && boards.mega.length > 0 ? [['mega', boards.mega] as [BoardId, BoardRow[]]] : []),
  ];
  const views: BoardView[] = present.map(([id, rows]) => ({
    id,
    title,
    label,
    source,
    mascot: mascot(id),
    rows: rows.map(rowView),
  }));

  const html = fillBoards(readFileSync(join(here, 'template.html'), 'utf8'), views);
  assertAscii(html);

  const outDir = join(REPO, 'posts', `${day}-${data.league.id}`);
  const tmp = join(tmpdir(), `pick3-post-${process.pid}.html`);
  writeFileSync(tmp, html);
  const pngs = new Map<BoardId, Uint8Array>();
  const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-first-run', '--disable-gpu'],
  });
  try {
    for (const [id] of present) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
      await page.goto(`${pathToFileURL(tmp).href}#${id}`, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const broken = await page.evaluate((board: string) => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(`#${board} img`));
        return imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src.slice(0, 80));
      }, id);
      if (broken.length > 0) {
        throw new Error(`Images failed to load on the ${id} board: ${broken.join(', ')}`);
      }
      pngs.set(id, await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350 } }));
      await page.close();
    }
  } finally {
    await browser.close();
    rmSync(tmp, { force: true });
  }

  const postBoards: PostBoard[] = present.map(([id, rows]) => ({
    id,
    heading: HEADINGS[id],
    teams: rows.map(postTeam),
  }));
  const run = {
    leagueId: data.league.id,
    cupTitle: title,
    day: now,
    mixLine: source[1],
    pvpoke: { commit: data.manifest.pvpokeCommit, date: data.manifest.pvpokeDate },
    weights: mix.kind,
    resimulated: boards.resimulated,
    boards: postBoards,
  };
  const markdown = postMarkdown(run);
  assertAscii(markdown);

  mkdirSync(outDir, { recursive: true });
  for (const [id, png] of pngs) {
    writeFileSync(join(outDir, `${id}.png`), png);
  }
  writeFileSync(join(outDir, 'post.md'), markdown);
  writeFileSync(join(outDir, 'teams.json'), teamsJson(run));
  process.stdout.write(
    `wrote ${outDir}: ${[...pngs.keys()].map((k) => `${k}.png`).join(', ')}, post.md, teams.json\n` +
      `re-simulated rows: top ${boards.resimulated.top.length}, budget ${boards.resimulated.budget.length}, mega ${boards.resimulated.mega.length}\n`,
  );
}

await main().catch((err: unknown) => {
  process.stderr.write(`post failed: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
