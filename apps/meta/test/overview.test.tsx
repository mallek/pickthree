import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { BUCKET_MS } from '../src/api.js';
import { resetBaselines } from '../src/baseline.js';
import { resetStatic } from '../src/data.js';
import { battles as battlesText, count, pctPrecise } from '../src/format.js';
import { RANKED_SHARE, SMALL_MIN } from '../src/rank.js';
import { stubFetch } from './stubs/stubFetch.js';

const now = (): Date => new Date('2026-09-18T12:00:00.000Z');

function sp(speciesId: string, sightings: number, wins: number, losses: number) {
  return { speciesId, sightings, wins, losses, runs: 0, runWins: 0, runLosses: 0 };
}

beforeEach(() => {
  resetStatic();
  resetBaselines();
  window.history.replaceState(null, '', '/great');
});

describe('Overview, with almost no data', () => {
  const meta = {
    battles: 40,
    devices: 6,
    species: [sp('medicham', 9, 4, 5), sp('lanturn', 2, 1, 1), sp('registeel', 1, 1, 0)],
  };

  it('says plainly that there is not enough yet', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(await screen.findByText('Too few battles to trust yet.')).toBeInTheDocument();
  });

  it('leads with PvPoke and labels it as PvPoke, never as measured', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    const heading = await screen.findByRole('heading', { name: "PvPoke's meta group" });
    const section = heading.closest('section')!;
    expect(within(section).getByText(/Not measured play/)).toBeInTheDocument();
    expect(within(section).queryByText(/faced/i)).toBeNull();
  });

  it('shows what was measured anyway, as counts, with the long tail counted', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    const heading = await screen.findByRole('heading', { name: 'What we have seen' });
    const section = heading.closest('section')!;
    expect(within(section).getByText('Medicham')).toBeInTheDocument();
    expect(within(section).getByText('Lanturn')).toBeInTheDocument();
    expect(within(section).queryByText('Registeel')).toBeNull();
    expect(within(section).getByText('1 more was faced once.')).toBeInTheDocument();
    expect(within(section).queryByText(/%/)).toBeNull();
    // Fix round 3 ("FIX 5"): "at least twice" used to be typed out; it now reads SMALL_MIN so
    // the copy cannot drift from the actual cut this section applies. Fix round 4: "2 times" (the
    // literal interpolation) read clumsily, so the sentence itself was reworded; this still reads
    // the constant rather than a typed-out number, so a future change to SMALL_MIN cannot leave
    // the copy behind.
    expect(
      within(section).getByText(
        new RegExp(
          `Faced ${count(SMALL_MIN)} or more times in the ${battlesText(meta.battles)} shared so far`,
        ),
      ),
    ).toBeInTheDocument();
  });

  it('invites the reader to contribute, naming how many devices already do', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(await screen.findByText(/6 devices are contributing/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log battles in pick3' })).toHaveAttribute(
      'href',
      'https://pick3.gg/#/meta/log',
    );
  });

  it('says so when nothing at all has been shared', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText('No battles shared in this window yet.')).toBeInTheDocument();
    // Fix round 4: the "faced N or more times" rule used to print unconditionally, right above
    // this line, describing a set ("these 0 battles") that the very next sentence says is empty.
    // With nothing measured, the rule has nothing to say and must not render at all.
    expect(screen.queryByText(/or more times/)).toBeNull();
  });

  // E: "Only 0 Great League battles have been shared in this window" used to say zero battles
  // the same way it said any other small count. Zero is not a small number here, it is none.
  it('says none were shared yet, not "only 0", when the league has had zero', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(
        'No Great League battles shared in this window yet. The ranked list below is ' +
          "PvPoke's meta group, not measured play. What we have measured is under it, with its " +
          'counts.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Only 0/)).toBeNull();
  });
});

// rank.ts (current code, not the brief) splits the below-threshold reason into 'battles' and
// 'devices': Ranking.holdback. The brief predates that field and only wrote the 'battles' wording
// above. This covers the 'devices' branch: battles clear MEASURED_MIN but devices do not, so the
// banner must blame the device count rather than repeating a battle count that is not the problem.
describe('Overview, enough battles but too few devices', () => {
  const meta = {
    battles: 320,
    devices: 3,
    species: [sp('medicham', 20, 10, 8)],
  };

  it('blames the device count instead of the battle count', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(await screen.findByText('Too few battles to trust yet.')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only 3 devices have shared battles in this window, so this is a few players' matchmaking rather than what everyone is facing. The ranked list below is PvPoke's meta group, not measured play. What we have measured is under it, with its counts.",
      ),
    ).toBeInTheDocument();
  });
});

describe('Overview, with enough data', () => {
  const meta = {
    battles: 1000,
    devices: 120,
    species: [sp('azumarill', 184, 80, 104), sp('tinkaton', 159, 90, 69), sp('lanturn', 2, 1, 1)],
    previous: {
      battles: 1000,
      species: [{ speciesId: 'azumarill', sightings: 151 }],
    },
  };

  it('leads with the measured list and says what it is measured from', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(await screen.findByRole('heading', { name: 'Most faced' })).toBeInTheDocument();
    // A3: this used to be the first of two paragraphs of definitions above the first row; the
    // definitions moved to About's "How to read the lists", and this one line (numbers live) is
    // what is left.
    expect(screen.getByText('From 1,000 battles shared by 120 devices.')).toBeInTheDocument();
  });

  it('shows shares, records and a trend', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    // A4: whole percentages, and B1 drops the win rate percentage from this row's record line
    // entirely (the share above it is the row's one headline number), so "80-104" stands alone.
    expect(await screen.findByText('18%')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('80-104')).toBeInTheDocument();
    expect(screen.queryByText(/80-104.*%/)).toBeNull();
  });

  it('drops a species under the half percent cut', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    await screen.findByText('18%');
    expect(screen.queryByText('Lanturn')).toBeNull();
  });

  it('still offers PvPoke as a labelled section underneath', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(await screen.findByRole('heading', { name: "PvPoke's meta group" })).toBeInTheDocument();
  });

  it('links each row to its species page', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    // Scoped to the measured section: PvPoke's own top list is shown underneath it too (see the
    // brief's own Step 3 structure), and its stub happens to name the same top species, so an
    // unscoped query for "Azumarill" would match both sections' rows.
    const heading = await screen.findByRole('heading', { name: 'Most faced' });
    const section = heading.closest('section')!;
    const row = within(section).getByRole('link', { name: /Azumarill/ });
    expect(row).toHaveAttribute('href', '/great/p/azumarill');
  });

  // Fix round 3 ("FIX 5"): these two fine-print lines used to spell out 0.5% and 10 minutes as
  // literals, which could drift from RANKED_SHARE and BUCKET_MS without anything ever catching
  // it. Reading the same constants the page interpolates, rather than typing the digits again,
  // is what about.test.tsx already does for the About page's own thresholds.
  it('states the ranking cut and the refresh interval from the real constants', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(
      await screen.findByText(
        new RegExp(
          `Only Pokemon faced in at least ${pctPrecise(RANKED_SHARE)}% of battles are ranked`,
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Updated every ${count(BUCKET_MS / 60_000)} minutes`)),
    ).toBeInTheDocument();
  });
});

describe('Overview, when the api is down', () => {
  it('says so and still shows PvPoke', async () => {
    render(<App deps={{ fetcher: stubFetch({ metaStatus: 500 }), now }} />);
    expect(
      await screen.findByText(
        "Could not load the shared battles. PvPoke's list is below; try again in a moment.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "PvPoke's meta group" })).toBeInTheDocument();
  });
});

describe('Overview filters', () => {
  it('refetches when the window changes and puts it in the url', async () => {
    const { findByRole } = render(<App deps={{ fetcher: stubFetch({}), now }} />);
    const seven = await findByRole('radio', { name: '7 days' });
    seven.click();
    await waitFor(() => expect(window.location.search).toContain('w=7'));
  });
});

// Fix round 2: n = 1 is not an edge case here, it is the likely state for the first weeks this
// site is live (one contributor, a handful of battles). Every hand-spliced noun and verb that
// used to read "1 devices have" or "1 battles have" is exercised at n = 1 below.
describe('Overview, the day-one state (n = 1)', () => {
  it('agrees the noun and the verb with a single shared battle', async () => {
    const meta = { battles: 1, devices: 1, species: [sp('medicham', 1, 1, 0)] };
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(await screen.findByText('Too few battles to trust yet.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Only 1 Great League battle has been shared in this window. The ranked list below is ' +
          "PvPoke's meta group, not measured play. What we have measured is under it, with its " +
          'counts.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 device is contributing to this view so far/)).toBeInTheDocument();
  });

  it('reads "1 device has shared" and "one player\'s matchmaking", not "1 devices have"', async () => {
    const meta = { battles: 400, devices: 1, species: [sp('medicham', 20, 10, 8)] };
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(
      await screen.findByText(
        "Only 1 device has shared battles in this window, so this is one player's matchmaking " +
          "rather than what everyone is facing. The ranked list below is PvPoke's meta group, " +
          'not measured play. What we have measured is under it, with its counts.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Overview, request cost', () => {
  it('never asks for a species detail: nothing on this page has an id to look up', async () => {
    const fetcher = vi.fn(stubFetch({}));
    render(<App deps={{ fetcher, now }} />);
    expect(await screen.findByRole('heading', { name: "PvPoke's meta group" })).toBeInTheDocument();
    const urls = fetcher.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes('/api/v1/species/'))).toBe(false);
  });
});
