import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MetaSummaryV1, SpeciesDetailV1 } from '../src/api.js';
import { App } from '../src/App.js';
import { resetBaselines } from '../src/baseline.js';
import { resetStatic } from '../src/data.js';
import { resetLegal, type Legal } from '../src/legal.js';
import { stubFetch } from './stubs/stubFetch.js';

const now = (): Date => new Date('2026-09-18T12:00:00.000Z');

beforeEach(() => {
  resetStatic();
  resetBaselines();
  resetLegal();
  window.history.replaceState(null, '', '/great/p/azumarill');
});

// Three weeks by default (ruling 7: the weekly card wants 3 or more to render at all), each above
// SHARE_MIN so the card charts a share rather than falling back to raw counts.
const species = {
  speciesId: 'azumarill',
  sightings: 184,
  wins: 80,
  losses: 104,
  runs: 60,
  runWins: 33,
  runLosses: 27,
  weekly: [
    { week: '2026-W35', battles: 500, sightings: 60 },
    { week: '2026-W36', battles: 500, sightings: 75 },
    { week: '2026-W37', battles: 500, sightings: 109 },
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

/** A detail override that zeroes every measured field, the shape `EMPTY_SPECIES` (stubFetch.ts)
 *  already carries: used for "nobody has faced it this window" scenarios. */
const ZERO_DETAIL: Partial<SpeciesDetailV1> = {
  sightings: 0,
  wins: 0,
  losses: 0,
  runs: 0,
  runWins: 0,
  runLosses: 0,
  weekly: [],
  alongside: [],
  movesets: [],
  tournament: null,
};

type SightingsLike = Pick<
  SpeciesDetailV1,
  'speciesId' | 'sightings' | 'wins' | 'losses' | 'runs' | 'runWins' | 'runLosses'
>;

/**
 * Ruling 7: the Species hero reads the same blended row the Pokemon list's own rows read
 * (`rank.ts`'s `rankSpecies`, fed from the site's meta summary), NOT the species detail endpoint
 * directly, so a test has to keep the two in step itself: `meta.species` carries this species'
 * own sightings/wins/losses, the same numbers the detail fixture states, the way the real worker
 * always would. Callers needing a mismatch (there are none in this file) pass `overrides.species`
 * explicitly, which replaces this default entry.
 */
function metaFor(
  detail: SightingsLike,
  overrides: Partial<MetaSummaryV1> = {},
): Partial<MetaSummaryV1> {
  return {
    battles: 1000,
    devices: 120,
    species: [
      {
        speciesId: detail.speciesId,
        sightings: detail.sightings,
        wins: detail.wins,
        losses: detail.losses,
        runs: detail.runs,
        runWins: detail.runWins,
        runLosses: detail.runLosses,
      },
    ],
    ...overrides,
  };
}

/** Renders the full App at a species path (azumarill by default, from `beforeEach`), merging
 *  `detail` onto the fixture above, deriving a matching `meta.species` entry (see `metaFor`), and
 *  passing `legal` through to the ban list stub. Waits for the page's own name to appear, so
 *  every caller's own assertions after the await can read synchronously. */
async function renderSpecies(
  opts: {
    path?: string;
    detail?: Partial<SpeciesDetailV1>;
    meta?: Partial<MetaSummaryV1>;
    legal?: Legal | null;
    awaitText?: string;
  } = {},
): Promise<void> {
  if (opts.path) {
    window.history.replaceState(null, '', opts.path);
  }
  const merged = { ...species, ...opts.detail };
  const legalOpt = opts.legal
    ? { legal: { cup: opts.legal.cup, banned: [...opts.legal.banned] } }
    : {};
  render(
    <App
      deps={{
        fetcher: stubFetch({
          species: merged,
          meta: metaFor(merged, opts.meta),
          ...legalOpt,
        }),
        now,
      }}
    />,
  );
  await screen.findByText(opts.awaitText ?? 'Azumarill');
}

describe('Species, hero', () => {
  it('names it, its types, and the measured line ruling 7 asks for', async () => {
    await renderSpecies();
    // D3 also prints a move's own type as a chip further down the page (BUBBLE is Water too), so
    // this scopes to the header's own sprite-and-types row rather than asserting a page-wide
    // unique match on "Water".
    const head = screen.getByRole('img', { name: 'Azumarill' }).parentElement!.parentElement!;
    expect(within(head).getByText('Water')).toBeInTheDocument();
    // 184 / 1,000 is 18.4%, floored to 18% (pctFloor's whole-percent rounding).
    expect(
      screen.getByText('18% of what players face · 184 of 1,000 battles'),
    ).toBeInTheDocument();
    // Ruling 7: PvPoke's own rank sits under the measured line, small and muted; the old "#1 of
    // what players face" blended standing is gone (the list's own order already says it).
    expect(screen.getByText('PvPoke #1')).toBeInTheDocument();
    expect(screen.queryByText(/of what players face -/)).toBeNull();
  });

  it('floors a real but sub-one-percent share at "<1%" instead of rounding it away to 0%', async () => {
    await renderSpecies({ detail: { sightings: 2 } });
    expect(
      screen.getByText('<1% of what players face · 2 of 1,000 battles'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^0% of what players face/)).toBeNull();
  });

  it('reads the plain words, not a pink figure, when nothing was faced this window, and still names PvPoke’s rank', async () => {
    await renderSpecies({ detail: ZERO_DETAIL });
    expect(screen.getByText('Not faced in this window')).toBeInTheDocument();
    expect(document.querySelector('.ui-measured-line')).toBeNull();
    expect(screen.getByText('PvPoke #1')).toBeInTheDocument();
    expect(screen.queryByText(/of what players face ·/)).toBeNull();
  });

  it('marks a species PvPoke does not rank as New', async () => {
    await renderSpecies({
      path: '/great/p/surprise',
      detail: { speciesId: 'surprise', sightings: 5, wins: 2, losses: 3 },
      awaitText: 'Surprise',
    });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('has no "Record against it, by rank" card', async () => {
    await renderSpecies();
    expect(screen.queryByRole('heading', { name: 'Record against it, by rank' })).toBeNull();
  });
});

describe('Species, record', () => {
  it('gives the record with its margin and explains a sub-50% number', async () => {
    await renderSpecies();
    // 80 wins over 184 decided battles is 43.478...%, which Math.round(rate * 100) takes to 43
    // (not 44: 43.478 rounds down at the whole-percent boundary).
    expect(screen.getByText('43%')).toBeInTheDocument();
    expect(screen.getByText('80 wins, 104 losses')).toBeInTheDocument();
    expect(
      screen.getByText('Under 50% means it usually wins when it shows up.'),
    ).toBeInTheDocument();
  });

  it('links out to pick3 for counters and for build, carrying the league', async () => {
    await renderSpecies();
    expect(screen.getByRole('link', { name: 'Who beats it' })).toHaveAttribute(
      'href',
      'https://pick3.gg/#/counters?vs=azumarill&l=great',
    );
    expect(screen.getByRole('link', { name: 'Build a team around it' })).toHaveAttribute(
      'href',
      'https://pick3.gg/#/build?lead=azumarill&l=great',
    );
  });

  it('keeps both action links under PvPoke, where every other measured card is hidden', async () => {
    await renderSpecies({ path: '/great/p/azumarill?source=prior' });
    expect(screen.getByRole('link', { name: 'Who beats it' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Build a team around it' })).toBeInTheDocument();
  });

  it('keeps both action links for a species nobody has faced this window', async () => {
    await renderSpecies({ detail: ZERO_DETAIL });
    expect(screen.getByRole('link', { name: 'Who beats it' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Build a team around it' })).toBeInTheDocument();
  });
});

describe('Species, seen next to', () => {
  it('says what "seen next to" actually measures', async () => {
    await renderSpecies();
    expect(screen.getByText(/Reporters note up to three opponents/)).toBeInTheDocument();
  });

  // Ruling 7: the share and the count are two elements now, not one string joined by a dash, so a
  // long spelled name never wraps into the numbers.
  it('puts the share and the battle count on their own lines, not joined into one string', async () => {
    await renderSpecies();
    const card = (await screen.findByRole('heading', { name: 'Seen next to' })).closest(
      'section',
    )!;
    // tinkaton: 57 of azumarill's 184 sightings is 30.978...%, which rounds to 31%.
    expect(within(card).getByText('31%')).toBeInTheDocument();
    expect(within(card).getByText('57 battles')).toBeInTheDocument();
    expect(within(card).queryByText(/31%.*57 battles/)).toBeNull();
  });

  it('shows a share even in a league far below the old measured floor', async () => {
    await renderSpecies({ meta: { battles: 50, devices: 2 } });
    const card = (await screen.findByRole('heading', { name: 'Seen next to' })).closest(
      'section',
    )!;
    // The alongside share is a share of THIS species' own sightings, not of the league's, so it
    // never depended on the league's own battle or device count.
    expect(within(card).getByText('31%')).toBeInTheDocument();
    expect(within(card).getByText('57 battles')).toBeInTheDocument();
  });
});

describe('Species, moves reporters ran', () => {
  it('aggregates movesets into one pick3-style line per move, fast first, share at the end', async () => {
    await renderSpecies();
    // Task 4: the denominator is the battles whose moves are known (the movesets sum, 48 + 12 =
    // 60), not `runs` itself; the fixture happens to have every run's moves known, so the two
    // numbers coincide here, but the sub line still has to name both.
    expect(screen.getByText('Moves known in 60 of 60 battles')).toBeInTheDocument();
    expect(screen.getAllByText('Bubble')).toHaveLength(1);
    expect(screen.getAllByText('Ice Beam')).toHaveLength(1);
    expect(screen.getByText('Play Rough')).toBeInTheDocument();
    const card = (await screen.findByRole('heading', { name: 'Moves reporters ran' })).closest(
      'section',
    )!;
    const markers = [...card.querySelectorAll('.pick-move-k')].map((el) => el.textContent);
    expect(markers).toEqual(['F', 'C', 'C']);
    const shares = [...card.querySelectorAll('.pick-move-share')].map((el) => el.textContent);
    expect(shares).toEqual(['100%', '100%', '80%']);
  });

  it('divides move shares by the battles whose moves are known, not by every run', async () => {
    await renderSpecies({
      detail: {
        runs: 62,
        movesets: [
          { fast: 'THUNDER_SHOCK', charged: ['DOUBLE_IRON_BASH', 'DYNAMIC_PUNCH'], battles: 5 },
        ],
      },
    });
    expect(screen.getByText('Moves known in 5 of 62 battles')).toBeInTheDocument();
    const card = (await screen.findByRole('heading', { name: 'Moves reporters ran' })).closest(
      'section',
    )!;
    const shares = [...card.querySelectorAll('.pick-move-share')].map((el) => el.textContent);
    expect(shares).toEqual(['100%', '100%', '100%']);
  });

  it('says moves are not reported rather than showing a zero-battle share', async () => {
    await renderSpecies({ detail: { runs: 62, movesets: [] } });
    expect(screen.getByText('No moves reported yet.')).toBeInTheDocument();
    const card = (await screen.findByRole('heading', { name: 'Moves reporters ran' })).closest(
      'section',
    )!;
    expect(card.querySelector('.pick-move-share')).toBeNull();
    expect(within(card).queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/Moves known in/)).toBeNull();
  });

  it('treats an all-zero-battle moveset list the same as no movesets at all', async () => {
    await renderSpecies({
      detail: { runs: 62, movesets: [{ fast: 'BUBBLE', charged: ['ICE_BEAM'], battles: 0 }] },
    });
    expect(screen.getByText('No moves reported yet.')).toBeInTheDocument();
  });

  it('reads the singular correctly at n = 1, not "1 battles"', async () => {
    await renderSpecies({
      detail: { runs: 1, movesets: [{ fast: 'BUBBLE', charged: ['ICE_BEAM'], battles: 1 }] },
    });
    expect(screen.getByText('Moves known in 1 of 1 battle')).toBeInTheDocument();
    expect(screen.queryByText(/1 battles\b/)).toBeNull();
  });

  it('labels PvPoke as PvPoke', async () => {
    await renderSpecies();
    const card = (await screen.findByRole('heading', { name: "PvPoke's set" })).closest(
      'section',
    )!;
    expect(within(card).getByText(/Not measured play/)).toBeInTheDocument();
  });

  it('renders something useful for a species nobody has faced', async () => {
    await renderSpecies({ detail: ZERO_DETAIL });
    expect(screen.getByText('No shared battles mention it in this window.')).toBeInTheDocument();
    expect(
      screen.getByText('Nobody who shares battles has run it in this window.'),
    ).toBeInTheDocument();
  });
});

describe('Species, weekly', () => {
  it('renders with 3 weeks in the window', async () => {
    await renderSpecies();
    expect(screen.getByRole('heading', { name: 'Faced, week by week' })).toBeInTheDocument();
  });

  it('is absent with only 2 weeks in the window', async () => {
    await renderSpecies({
      detail: {
        weekly: [
          { week: '2026-W36', battles: 500, sightings: 75 },
          { week: '2026-W37', battles: 500, sightings: 109 },
        ],
      },
    });
    expect(screen.queryByRole('heading', { name: 'Faced, week by week' })).toBeNull();
  });

  it('charts a share and quotes the real latest week when every week clears SHARE_MIN', async () => {
    await renderSpecies();
    const card = (await screen.findByRole('heading', { name: 'Faced, week by week' })).closest(
      'section',
    )!;
    // 109 of 500 in the latest week (2026-W37) is 21.8%, rounded to 22%.
    expect(within(card).getByText(/22% latest/)).toBeInTheDocument();
    expect(card.querySelector('svg')).not.toBeNull();
    const ticks = [...card.querySelectorAll('.spark-ticks span')].map((el) => el.textContent);
    expect(ticks).toEqual(['W35', 'W36', 'W37']);
  });

  it('shows no change clause when the first and the latest week are an exact tie', async () => {
    await renderSpecies({
      detail: {
        weekly: [
          { week: '2026-W35', battles: 500, sightings: 100 },
          { week: '2026-W36', battles: 500, sightings: 150 },
          { week: '2026-W37', battles: 500, sightings: 100 },
        ],
      },
    });
    expect(await screen.findByText('20% latest')).toBeInTheDocument();
    expect(screen.queryByText(/pts since the first week/)).toBeNull();
    expect(screen.queryByText(/about the same/)).toBeNull();
  });

  it('shows counts only, no chart, when every week is thin', async () => {
    await renderSpecies({
      detail: {
        sightings: 1,
        weekly: [
          { week: '2026-W35', battles: 2, sightings: 1 },
          { week: '2026-W36', battles: 3, sightings: 0 },
          { week: '2026-W37', battles: 4, sightings: 0 },
        ],
      },
    });
    const card = (await screen.findByRole('heading', { name: 'Faced, week by week' })).closest(
      'section',
    )!;
    expect(within(card).getByText('Faced 1 time in 9 battles over 3 weeks')).toBeInTheDocument();
    expect(within(card).queryByText(/%/)).toBeNull();
    expect(card.querySelector('svg')).toBeNull();
  });

  it('shows counts only, not a chart that skips it, when a thin week sits in the middle', async () => {
    await renderSpecies({
      detail: {
        sightings: 205,
        weekly: [
          { week: '2026-W34', battles: 500, sightings: 100 },
          { week: '2026-W35', battles: 10, sightings: 5 },
          { week: '2026-W36', battles: 500, sightings: 100 },
        ],
      },
    });
    const card = (await screen.findByRole('heading', { name: 'Faced, week by week' })).closest(
      'section',
    )!;
    expect(
      within(card).getByText('Faced 205 times in 1,010 battles over 3 weeks'),
    ).toBeInTheDocument();
    expect(within(card).queryByText(/%/)).toBeNull();
    expect(card.querySelector('svg')).toBeNull();
  });

  it('shows counts only, not an older week mislabelled "latest", when only the newest week is thin', async () => {
    await renderSpecies({
      detail: {
        sightings: 205,
        weekly: [
          { week: '2026-W36', battles: 500, sightings: 100 },
          { week: '2026-W37', battles: 500, sightings: 100 },
          { week: '2026-W38', battles: 10, sightings: 5 },
        ],
      },
    });
    const card = (await screen.findByRole('heading', { name: 'Faced, week by week' })).closest(
      'section',
    )!;
    expect(
      within(card).getByText('Faced 205 times in 1,010 battles over 3 weeks'),
    ).toBeInTheDocument();
    expect(within(card).queryByText(/latest/)).toBeNull();
    expect(card.querySelector('svg')).toBeNull();
  });
});

describe('Species, record with a single result', () => {
  it('reads a single win and a single loss correctly, not "1 wins, 1 losses"', async () => {
    await renderSpecies({ detail: { wins: 1, losses: 1 } });
    expect(screen.getByText('1 win, 1 loss')).toBeInTheDocument();
  });

  it('reads "1 battle", not "1 battles", when the whole window is a single battle', async () => {
    await renderSpecies({ detail: { sightings: 1 }, meta: { battles: 1, devices: 1 } });
    expect(
      screen.getByText('100% of what players face · 1 of 1 battle'),
    ).toBeInTheDocument();
  });
});

const BLOCK = {
  picks: 34,
  game1Picks: 21,
  wins: 12,
  losses: 18,
  byDepth: [4, 6, 8, 6, 4, 3, 2, 1, 0],
  unresolvedForms: 3,
  broughtBy: 4,
  rosterSize: 16,
  pickedOnStream: 34,
  movesets: [
    { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], entries: 3 },
    { fast: 'BUBBLE', charged: ['ICE_BEAM'], entries: 1 },
  ],
  movesetsKnown: 4,
};

describe('Species, tournaments', () => {
  it('prints the tournaments row with picks, game one picks and the record', async () => {
    await renderSpecies({ detail: { tournament: BLOCK } });
    expect(
      screen.getByText('Tournaments: 34 picks, 21 in game one, players went 12-18'),
    ).toBeInTheDocument();
    // Ruling 7: "Form not confirmed for N picks." becomes this sentence.
    expect(
      screen.getByText("3 picks didn't show whether it was Shadow."),
    ).toBeInTheDocument();
  });

  it('reads the singular form line correctly, not "1 picks"', async () => {
    await renderSpecies({ detail: { tournament: { ...BLOCK, unresolvedForms: 1 } } });
    expect(screen.getByText("1 pick didn't show whether it was Shadow.")).toBeInTheDocument();
  });

  it('prints the roster join as one sentence', async () => {
    await renderSpecies({ detail: { tournament: BLOCK } });
    expect(
      screen.getByText(
        'Brought by 4 of 16 players seen on stream, picked in 34 of their streamed battles.',
      ),
    ).toBeInTheDocument();
  });

  it('says never picked on stream in those words, not zero', async () => {
    await renderSpecies({ detail: { tournament: { ...BLOCK, picks: 0, pickedOnStream: 0 } } });
    expect(
      screen.getByText('Brought by 4 of 16 players seen on stream, never picked on stream.'),
    ).toBeInTheDocument();
  });

  it('lists the sets from the roster, over known sets only, marking PvPoke own with a Tag', async () => {
    await renderSpecies({ detail: { tournament: BLOCK } });
    const card = (await screen.findByRole('heading', { name: 'Moves at tournaments' })).closest(
      'section',
    )!;
    expect(within(card).getByText('From 4 known sets of 4 roster entries')).toBeInTheDocument();
    // Only BLOCK's first set (BUBBLE, Ice Beam + Play Rough) matches the baseline's recommended
    // set; the second (BUBBLE, Ice Beam alone) does not, so exactly one of the two roster sets
    // carries the marker.
    const tag = within(card).getByText("PvPoke's set");
    expect(tag.className).toContain('ui-tag');
  });

  it('names Dynamic Punch+ as its own move, not a stray mark', async () => {
    await renderSpecies({
      detail: {
        tournament: {
          ...BLOCK,
          movesets: [
            { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], entries: 3 },
            { fast: 'BUBBLE', charged: ['DYNAMIC_PUNCH_PLUS'], entries: 1 },
          ],
        },
      },
    });
    const card = (await screen.findByRole('heading', { name: 'Moves at tournaments' })).closest(
      'section',
    )!;
    expect(within(card).getByText(/Dynamic Punch\+/)).toBeInTheDocument();
  });

  it('says banned instead of a zeroed row for a species the cup bans', async () => {
    await renderSpecies({
      detail: { tournament: { ...BLOCK, picks: 0 } },
      legal: { league: 'great', cup: 'championshipseries', banned: new Set(['azumarill']) },
    });
    // The ban list is its own fetch, a tick behind the species detail `renderSpecies` already
    // waited on, so this first assertion has to be a `find`, not a `get`.
    expect(await screen.findByText('Banned at tournaments')).toBeInTheDocument();
    expect(screen.queryByText(/Tournaments: /)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Moves at tournaments' })).not.toBeInTheDocument();
    expect(screen.queryByText(/seen on stream/)).not.toBeInTheDocument();
  });

  it('shows no tournaments row at all under GBL, where the block is null', async () => {
    await renderSpecies({ detail: { tournament: null } });
    expect(screen.queryByText(/Tournaments: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/seen on stream/)).not.toBeInTheDocument();
  });
});

describe('Species, source', () => {
  it('under PvPoke, reads "Nothing measured" below the header, not the real ladder cards', async () => {
    await renderSpecies({ path: '/great/p/azumarill?source=prior' });
    expect(screen.getByText('Nothing measured')).toBeInTheDocument();
    expect(screen.queryByText(/184 of/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Faced, week by week' })).toBeNull();
    expect(screen.queryByRole('heading', { name: "Reporters' record against it" })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Seen next to' })).toBeNull();
  });

  it('under Tournaments, the hero and the record read from the tournament battle count, and the ladder-only cards hide', async () => {
    window.history.replaceState(null, '', '/great/p/azumarill?source=tournament');
    const tournamentMeta = {
      tournament: {
        events: 3,
        battles: 40,
        eventsOther: 0,
        species: [
          {
            speciesId: 'azumarill',
            picks: 20,
            game1Picks: 10,
            wins: 9,
            losses: 11,
            unresolvedForms: 0,
          },
        ],
      },
    };
    await renderSpecies({
      detail: { tournament: { ...BLOCK, picks: 20, game1Picks: 10, wins: 9, losses: 11 } },
      meta: tournamentMeta,
    });
    // The corrected share, from the tournament total (ranking.tournamentBattles), not the ladder
    // total (meta.battles, 1,000, which would have printed "of 1,000").
    expect(
      screen.getByText('50% of tournament battles · 20 of 40 picks'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1,000/)).toBeNull();
    expect(screen.queryByRole('heading', { name: "Reporters' record against it" })).toBeNull();
    expect(screen.getByRole('heading', { name: 'At tournaments' })).toBeInTheDocument();
    expect(
      screen.getByText('Tournaments: 20 picks, 10 in game one, players went 9-11'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Record against it, by rank' })).toBeNull();
  });
});

describe('Species, not found', () => {
  it('shows Empty for an id this site has no species for, with a link back to the list', async () => {
    window.history.replaceState(null, '', '/great/p/doesnotexist');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText('No Pokémon by that name in Great League.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pokémon list/ })).toHaveAttribute(
      'href',
      '/great/pokemon',
    );
  });

  it('decides not found from the static data alone, never waiting on the species or meta fetch', async () => {
    // The static files (species.json etc.) still have to load once, or there is no data to check
    // the id against at all; what must NOT gate the Empty state is the species detail or the meta
    // summary fetch, which this fetcher never resolves.
    const base = stubFetch({});
    const hang: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/v1/species/') || url.startsWith('/api/v1/meta')) {
        return new Promise<Response>(() => {});
      }
      return base(input);
    }) as typeof fetch;
    window.history.replaceState(null, '', '/great/p/doesnotexist');
    render(<App deps={{ fetcher: hang, now }} />);
    expect(
      await screen.findByText('No Pokémon by that name in Great League.'),
    ).toBeInTheDocument();
  });
});

describe('Species, load failure', () => {
  it('shows ErrorState when the species record fails to load, and Try again recovers it', async () => {
    let failing = true;
    const base = stubFetch({ species, meta: metaFor(species) });
    const flaky: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/v1/species/') && failing) {
        throw new Error('network down');
      }
      return base(input);
    }) as typeof fetch;
    render(<App deps={{ fetcher: flaky, now }} />);
    expect(
      await screen.findByText("Could not load this Pokémon's record.", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.queryByText("Could not load this Pokémon's record.")).toBeNull(),
    );
    expect(
      await screen.findByText('Moves known in 60 of 60 battles', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  }, 15_000);
});
