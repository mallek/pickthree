import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Baseline } from '../src/baseline.js';
import type { MetaSummaryV1, SpeciesStats, TournamentBlock } from '../src/api.js';
import type { StaticData } from '../src/data.js';
import type { Legal } from '../src/legal.js';
import { DEFAULT_QUERY, hrefFor, type SourceKey } from '../src/route.js';
import { rankSpecies, type SpeciesRanking, type SpeciesRow } from '../src/rank.js';
import { facedFigure, Pokemon } from '../src/screens/Pokemon.js';

// A minimal static file: no species/moves entries at all. Every id these tests use (azumarill,
// surprise, one, two, three) is unknown to it on purpose, so `speciesOf`'s own fallback (title
// case the raw id) is what names every row; that fallback happens to produce the exact display
// names these tests check ("Azumarill", "Surprise"), so there is nothing to fake here.
const STATIC_DATA: StaticData = {
  species: new Map(),
  moves: new Map(),
  leagues: [{ id: 'great', title: 'Great League', short: 'Great', cp: 1500 }],
  seasons: [],
};

// PvPoke ranks azumarill and tinkaton, nothing else: enough for "shows PvPoke's rank" and
// "marks ... new" to both have something to contrast against, and tinkaton (banned at a
// tournament in the tests below) a rank of its own to be drawn by regardless of tournament picks.
const RANKS: readonly string[] = ['azumarill', 'tinkaton'];

const BASELINE: Baseline = {
  league: 'great',
  pvpokeCommit: 'abc1234',
  pvpokeDate: '2026-09-10',
  species: [
    {
      speciesId: 'azumarill',
      score: 93,
      rating: 699,
      fastMove: 'BUBBLE',
      chargedMoves: ['ICE_BEAM'],
      fastUsage: [],
      chargedUsage: [],
    },
    {
      speciesId: 'tinkaton',
      score: 90,
      rating: 690,
      fastMove: 'FAIRY_WIND',
      chargedMoves: ['GIGATON_HAMMER'],
      fastUsage: [],
      chargedUsage: [],
    },
  ],
  byId: new Map(),
};

function faced(speciesId: string, sightings: number, wins: number, losses: number): SpeciesStats {
  return { speciesId, sightings, wins, losses, runs: 0, runWins: 0, runLosses: 0 };
}

function href(view: Parameters<typeof hrefFor>[0]): string {
  return hrefFor(view, DEFAULT_QUERY);
}

/** Opens the row's own explainer: `Term` renders nothing until tapped, same as Teams.tsx's own
 *  "How it is ranked". */
async function openRanked(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'How it is ranked' }));
}

/**
 * Builds a `MetaSummaryV1` from just what a test cares about, blends it with the fixed baseline
 * and rank order above via the real `rankSpecies` (not a hand-built `SpeciesRanking`), and renders
 * the screen. Going through the real blend, the same function App.tsx calls, is what makes these
 * tests exercise the screen's actual reading of a `SpeciesRow`, not a fixture that happens to look
 * like one.
 */
function renderPokemon(opts: {
  battles?: number;
  devices?: number;
  species?: SpeciesStats[];
  /** A tournament block in the same window. Defaults to null: no tournament data at all. */
  tournament?: TournamentBlock;
  /** Defaults to 'all', same as every existing test that predates the Source select. */
  source?: SourceKey;
  /** The Play! ban list. Defaults to null: nothing banned, same as before this took a `legal`. */
  legal?: { cup: string | null; banned: string[] };
  /** The prior window's sightings, for the trend tag: `rank.ts`'s `trendPoints` needs both this
   *  and the current window at or above `TREND_MIN` (200) battles to say anything at all. */
  previous?: { battles: number; species: { speciesId: string; sightings: number }[] };
  onRetry?: () => void;
}) {
  const meta: MetaSummaryV1 = {
    league: 'great',
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-08T00:00:00.000Z',
    source: 'all',
    battles: opts.battles ?? 0,
    tanked: 0,
    devices: opts.devices ?? 0,
    bands: {},
    sources: { ladder: opts.battles ?? 0 },
    species: opts.species ?? [],
    teams: [],
    previous: opts.previous ?? null,
    tournament: opts.tournament ?? null,
    generatedAt: '2026-09-08T00:00:00.000Z',
  };
  const legal: Legal | null = opts.legal
    ? { league: 'great', cup: opts.legal.cup, banned: new Set(opts.legal.banned) }
    : null;
  const ranking = rankSpecies(meta, BASELINE, RANKS, { source: opts.source ?? 'all', legal });
  return render(
    <Pokemon
      league="great"
      data={STATIC_DATA}
      rankingError={false}
      ranking={ranking}
      href={href}
      onRetry={opts.onRetry ?? (() => {})}
    />,
  );
}

/** A minimal `SpeciesRow`, every field zeroed or null, so a test overrides only what it cares
 *  about. Used to test `facedFigure` directly, without going through `rankSpecies`. */
function row(overrides: Partial<SpeciesRow> = {}): SpeciesRow {
  return {
    speciesId: 'x',
    rank: 1,
    weight: 0,
    pvpokeRank: null,
    inMetaGroup: false,
    sightings: 0,
    share: null,
    wins: 0,
    losses: 0,
    decided: 0,
    confidence: 'few',
    trend: null,
    barPct: 0,
    tournamentPicks: 0,
    tournamentGame1Picks: 0,
    tournamentWins: 0,
    tournamentLosses: 0,
    tournamentUnresolvedForms: 0,
    banned: false,
    ...overrides,
  };
}

/** A minimal `SpeciesRanking`, for the same reason as `row` above. */
function ranking(overrides: Partial<SpeciesRanking> = {}): SpeciesRanking {
  return {
    source: 'all',
    say: 0,
    battles: 0,
    devices: 0,
    tournamentSay: 0,
    tournamentBattles: 0,
    events: 0,
    eventsOther: 0,
    rows: [],
    weights: new Map(),
    pvpokeCommit: 'abc1234',
    pvpokeDate: '2026-09-10',
    ...overrides,
  };
}

// Fix round 1 minor: a direct unit test on `facedFigure` itself, across every source and its
// null-vs-figure edges, rather than only exercising it indirectly through rendered rows.
describe('facedFigure', () => {
  it('is null under prior, regardless of battles', () => {
    expect(
      facedFigure(row({ share: 0.5, sightings: 200 }), ranking({ source: 'prior', battles: 480 })),
    ).toBeNull();
  });

  it('is null under all when there is nothing to divide by', () => {
    expect(facedFigure(row(), ranking({ source: 'all', battles: 0 }))).toBeNull();
  });

  it('is null under all when the row itself has zero sightings, even with battles counted', () => {
    expect(
      facedFigure(row({ share: 0, sightings: 0 }), ranking({ source: 'all', battles: 480 })),
    ).toBeNull();
  });

  it('is a real figure under all with nonzero sightings', () => {
    expect(
      facedFigure(row({ share: 2 / 480, sightings: 2 }), ranking({ source: 'all', battles: 480 })),
    ).toEqual({ share: 2 / 480, n: 2, of: 480 });
  });

  it('is null under ladder when there is nothing to divide by', () => {
    expect(facedFigure(row(), ranking({ source: 'ladder', battles: 0 }))).toBeNull();
  });

  it('is a real figure under ladder with nonzero sightings', () => {
    expect(
      facedFigure(
        row({ share: 240 / 480, sightings: 240 }),
        ranking({ source: 'ladder', battles: 480 }),
      ),
    ).toEqual({ share: 0.5, n: 240, of: 480 });
  });

  it('is null under tournament when there are no tournament battles at all', () => {
    expect(facedFigure(row(), ranking({ source: 'tournament', tournamentBattles: 0 }))).toBeNull();
  });

  it('is null under tournament when the row has zero picks, even with a nonzero total', () => {
    expect(
      facedFigure(
        row({ tournamentPicks: 0 }),
        ranking({ source: 'tournament', tournamentBattles: 100 }),
      ),
    ).toBeNull();
  });

  it('is null under tournament when the row is banned, even with nonzero picks and a total', () => {
    expect(
      facedFigure(
        row({ banned: true, tournamentPicks: 40 }),
        ranking({ source: 'tournament', tournamentBattles: 100 }),
      ),
    ).toBeNull();
  });

  it('is a real figure under tournament with nonzero picks and not banned', () => {
    expect(
      facedFigure(
        row({ tournamentPicks: 40 }),
        ranking({ source: 'tournament', tournamentBattles: 100 }),
      ),
    ).toEqual({ share: 0.4, n: 40, of: 100 });
  });
});

describe('Pokemon, the one blend line', () => {
  it('has no "What you face" heading; the blend line and its Term carry that now', () => {
    renderPokemon({ battles: 0, devices: 0, species: [] });
    expect(screen.queryByRole('heading', { name: 'What you face' })).toBeNull();
  });

  it('joins the blend parts and "How it is ranked" with the same " · "', () => {
    renderPokemon({ battles: 0, devices: 0, species: [] });
    const sub = document.querySelector('.sub');
    expect(sub?.textContent).toBe('PvPoke 100% · No shared battles yet · How it is ranked');
  });

  it("is PvPoke's list and says so once opened, with no banner", async () => {
    renderPokemon({ battles: 0, devices: 0, species: [] });
    await openRanked();
    expect(
      screen.getByText(/PvPoke's list\. No shared battles in this window yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not measured play/i)).toBeNull();
  });

  it('carries the blend explainer and the "New" explainer in its body', async () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
    await openRanked();
    expect(
      screen.getByText(/blends PvPoke's ranking with what players actually faced/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/PvPoke does not rank this one, so its place here comes entirely/),
    ).toBeInTheDocument();
  });

  // The Term's body used to be several <p> elements inside a <p className="sub">, invalid HTML
  // React flags on every render that opens it (the same class of bug Teams.tsx's own fix round 1
  // pinned). BlendLine (components.tsx) is a <div>, its lines <span>s; this pins that opening the
  // Term logs nothing here either.
  it('opening "How it is ranked" logs no console error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
      await openRanked();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('Pokemon, a measured row', () => {
  it("leads with the measured share as a pink MeasuredValue, then the count, the record and its confidence tag, then PvPoke's rank, in that order", () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 240, 120, 120)] });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    const figure = row.querySelector('.row-figure') as HTMLElement;
    const measured = within(figure).getByText('50%');
    expect(measured.closest('.ui-measured')).not.toBeNull();
    const lines = Array.from(figure.children).map((el) => el.textContent);
    expect(lines).toEqual(['50%', '240 of 480 battles', 'went 120-120 some', 'PvPoke #1']);
  });

  // Fix round 1, Important 1: a share under half a point used to round to "0%" with plain `pct`,
  // reading as "never faced" when the truth is "faced, just rarely". `pctFloor` (format.ts) is
  // the same floor Species' own hero uses, so the two never disagree about a small row.
  it('reads a small share as "<1%", never "0%"', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 2, 1, 1)] });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    const measured = within(row).getByText('<1%');
    expect(measured.closest('.ui-measured')).not.toBeNull();
    expect(within(row).queryByText('0%')).toBeNull();
  });

  // Fix round 1 minor: the trend tag was only ever asserted absent (via the "New" row) or by
  // proxy (the weight bar test below never checked the tag itself). `previous` needs both windows
  // at or above TREND_MIN (200) battles and a real gap between their shares, per `trendPoints`.
  it('shows the trend tag when the previous window backs a real change', () => {
    renderPokemon({
      battles: 1000,
      devices: 9,
      species: [faced('azumarill', 400, 200, 200)],
      previous: { battles: 1000, species: [{ speciesId: 'azumarill', sightings: 100 }] },
    });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(within(row).getByText('+30')).toBeInTheDocument();
  });

  it('keeps the ladder trend off the PvPoke and Tournaments lists', () => {
    const previous = { battles: 1000, species: [{ speciesId: 'azumarill', sightings: 100 }] };
    const species = [faced('azumarill', 400, 200, 200)];
    for (const source of ['prior', 'tournament'] as const) {
      const { unmount } = renderPokemon({ battles: 1000, devices: 9, species, previous, source });
      const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
      expect(within(row).queryByText('+30')).toBeNull();
      unmount();
    }
  });

  it('marks a species PvPoke does not rank as new', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('surprise', 120, 50, 70)] });
    const row = screen.getByText('Surprise').closest('a');
    expect(within(row as HTMLElement).getByText('New')).toBeInTheDocument();
  });

  it('says nothing decided rather than a fabricated record', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('surprise', 120, 0, 0)] });
    const row = screen.getByText('Surprise').closest('a') as HTMLElement;
    expect(within(row).getByText(/no result recorded/)).toBeInTheDocument();
  });

  it('counts the long tail rather than dropping it', () => {
    renderPokemon({
      battles: 40,
      devices: 2,
      species: [faced('one', 1, 0, 1), faced('two', 1, 1, 0), faced('three', 1, 0, 0)],
    });
    expect(screen.getByText('3 more were faced once each')).toBeInTheDocument();
    expect(screen.queryByText('One')).toBeNull();
    expect(screen.queryByText('Two')).toBeNull();
    expect(screen.queryByText('Three')).toBeNull();
  });

  it('uses the singular tail line at exactly one', () => {
    renderPokemon({
      battles: 40,
      devices: 2,
      species: [faced('one', 1, 0, 1)],
    });
    expect(screen.getByText('1 more was faced once')).toBeInTheDocument();
    expect(screen.queryByText(/was faced once each/)).toBeNull();
  });

  it('links a row to its species page', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
    const row = screen.getByText('Azumarill').closest('a');
    expect(row).toHaveAttribute('href', '/great/p/azumarill');
  });

  it('never tags an undecided record with a confidence level', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('surprise', 120, 0, 0)] });
    const row = screen.getByText('Surprise').closest('a') as HTMLElement;
    expect(within(row).getByText(/no result recorded/)).toBeInTheDocument();
    expect(within(row).queryByText('few')).toBeNull();
  });

  it('never lets a measured word touch the PvPoke rank, and never brings the old banner back', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 240, 120, 120)] });
    expect(screen.getByText('PvPoke #1').textContent).toBe('PvPoke #1');
    expect(screen.queryByText("PvPoke's meta group")).toBeNull();
    expect(screen.queryByText('Too few battles to trust yet.')).toBeNull();
  });

  it('always offers the contribute card', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
    expect(screen.getByText('Help fill this in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log battles in pick3' })).toHaveAttribute(
      'href',
      'https://pick3.gg/#/meta/log',
    );
  });

  it('renders New as plain text on the row, not as nested interactive content', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('surprise', 120, 50, 70)] });
    const row = screen.getByText('Surprise').closest('a') as HTMLElement;
    expect(within(row).getByText('New').tagName).not.toBe('BUTTON');
    expect(within(row).queryByRole('button')).toBeNull();
  });

  // The weight bar is unmoved by ruling 6: it sits on the left, under the name, same as before
  // this task. The trend tag gets its own dedicated test above (it needs a `previous` window to
  // render at all).
  it('keeps the weight bar on the left, under the name', () => {
    renderPokemon({
      battles: 480,
      devices: 9,
      species: [faced('azumarill', 240, 120, 120)],
    });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(row.querySelector('.bar')).not.toBeNull();
  });
});

describe('Pokemon, nothing to measure', () => {
  // Fix round 1, Important 2: this coverage was dropped when the suite was rewritten for ruling
  // 6. Restored: a row with nothing to divide by (no battles at all, or no tournament battles at
  // all) shows plain muted words, never a pink figure or a bare percentage.
  it('under All with no battles at all, reads "Not faced in this window" with no pink figure', () => {
    renderPokemon({ battles: 0, devices: 0, species: [] });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(within(row).getByText('Not faced in this window')).toBeInTheDocument();
    expect(row.querySelector('.ui-measured')).toBeNull();
    expect(within(row).queryByText(/\d+%/)).toBeNull();
  });

  it('under Tournaments with no tournament battles at all, reads "No tournament battles in this window" with no pink figure', () => {
    renderPokemon({ source: 'tournament', battles: 480, devices: 9 });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(within(row).getByText('No tournament battles in this window')).toBeInTheDocument();
    expect(row.querySelector('.ui-measured')).toBeNull();
    expect(within(row).queryByText(/\d+%/)).toBeNull();
  });

  // Fix round 1, controller ruling: a row whose own count is zero reads as words too, even when
  // the source counted plenty of other battles -- the same rule Species' own hero header follows
  // (Species.tsx's headerText: `d.sightings === 0` -> "Not faced in this window",
  // `picks === 0` under a nonzero tournament total -> "Not picked in this window").
  it('under All, a species with zero sightings reads "Not faced in this window" even though the window has battles', () => {
    renderPokemon({ battles: 480, devices: 9, species: [] });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(within(row).getByText('Not faced in this window')).toBeInTheDocument();
    expect(row.querySelector('.ui-measured')).toBeNull();
    expect(within(row).queryByText(/\d+%/)).toBeNull();
  });

  it('says "Not faced in this window" once, with no record line repeating it', () => {
    renderPokemon({ battles: 480, devices: 9, species: [] });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(within(row).queryByText(/no result recorded/)).toBeNull();
    expect(within(row).queryByText(/^went /)).toBeNull();
    expect(within(row).getByText('PvPoke #1')).toBeInTheDocument();
  });

  it('under Tournaments, a species with zero picks reads "Not picked in this window" even though the total is nonzero', () => {
    renderPokemon({
      source: 'tournament',
      tournament: { events: 1, battles: 100, eventsOther: 0, species: [] },
    });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(within(row).getByText('Not picked in this window')).toBeInTheDocument();
    expect(row.querySelector('.ui-measured')).toBeNull();
    expect(within(row).queryByText(/\d+%/)).toBeNull();
  });
});

describe('Pokemon, source', () => {
  it('states all three weights in the blend line under All', () => {
    renderPokemon({
      battles: 480,
      devices: 9,
      tournament: { events: 1, battles: 105, eventsOther: 0, species: [] },
      source: 'all',
    });
    const sub = document.querySelector('.sub');
    // The blend's own two curves at these inputs: measuredSay(480, 9) is 62% of the ladder's say,
    // and tournamentSay(105, 1) splits what is left between PvPoke and tournaments.
    expect(sub?.textContent).toBe('PvPoke 26% · Tournaments 13% · GBL 62% · How it is ranked');
  });

  it('under Tournaments, the figure is picks of tournament battles', () => {
    renderPokemon({
      source: 'tournament',
      legal: { cup: 'championshipseries', banned: [] },
      tournament: {
        events: 1,
        battles: 100,
        eventsOther: 0,
        species: [
          {
            speciesId: 'azumarill',
            picks: 40,
            game1Picks: 25,
            wins: 18,
            losses: 22,
            unresolvedForms: 0,
          },
        ],
      },
    });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(within(row).getByText('40%')).toBeInTheDocument();
    expect(within(row).getByText('40 of 100 battles')).toBeInTheDocument();
    expect(within(row).getByText(/went 18-22/)).toBeInTheDocument();
  });

  it('a banned row says "Banned at tournaments" with no pink figure', () => {
    renderPokemon({
      source: 'tournament',
      legal: { cup: 'championshipseries', banned: ['tinkaton'] },
      tournament: {
        events: 1,
        battles: 100,
        eventsOther: 0,
        species: [
          {
            speciesId: 'azumarill',
            picks: 40,
            game1Picks: 25,
            wins: 18,
            losses: 22,
            unresolvedForms: 0,
          },
        ],
      },
    });
    const row = screen.getByText('Tinkaton').closest('a') as HTMLElement;
    expect(within(row).getByText('Banned at tournaments')).toBeInTheDocument();
    expect(within(row).queryByText(/^\d+%$/)).toBeNull();
    expect(row.querySelector('.ui-measured')).toBeNull();
  });

  it('under PvPoke, no pink anywhere, "Nothing measured." once above the list, and each row shows PvPoke\'s rank alone', async () => {
    renderPokemon({
      source: 'prior',
      battles: 480,
      devices: 9,
      species: [faced('azumarill', 200, 90, 110)],
    });
    expect(screen.getByText('Nothing measured.')).toBeInTheDocument();
    expect(document.querySelector('.ui-measured')).toBeNull();
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    const figure = row.querySelector('.row-figure') as HTMLElement;
    expect(Array.from(figure.children).map((el) => el.textContent)).toEqual(['PvPoke #1']);
    await openRanked();
    expect(
      screen.getByText(/PvPoke's list, commit abc1234 from 2026-09-10\. Nothing measured\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/players went/)).not.toBeInTheDocument();
  });

  it('lists a species tournaments picked that nobody faced on the ladder', () => {
    renderPokemon({
      source: 'tournament',
      tournament: {
        events: 1,
        battles: 100,
        eventsOther: 0,
        species: [
          {
            speciesId: 'lanturn',
            picks: 12,
            game1Picks: 5,
            wins: 5,
            losses: 5,
            unresolvedForms: 2,
          },
        ],
      },
    });
    const row = screen.getByText('Lanturn').closest('a') as HTMLElement;
    expect(within(row).getByText('12%')).toBeInTheDocument();
    expect(within(row).getByText('12 of 100 battles')).toBeInTheDocument();
  });
});

describe('Pokemon, loading and error states', () => {
  it('says so while still loading', () => {
    render(
      <Pokemon
        league="great"
        data={STATIC_DATA}
        rankingError={false}
        ranking={null}
        href={href}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('says so when one of its sources failed to load, and Try again retries', async () => {
    const onRetry = vi.fn();
    render(
      <Pokemon
        league="great"
        data={STATIC_DATA}
        rankingError={true}
        ranking={null}
        href={href}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Could not load the shared battles.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
