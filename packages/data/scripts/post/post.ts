/**
 * npm run post -- <league> [--prior] [--date YYYY-MM-DD]
 *
 * Runs the engine for one cup on production data and writes posts/<date>-<league>/: top.png,
 * budget.png, mega.png (Mega leagues), post.md and teams.json: the core + flex boards. Spec:
 * docs/superpowers/specs/2026-09-30-core-flex-boards-design.md. Nothing is posted or committed.
 * The old team-board path (cupBoards, template.html, fill.ts, postMarkdown) stays in the repo but this command no longer uses it.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { GameDataIndex, coreBoards, type CoreRowOut } from '@pickthree/engine';
import { priorWeights, readEpochs, resolveWindow } from '@pickthree/engine/meta';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { MASCOT, coreBoardView, postCoreBoard, type CoreBoardId } from './coreViews.js';
import { loadCupData } from './data.js';
import { assertAscii, fillCoreBoard } from './fillCores.js';
import { assertPostText, postMarkdownCores, teamsJsonCores, type PostCoreRun } from './markdown.js';
import { blendedWeights, fetchSummary, mixLine, runLabel, type WeightMix } from './weights.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..', '..');

function parseArgs(argv: string[]): { league: string; prior: boolean; date: string | null } {
  const league = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--date');
  if (!league) {
    throw new Error('Usage: npm run post -- <league> [--prior] [--date YYYY-MM-DD]');
  }
  const unknown = argv.find((a) => a.startsWith('--') && a !== '--prior' && a !== '--date');
  if (unknown) {
    throw new Error(
      `Unknown flag ${unknown}. Usage: npm run post -- <league> [--prior] [--date YYYY-MM-DD]`,
    );
  }
  const at = argv.indexOf('--date');
  const date = at >= 0 ? (argv[at + 1] ?? null) : null;
  if (at >= 0) {
    const real =
      date !== null &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
    if (!real) {
      throw new Error(`--date wants a real date as YYYY-MM-DD, got "${date ?? ''}"`);
    }
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
  const boards = coreBoards({
    league: data.league,
    index,
    matrix: data.matrix,
    rankings: data.rankings,
    gameMaster: data.gameMaster,
    weights,
    sim,
    mega,
  });

  const title = data.league.title;
  const label = runLabel(data.schedule, data.league.id, now);
  const mix1 = mixLine(mix, now);
  const mascot = (id: CoreBoardId): string =>
    `data:image/png;base64,${readFileSync(join(here, 'assets', MASCOT[id])).toString('base64')}`;
  const present: [CoreBoardId, CoreRowOut[]][] = [
    ['top', boards.top],
    ['budget', boards.budget],
    ...(boards.mega && boards.mega.length > 0
      ? [['mega', boards.mega] as [CoreBoardId, CoreRowOut[]]]
      : []),
  ];
  const template = readFileSync(join(here, 'template-cores.html'), 'utf8');
  const pages: [CoreBoardId, string][] = present.map(([id, rows]) => {
    const html = fillCoreBoard(
      template,
      coreBoardView(index, { id, rows, title, label, mixLine: mix1, mascot: mascot(id) }),
    );
    assertAscii(html);
    return [id, html];
  });

  const run: PostCoreRun = {
    leagueId: data.league.id,
    cupTitle: title,
    day: now,
    mixLine: mix1,
    pvpoke: { commit: data.manifest.pvpokeCommit, date: data.manifest.pvpokeDate },
    weights: mix.kind,
    battles: mix.kind === 'blend' ? mix.battles : 0,
    events: mix.kind === 'blend' ? mix.events : 0,
    resimulated: boards.resimulated,
    boards: present.map(([id, rows]) => postCoreBoard(index, id, rows)),
  };
  const markdown = postMarkdownCores(run);
  assertPostText(markdown);

  const outDir = join(REPO, 'posts', `${day}-${data.league.id}`);
  const tmps: string[] = [];
  const pngs = new Map<CoreBoardId, Uint8Array>();
  const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const files: [CoreBoardId, string][] = [];
    for (const [id, html] of pages) {
      const tmp = join(tmpdir(), `pick3-post-${process.pid}-${id}.html`);
      tmps.push(tmp);
      writeFileSync(tmp, html);
      files.push([id, tmp]);
    }
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ['--no-first-run', '--disable-gpu'],
    });
    for (const [id, tmp] of files) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const broken = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.board img'));
        return imgs
          .filter((i) => !i.complete || i.naturalWidth === 0)
          .map((i) => i.src.slice(0, 80));
      });
      if (broken.length > 0) {
        throw new Error(`Images failed to load on the ${id} board: ${broken.join(', ')}`);
      }
      pngs.set(
        id,
        await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350 } }),
      );
      await page.close();
    }
  } finally {
    await browser?.close();
    for (const tmp of tmps) {
      rmSync(tmp, { force: true });
    }
  }

  mkdirSync(outDir, { recursive: true });
  for (const [id, png] of pngs) {
    writeFileSync(join(outDir, `${id}.png`), png);
  }
  writeFileSync(join(outDir, 'post.md'), markdown);
  writeFileSync(join(outDir, 'teams.json'), teamsJsonCores(run));
  process.stdout.write(
    `wrote ${outDir}: ${[...pngs.keys()].map((k) => `${k}.png`).join(', ')}, post.md, teams.json\n` +
      `re-simulated rows: top ${boards.resimulated.top.length}, budget ${boards.resimulated.budget.length}, mega ${boards.resimulated.mega.length}\n`,
  );
}

await main().catch((err: unknown) => {
  process.stderr.write(`post failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
