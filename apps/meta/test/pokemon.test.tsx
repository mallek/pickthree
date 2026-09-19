import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Baseline } from '../src/baseline.js';
import type { MetaSummaryV1, SpeciesStats } from '../src/api.js';
import type { StaticData } from '../src/data.js';
import { DEFAULT_QUERY, hrefFor } from '../src/route.js';
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

// PvPoke ranks azumarill and nothing else: enough for "shows PvPoke's rank" and "marks ... new"
// to both have something to contrast against.
const RANKS: readonly string[] = ['azumarill'];

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
  battles: number;
  devices: number;
  species: SpeciesStats[];
  /** Unused by this harness: the tail is read off the real ranking, never asserted into it. Kept
   * so a call site can document its own expectation next to the fixture that produces it. */
  tail?: number;
}) {
  const meta: MetaSummaryV1 = {
    league: 'great',
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-08T00:00:00.000Z',
    band: 'all',
    battles: opts.battles,
    tanked: 0,
    devices: opts.devices,
    bands: {},
    sources: { ladder: opts.battles },
    species: opts.species,
    teams: [],
    previous: null,
    generatedAt: '2026-09-08T00:00:00.000Z',
  };
  const ranking = rankSpecies(meta, BASELINE, RANKS);
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
      screen.getByText(/% measured, from 480 battles shared by 9 devices/),
    ).toBeInTheDocument();
  });

  it('says "1 device" rather than "1 devices"', () => {
    renderPokemon({ battles: 40, devices: 1, species: [faced('azumarill', 20, 10, 8)] });
    expect(screen.getByText(/shared by 1 device$/)).toBeInTheDocument();
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
      tail: 3,
    });
    expect(screen.getByText('3 more were faced once each')).toBeInTheDocument();
    expect(screen.queryByText('One')).toBeNull();
    expect(screen.queryByText('Two')).toBeNull();
    expect(screen.queryByText('Three')).toBeNull();
  });

  it('links a row to its species page', () => {
    renderPokemon({ battles: 480, devices: 9, species: [faced('azumarill', 200, 90, 110)] });
    const row = screen.getByText('Azumarill').closest('a');
    expect(row).toHaveAttribute('href', '/great/p/azumarill');
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
