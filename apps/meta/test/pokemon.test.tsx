import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Baseline } from '../src/baseline.js';
import type { MetaSummaryV1, SpeciesStats, TournamentBlock } from '../src/api.js';
import type { StaticData } from '../src/data.js';
import type { Legal } from '../src/legal.js';
import { DEFAULT_QUERY, hrefFor, type SourceKey } from '../src/route.js';
import { rankSpecies } from '../src/rank.js';
import { Pokemon } from '../src/screens/Pokemon.js';

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
    previous: null,
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
    />,
  );
}

describe('Pokemon, nothing measured', () => {
  it("is PvPoke's list and says so, with no banner", () => {
    renderPokemon({ battles: 0, devices: 0, species: [] });
    expect(
      screen.getByText(/PvPoke's list\. No shared battles in this window yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not measured play/i)).toBeNull();
  });

  it('prints counts, never a share, when nothing was counted', () => {
    renderPokemon({ battles: 0, devices: 0, species: [] });
    expect(screen.getAllByText('Not faced in this window').length).toBeGreaterThan(0);
    expect(screen.queryByText(/%\)/)).toBeNull();
  });
});

describe('Pokemon, blended', () => {
  it('says how measured the ranking currently is', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
    expect(
      screen.getByText(/% measured, from 480 shared battles by 9 devices/),
    ).toBeInTheDocument();
  });

  it('says "1 device" rather than "1 devices"', () => {
    renderPokemon({ battles: 40, devices: 1, species: [faced('azumarill', 20, 10, 8)] });
    expect(screen.getByText(/by 1 device$/)).toBeInTheDocument();
  });

  it('marks a species PvPoke does not rank as new', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('surprise', 120, 50, 70)] });
    const row = screen.getByText('Surprise').closest('a');
    expect(within(row as HTMLElement).getByText('New')).toBeInTheDocument();
  });

  it("shows PvPoke's rank on a species it does rank", () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
    expect(screen.getByText('PvPoke #1')).toBeInTheDocument();
  });

  it('prints the count and the share together', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 240, 120, 120)] });
    expect(screen.getByText('240 of 480 battles (50%)')).toBeInTheDocument();
  });

  it('never calls the reporters record a PvPoke number', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 240, 120, 120)] });
    const row = screen.getByText('Azumarill').closest('a') as HTMLElement;
    expect(within(row).getByText(/players went 120-120/)).toBeInTheDocument();
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

  // Fix round 1, item 5: the plural template has no singular form of its own ("1 more were faced
  // once each" reads wrong), so the plan amended the copy table with a dedicated singular line.
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

  // Fix round 1, item 1: `confidence(0)` is 'few', not "nothing to say", so tagging an undecided
  // row read "no result recorded few": a confidence level attached to a record that does not
  // exist. This is every row on a day-one board, which is exactly why nothing had caught it.
  it('never tags an undecided record with a confidence level', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('surprise', 120, 0, 0)] });
    const row = screen.getByText('Surprise').closest('a') as HTMLElement;
    expect(within(row).getByText(/no result recorded/)).toBeInTheDocument();
    expect(within(row).queryByText('few')).toBeNull();
  });

  // Fix round 1, item 4: the closest existing coverage only asserted the record text was
  // present, which would still pass if PvPoke's rank and the measured record were run together
  // into one string. This pins the honesty rule itself: the element holding the rank carries no
  // measured word, and the old flip's own headings never come back.
  it('never lets a measured word touch the PvPoke rank, and never brings the old banner back', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 240, 120, 120)] });
    expect(screen.getByText('PvPoke #1').textContent).not.toMatch(/faced|record|win rate/i);
    expect(screen.queryByText("PvPoke's meta group")).toBeNull();
    expect(screen.queryByText('Too few battles to trust yet.')).toBeNull();
  });

  // Fix round 1, item 6: `Contribute` changed from gated to unconditional in this task and had
  // no coverage anywhere in the meta suite.
  it('always offers the contribute card', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
    expect(screen.getByText('Help fill this in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log battles in pick3' })).toHaveAttribute(
      'href',
      'https://pick3.gg/#/meta/log',
    );
  });

  // Fix round 1, item 2: the "New" marker's explainer used to be a `Term` nested inside the row's
  // own anchor, which put interactive content inside a link and made the tap navigate away before
  // the tip could be read. It is now plain text on the row, with the explainer hosted once near
  // the header line, outside every anchor.
  it('renders New as plain text on the row, not as nested interactive content', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('surprise', 120, 50, 70)] });
    const row = screen.getByText('Surprise').closest('a') as HTMLElement;
    expect(within(row).getByText('New').tagName).not.toBe('BUTTON');
    expect(within(row).queryByRole('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });
});

describe('Pokemon, source', () => {
  it('states all three weights under All', () => {
    renderPokemon({
      battles: 480,
      devices: 9,
      tournament: { events: 1, battles: 105, eventsOther: 0, species: [] },
      source: 'all',
    });
    // The blend's own two curves at these inputs: measuredSay(480, 9) is 62% of the ladder's say,
    // and tournamentSay(105, 1) splits what is left between PvPoke and tournaments.
    expect(screen.getByText(/PvPoke 26%, tournaments 13%, GBL 62%\./)).toBeInTheDocument();
  });

  it('under Tournaments, prints picks and the record and marks a banned row', () => {
    renderPokemon({
      source: 'tournament',
      legal: { cup: 'championshipseries', banned: ['tinkaton'] },
      tournament: {
        events: 1,
        battles: 100,
        eventsOther: 0,
        species: [
          { speciesId: 'azumarill', picks: 40, game1Picks: 25, wins: 18, losses: 22, unresolvedForms: 0 },
        ],
      },
    });
    expect(screen.getByText('40 of 100 battles (40%)')).toBeInTheDocument();
    expect(screen.getByText(/players went 18-22/)).toBeInTheDocument();
    expect(screen.getByText('Banned at tournaments')).toBeInTheDocument();
  });

  it('under PvPoke, claims nothing measured on any row', () => {
    renderPokemon({ source: 'prior', battles: 480, devices: 9 });
    expect(
      screen.getByText(/PvPoke's list, commit abc1234 from 2026-09-10\. Nothing measured\./),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Nothing measured').length).toBeGreaterThan(0);
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
          { speciesId: 'lanturn', picks: 12, game1Picks: 5, wins: 5, losses: 5, unresolvedForms: 2 },
        ],
      },
    });
    expect(screen.getByText('12 of 100 battles (12%)')).toBeInTheDocument();
  });
});

describe('Pokemon, loading and error states', () => {
  it('says so while still loading', () => {
    render(
      <Pokemon league="great" data={STATIC_DATA} rankingError={false} ranking={null} href={href} />,
    );
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('says so when one of its sources failed to load', () => {
    render(
      <Pokemon league="great" data={STATIC_DATA} rankingError={true} ranking={null} href={href} />,
    );
    expect(
      screen.getByText('Could not load the shared battles. Try again in a moment.'),
    ).toBeInTheDocument();
  });
});
