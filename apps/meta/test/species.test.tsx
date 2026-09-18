import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { resetBaselines } from '../src/baseline.js';
import { resetStatic } from '../src/data.js';
import { THIN_BAND_MAX } from '../src/stats.js';
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
    // The species name is App.tsx's sticky header title now (a plain span, matching apps/web's
    // own Header, not a heading), so this checks the text rather than a heading role.
    expect(await screen.findByText('Azumarill')).toBeInTheDocument();
    // D3 also prints a move's own type as a chip further down the page (BUBBLE is Water too), so
    // this scopes to the header's own sprite-and-types row rather than asserting a page-wide
    // unique match on "Water". Two levels up: Sprite (components.tsx) wraps SpeciesToken in a
    // span that carries the `--sprite-size` custom property, so the flex row that also holds
    // TypeChips is the sprite token's grandparent now, not its immediate parent.
    const head = screen.getByRole('img', { name: 'Azumarill' }).parentElement!.parentElement!;
    expect(within(head).getByText('Water')).toBeInTheDocument();
    // A4: whole percentages everywhere; 184 / 1,000 is 18.4%, rounded to 18%.
    expect(screen.getByText(/in 18% of 1,000 battles/)).toBeInTheDocument();
  });

  // FIX 2 (honesty): reachable for any id through "Seen next to", not just the ranked list, which
  // RANKED_SHARE keeps above this floor. A species faced 2 times in 1,000 battles is 0.2%, real
  // but not "0%": whole-percent rounding must not say it was never faced.
  it('floors a real but sub-one-percent share at "<1%" instead of rounding it away to 0%', async () => {
    const rare = { ...species, sightings: 2 };
    render(<App deps={{ fetcher: stubFetch({ species: rare, meta }), now }} />);
    expect(await screen.findByText(/in <1% of 1,000 battles/)).toBeInTheDocument();
    expect(screen.queryByText(/in 0% of 1,000 battles/)).toBeNull();
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

  it('warns on every thin band, not just the thinnest, and says nothing false about an empty one', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    const card = (
      await screen.findByRole('heading', { name: 'Record against it, by rank' })
    ).closest('section')!;
    // Fix round 3 ("FIX 3"): the old rule named only the single thinnest band, which under-warned
    // a 90-battle band standing right next to a 3-battle one. All three bands with battles here
    // (below 90, ace 60, legend 34) are under THIN_BAND_MAX, so the caveat still fires with more
    // than one thin band in play. D2 shortened its words from naming each band and its count to
    // one generic line; the interpolated threshold is what this test now pins.
    expect(
      within(card).getByText(`Under ${THIN_BAND_MAX} battles per band: hints, not facts.`),
    ).toBeInTheDocument();
    expect(within(card).getAllByText('no battles')).toHaveLength(3);
  });

  it('still reads as one short sentence when only a single band is thin', async () => {
    const oneThin = {
      ...species,
      bands: [
        { band: 'below', sightings: 200, wins: 100, losses: 100 },
        { band: 'ace', sightings: 150, wins: 80, losses: 70 },
        { band: 'veteran', sightings: 0, wins: 0, losses: 0 },
        { band: 'expert', sightings: 0, wins: 0, losses: 0 },
        { band: 'legend', sightings: 34, wins: 10, losses: 24 },
        { band: 'unknown', sightings: 0, wins: 0, losses: 0 },
      ],
    };
    render(<App deps={{ fetcher: stubFetch({ species: oneThin, meta }), now }} />);
    const card = (
      await screen.findByRole('heading', { name: 'Record against it, by rank' })
    ).closest('section')!;
    // D2: a single thin band (Legend, 34 battles here) reads the same short line as several would.
    expect(
      within(card).getByText(`Under ${THIN_BAND_MAX} battles per band: hints, not facts.`),
    ).toBeInTheDocument();
  });

  it('names a tie: two bands thin by the same count are both named', async () => {
    const tie = {
      ...species,
      bands: [
        { band: 'below', sightings: 1, wins: 1, losses: 0 },
        { band: 'ace', sightings: 1, wins: 0, losses: 1 },
        { band: 'veteran', sightings: 0, wins: 0, losses: 0 },
        { band: 'expert', sightings: 0, wins: 0, losses: 0 },
        { band: 'legend', sightings: 0, wins: 0, losses: 0 },
        { band: 'unknown', sightings: 0, wins: 0, losses: 0 },
      ],
    };
    render(<App deps={{ fetcher: stubFetch({ species: tie, meta }), now }} />);
    const card = (
      await screen.findByRole('heading', { name: 'Record against it, by rank' })
    ).closest('section')!;
    // Old rule (a strict `<` comparison over the minimum) named only the first of a tie. Both
    // bands still count as thin now (the gate itself is unchanged), which is what still fires the
    // (now generic, D2) caveat line.
    expect(
      within(card).getByText(`Under ${THIN_BAND_MAX} battles per band: hints, not facts.`),
    ).toBeInTheDocument();
  });

  it('says what "seen next to" actually measures', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    expect(await screen.findByText(/Reporters note up to three opponents/)).toBeInTheDocument();
  });

  // Fix round 3 ("FIX 2"): a bare "100%" from a pairing seen twice violated the spec's "always
  // on screen with their counts, however small" rule. The count now sits next to every
  // percentage.
  it('puts the battle count next to the alongside percentage', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    const card = (await screen.findByRole('heading', { name: 'Seen next to' })).closest('section')!;
    // tinkaton: 57 of azumarill's 184 sightings is 30.978...%, which rounds to 31%.
    expect(within(card).getByText('31% - 57 battles')).toBeInTheDocument();
  });

  it('shows a count instead of a share when the league is not measured yet', async () => {
    const thin = { battles: 50, devices: 2 };
    render(<App deps={{ fetcher: stubFetch({ species, meta: thin }), now }} />);
    const card = (await screen.findByRole('heading', { name: 'Seen next to' })).closest('section')!;
    expect(within(card).getByText('57 battles')).toBeInTheDocument();
    expect(within(card).queryByText(/%/)).toBeNull();
  });

  it('aggregates movesets into one pick3-style line per move, fast first, share at the end', async () => {
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
    // D3: fast moves first, then charged, each line marked F or C (pick3's own `.pick-move-k`).
    const card = (await screen.findByRole('heading', { name: 'Moves reporters ran' })).closest(
      'section',
    )!;
    const markers = [...card.querySelectorAll('.pick-move-k')].map((el) => el.textContent);
    expect(markers).toEqual(['F', 'C', 'C']);
    // BUBBLE and ICE_BEAM sit in both sets (60 of 60 battles, 100%); PLAY_ROUGH sits in only the
    // first (48 of 60, 80%). D2 dropped the old "add up to about 200%" footnote that used to
    // explain shares like these; the per-line share is the whole explanation now.
    const shares = [...card.querySelectorAll('.pick-move-share')].map((el) => el.textContent);
    expect(shares).toEqual(['100%', '100%', '80%']);
    expect(screen.queryByText(/add up to about 200%/)).toBeNull();
  });

  it('labels PvPoke as PvPoke', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    const card = (await screen.findByRole('heading', { name: "PvPoke's set" })).closest('section')!;
    expect(within(card).getByText(/Not measured play/)).toBeInTheDocument();
  });

  it('renders something useful for a species nobody has faced', async () => {
    render(<App deps={{ fetcher: stubFetch({ meta }), now }} />);
    expect(await screen.findByText('Azumarill')).toBeInTheDocument();
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

  // Fix round 3 ("FIX 1a"): a literal tie between two well-attested weeks is exactly what
  // trendPoints treats as "nothing to say" (its 95% band never excludes a difference of zero),
  // so the card now shows no change clause at all here rather than round 2's "about the same as
  // the first week" text, which claimed a fact (no movement) the statistic does not actually
  // assert. See the fixture below this one for the case where trendLabel's own "even" wording
  // still applies: a real, statistically significant difference that happens to round near zero.
  it('shows no change clause when the two weeks are an exact tie', async () => {
    const flat = {
      ...species,
      weekly: [
        { week: '2026-W36', battles: 500, sightings: 100 },
        { week: '2026-W37', battles: 500, sightings: 100 },
      ],
    };
    render(<App deps={{ fetcher: stubFetch({ species: flat, meta }), now }} />);
    // A4: whole percentages; 100 / 500 is exactly 20%.
    expect(await screen.findByText('20% latest')).toBeInTheDocument();
    expect(screen.queryByText(/pts since the first week/)).toBeNull();
    expect(screen.queryByText(/about the same/)).toBeNull();
    expect(screen.queryByText(/even/)).toBeNull();
  });

  // Fix round 3 ("FIX 1"). Task 12's tests missed this because every fixture week had 500
  // battles: a species faced once in a two-battle week and not at all in a three-battle week
  // used to render "0% latest, -50.0 pts since the first week", a trend and a share the data
  // cannot support. Neither a percentage nor a sparkline should appear; the raw counts should.
  //
  // Fix round 4: the rule that removes a bad share must not itself invent a chart. A per-week
  // filter (this test's original fix) drops thin weeks from wherever they fall, and Sparkline
  // spaces points evenly by index with no labels, so a thin week in the MIDDLE of the series
  // used to draw a straight line between two weeks that are not actually adjacent, and a thin
  // week at the END used to let an older week masquerade as "latest". The rule is now
  // all-or-nothing: any thin week anywhere drops the whole series to the counts fallback. The
  // four cases below pin that rule directly rather than relying on one fixture to imply it.
  it('shows counts only, no chart, when every week is thin', async () => {
    const thin = {
      ...species,
      sightings: 1,
      weekly: [
        { week: '2026-W36', battles: 2, sightings: 1 },
        { week: '2026-W37', battles: 3, sightings: 0 },
      ],
    };
    render(<App deps={{ fetcher: stubFetch({ species: thin, meta }), now }} />);
    const card = (await screen.findByRole('heading', { name: 'Faced, week by week' })).closest(
      'section',
    )!;
    expect(within(card).getByText('Faced 1 time in 5 battles over 2 weeks')).toBeInTheDocument();
    expect(within(card).queryByText(/%/)).toBeNull();
    expect(within(card).queryByText(/pts since the first week/)).toBeNull();
    expect(card.querySelector('svg')).toBeNull();
  });

  it('shows counts only, not a chart that skips it, when a thin week sits in the middle', async () => {
    const middleThin = {
      ...species,
      sightings: 205,
      weekly: [
        { week: '2026-W34', battles: 500, sightings: 100 },
        { week: '2026-W35', battles: 10, sightings: 5 },
        { week: '2026-W36', battles: 500, sightings: 100 },
      ],
    };
    render(<App deps={{ fetcher: stubFetch({ species: middleThin, meta }), now }} />);
    const card = (await screen.findByRole('heading', { name: 'Faced, week by week' })).closest(
      'section',
    )!;
    expect(
      within(card).getByText('Faced 205 times in 1,010 battles over 3 weeks'),
    ).toBeInTheDocument();
    expect(within(card).queryByText(/%/)).toBeNull();
    // The bug this pins: a per-week filter would have kept only the two 500-battle weeks and
    // drawn a line straight across the thin one between them, as if they were adjacent.
    expect(card.querySelector('svg')).toBeNull();
  });

  it('shows counts only, not an older week mislabelled "latest", when only the newest week is thin', async () => {
    const endThin = {
      ...species,
      sightings: 205,
      weekly: [
        { week: '2026-W36', battles: 500, sightings: 100 },
        { week: '2026-W37', battles: 500, sightings: 100 },
        { week: '2026-W38', battles: 10, sightings: 5 },
      ],
    };
    render(<App deps={{ fetcher: stubFetch({ species: endThin, meta }), now }} />);
    const card = (await screen.findByRole('heading', { name: 'Faced, week by week' })).closest(
      'section',
    )!;
    expect(
      within(card).getByText('Faced 205 times in 1,010 battles over 3 weeks'),
    ).toBeInTheDocument();
    // The bug this pins: a per-week filter would have dropped the thin, in-progress current
    // week and called the prior (500-battle) week "latest", which it is not.
    expect(within(card).queryByText(/latest/)).toBeNull();
    expect(card.querySelector('svg')).toBeNull();
  });

  it('charts a share and quotes the real latest week when every week clears SHARE_MIN', async () => {
    render(<App deps={{ fetcher: stubFetch({ species, meta }), now }} />);
    const card = (await screen.findByRole('heading', { name: 'Faced, week by week' })).closest(
      'section',
    )!;
    // The fixture's own two weeks are both 500 battles: 109 of 500 in 2026-W37, the later one,
    // is 21.8%, rounded to 22% (A4: whole percentages). D1 moved this onto the chart itself
    // (`.spark-label`) rather than a separate line of text below it.
    expect(within(card).getByText(/22% latest/)).toBeInTheDocument();
    expect(card.querySelector('svg')).not.toBeNull();
    // D1: a week tick under each point, labelling the real weeks the worker's own key ids name.
    const ticks = [...card.querySelectorAll('.spark-ticks span')].map((el) => el.textContent);
    expect(ticks).toEqual(['W36', 'W37']);
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
