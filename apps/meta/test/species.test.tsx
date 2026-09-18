import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { resetBaselines } from '../src/baseline.js';
import { resetStatic } from '../src/data.js';
import { stubFetch } from './stubs/stubFetch.js';

const now = (): Date => new Date('2026-09-18T12:00:00.000Z');

beforeEach(() => {
  resetStatic();
  resetBaselines();
  window.history.replaceState(null, '', '/great/p/azumarill');
});

const species = {
  speciesId: 'azumarill',
  sightings: 184,
  wins: 80,
  losses: 104,
  runs: 60,
  runWins: 33,
  runLosses: 27,
  weekly: [
    { week: '2026-W36', battles: 500, sightings: 75 },
    { week: '2026-W37', battles: 500, sightings: 109 },
  ],
  bands: [
    { band: 'below', sightings: 90, wins: 45, losses: 45 },
    { band: 'ace', sightings: 60, wins: 25, losses: 35 },
    { band: 'veteran', sightings: 0, wins: 0, losses: 0 },
    { band: 'expert', sightings: 0, wins: 0, losses: 0 },
    { band: 'legend', sightings: 34, wins: 10, losses: 24 },
    { band: 'unknown', sightings: 0, wins: 0, losses: 0 },
  ],
  alongside: [
    { speciesId: 'tinkaton', battles: 57 },
    { speciesId: 'clodsire', battles: 44 },
  ],
  movesets: [
    { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], battles: 48 },
    { fast: 'BUBBLE', charged: ['ICE_BEAM'], battles: 12 },
  ],
};

const meta = { battles: 1000, devices: 120 };

describe('Species', () => {
  it('names it, its types and how often it turned up', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    expect(await screen.findByRole('heading', { name: 'Azumarill' })).toBeInTheDocument();
    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.getByText(/in 18.4% of 1,000 battles/)).toBeInTheDocument();
  });

  it('gives the record with its margin and explains a sub-50% number', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    // 80 wins over 184 decided battles is 43.478...%, which Math.round(rate * 100) takes to 43
    // (not 44: 43.478 rounds down at the whole-percent boundary).
    expect(await screen.findByText('43%')).toBeInTheDocument();
    expect(screen.getByText('80 wins, 104 losses')).toBeInTheDocument();
    expect(
      screen.getByText('Under 50% means it usually wins when it shows up.'),
    ).toBeInTheDocument();
  });

  it('links out to pick3 for counters, carrying the league', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    expect(await screen.findByRole('link', { name: 'Who beats it' })).toHaveAttribute(
      'href',
      'https://pick3.gg/#/counters?vs=azumarill&l=great',
    );
  });

  it('warns on a thin rank band and says nothing false about an empty one', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    const card = (
      await screen.findByRole('heading', { name: 'Record against it, by rank' })
    ).closest('section')!;
    // Correction 3: the thin-band warning names the band with the fewest battles among those
    // with at least one (below 90, ace 60, legend 34: legend is fewest), and only because that
    // count, 34, is itself under 100. The brief's looser "smallest band under 100" wording was
    // ambiguous with three bands under 100 in this fixture; this is the precise rule it meant.
    expect(within(card).getByText(/Legend is 34 battles, treat it as a hint/)).toBeInTheDocument();
    expect(within(card).getAllByText('no battles')).toHaveLength(3);
  });

  it('says what "seen next to" actually measures', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    expect(await screen.findByText(/Reporters note up to three opponents/)).toBeInTheDocument();
  });

  it('aggregates movesets into one bar per move and warns that charged shares double up', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    // Correction 2: `runs` counts battles, not distinct reporters, so the header must not claim
    // "60 reporters ran it themselves". This site never overstates a count it does not have.
    expect(await screen.findByText('Run by reporters in 60 battles')).toBeInTheDocument();
    // Correction 1: the two fixture sets both carry ICE_BEAM (48 + 12 battles) and both carry
    // BUBBLE as their fast move, so aggregated by move each name appears exactly once, not once
    // per set.
    expect(screen.getAllByText('Bubble')).toHaveLength(1);
    expect(screen.getAllByText('Ice Beam')).toHaveLength(1);
    expect(screen.getByText('Play Rough')).toBeInTheDocument();
    expect(screen.getByText(/add up to about 200%/)).toBeInTheDocument();
  });

  it('labels PvPoke as PvPoke', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    const card = (await screen.findByRole('heading', { name: "PvPoke's set" })).closest('section')!;
    expect(within(card).getByText(/Not measured play/)).toBeInTheDocument();
  });

  it('renders something useful for a species nobody has faced', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(await screen.findByRole('heading', { name: 'Azumarill' })).toBeInTheDocument();
    expect(screen.getByText('No shared battles mention it in this window.')).toBeInTheDocument();
    expect(
      screen.getByText('Nobody who shares battles has run it in this window.'),
    ).toBeInTheDocument();
  });

  it('reads the singular correctly at n = 1, not "1 battles"', async () => {
    // Fix round 1: every hand-spliced `{count(n)} battles` read "1 battles" at n = 1, and this
    // site launches with samples this small routinely, not as an edge case.
    const one = {
      ...species,
      runs: 1,
      movesets: [{ fast: 'BUBBLE', charged: ['ICE_BEAM'], battles: 1 }],
    };
    render(<App deps={{ fetcher: stubFetch({ species: one, meta }), now }} />);
    expect(await screen.findByText('Run by reporters in 1 battle')).toBeInTheDocument();
    expect(screen.queryByText(/1 battles\b/)).toBeNull();
  });

  it('says "about the same" instead of "even pts" when the week is unchanged', async () => {
    const flat = {
      ...species,
      weekly: [
        { week: '2026-W36', battles: 500, sightings: 100 },
        { week: '2026-W37', battles: 500, sightings: 100 },
      ],
    };
    render(<App deps={{ fetcher: stubFetch({ species: flat, meta }), now }} />);
    expect(await screen.findByText(/about the same as the first week/)).toBeInTheDocument();
    expect(screen.queryByText(/even pts/)).toBeNull();
  });

  // Fix round 2: a single win or loss is not a hypothetical on a site this new, and neither is
  // facing a species exactly once before the league clears the measured threshold.
  it('reads a single win and a single loss correctly, not "1 wins, 1 losses"', async () => {
    const oneEach = { ...species, wins: 1, losses: 1 };
    render(<App deps={{ fetcher: stubFetch({ species: oneEach, meta }), now }} />);
    expect(await screen.findByText('1 win, 1 loss')).toBeInTheDocument();
  });

  it('reads "Faced 1 time", not "Faced 1 times", when the league is not measured yet', async () => {
    const oneSighting = { ...species, sightings: 1 };
    const thin = { battles: 7, devices: 2 };
    render(<App deps={{ fetcher: stubFetch({ species: oneSighting, meta: thin }), now }} />);
    expect(await screen.findByText('Faced 1 time in 7 battles')).toBeInTheDocument();
  });
});
