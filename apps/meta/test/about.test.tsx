import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { resetBaselines } from '../src/baseline.js';
import { resetStatic } from '../src/data.js';
import { battleWord, count } from '../src/format.js';
import { HALF_SAY_EVENTS, HALF_SAY_TOURNAMENT_BATTLES } from '../src/rank.js';
import { MANY, SOME, TREND_MIN } from '../src/stats.js';
import { stubFetch } from './stubs/stubFetch.js';

const now = (): Date => new Date('2026-09-18T12:00:00.000Z');

beforeEach(() => {
  resetStatic();
  resetBaselines();
  window.history.replaceState(null, '', '/about');
});

describe('About', () => {
  it('lists every field a shared battle carries', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    for (const line of [
      'League and season',
      'When the battle happened',
      "The reporter's three Pokemon, and the moves they had set when pick3 knew them",
      'Which opponent Pokemon were seen, up to three',
      'Win, loss, or tanked',
      'A self-reported rank band: Below Ace, Ace, Veteran, Expert or Legend',
      'A random device id, so contributors can be counted and a device can delete what it sent',
      'Which app and build sent it, so a misbehaving version can be spotted',
      'When the server received it',
    ]) {
      expect(await screen.findByText(line)).toBeInTheDocument();
    }
  });

  it('says what is never collected, collection first', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText('Your Pokemon collection or storage')).toBeInTheDocument();
    expect(screen.getByText('IVs, levels or CP')).toBeInTheDocument();
    expect(screen.getByText('Your IP address')).toBeInTheDocument();
  });

  // IMPORTANT 3: the old opening line said "Nothing is scraped, estimated or simulated" with
  // PvPoke's meta group as the one exception, which the Teams board's own projections (computed
  // from PvPoke's simulated matchup matrix) and the "What 'projected' means" section directly
  // below contradict. The opening line has to name both real sources, including the simulated
  // one, rather than promise there is only one.
  //
  // Task 15: a third source (tournament broadcasts) joined the blend, so "one of two places" is
  // no longer true either. Renamed and extended rather than left as "both" once there were three.
  it('names all three real sources up front, including the simulated one', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(/PvPoke's own curated meta group and the simulated matchups/),
    ).toBeInTheDocument();
    expect(screen.getByText(/official tournament broadcasts/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is scraped, estimated or simulated/)).toBeNull();
  });

  // Task 14 fix round 1 (CRITICAL 1): this card used to state the exact flip the deletion in
  // rank.ts retired ("measured once 300 battles from 5 devices, otherwise PvPoke's list leads"),
  // two cards above the new section that says "Nothing flips." That threshold language is gone
  // for good; what is left is the confidence-tag tiers (stats.ts's SOME and MANY) and the trend
  // floor (TREND_MIN), read from the same constants the page interpolates, not typed-out digits.
  it('names the confidence tiers and the trend floor, not a measured/baseline threshold', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(new RegExp(`few under ${count(SOME)} decided ${battleWord(SOME)}`)),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`many at ${count(MANY)} or more`))).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`at least ${count(TREND_MIN)} ${battleWord(TREND_MIN)}`)),
    ).toBeInTheDocument();
    // The retired language must not survive under a new name: no "or more counted battles" gate,
    // and no claim that either list "leads" the other.
    expect(screen.queryByText(/or more counted/)).toBeNull();
    expect(screen.queryByText(/leads/)).toBeNull();
  });

  // IMPORTANT 4: the old sentence named a screen called "Most run teams" that does not exist, and
  // claimed it shows a win rate with a confidence tag, which is Pokemon's own behavior, not
  // Teams'. Teams.tsx never prints a percentage for an observed record (`recordLine`, always raw
  // counts) and, since the matchup-score change, never prints a projection as a percentage
  // either: a projection is a matchup score out of 100 (`matchupScoreLine`). This pins the
  // corrected, per-screen claims.
  it('describes what the Pokemon list, the Species page and Teams actually show', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(
        /On the Pokemon list, a record is always the raw win-loss count, never a percentage/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/On the Species page, a win rate is shown as a percentage/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/On Teams, a record is always the raw win-loss count too/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/is shown as a matchup score out of 100, never a percentage/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Most run teams/)).toBeNull();
  });

  // A3: these definitions used to sit above every visit to Overview's measured list; they moved
  // here so Overview can lead with one line of live numbers instead.
  it('defines faced, record and trend for a reader who wants to know', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(/Faced is the share of a window's shared battles/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Record is how the reporters/)).toBeInTheDocument();
    expect(screen.getByText(/Trend is the change in a Pokemon's share/)).toBeInTheDocument();
  });

  it('explains the blend, in words, with both half-say points', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(/At 300 counted battles the measured side has half the say/),
    ).toBeInTheDocument();
    expect(screen.getByText(/At 5 devices it also has half the say/)).toBeInTheDocument();
  });

  // Task 15: the tournament term's own half-say points, read from the same constants the page
  // interpolates (HALF_SAY_TOURNAMENT_BATTLES, HALF_SAY_EVENTS), never typed as literal digits.
  it('explains the tournament curve, with its own half-say points', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(
        new RegExp(
          `at ${count(HALF_SAY_TOURNAMENT_BATTLES)} tournament ${battleWord(HALF_SAY_TOURNAMENT_BATTLES)} it has half the say`,
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`at ${count(HALF_SAY_EVENTS)} events? it also has half the`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/blend into PvPoke's side of the number first, on their own curve/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tournament win rates are never part of the ranking: pick share is/),
    ).toBeInTheDocument();
  });

  it('says plainly that nothing flips', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText(/Nothing flips\./)).toBeInTheDocument();
  });

  it('says a projection is never printed as a percentage', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(/this site never prints one as a percentage/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A projection is shown as a matchup score out of 100 instead/),
    ).toBeInTheDocument();
  });

  // Fix round 1, item 2: this passage used to claim the number is "worked out from PvPoke's own
  // matchup data" with no mention that the weighing is measured-aware, and it named only the
  // hard-loss half of the safety factor. Both are corrected here to match what buildBoard/
  // strengthOf actually do (strengthContext is called with the blended weights, and safety docks
  // for both a hard-losing switch and an unanswered top opponent).
  it('says the matchup score is weighted by measured play and names both safety terms', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(/weighted by how often each opponent is actually faced/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No battle result feeds it, only which opponents matter/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/whether a top opponent goes completely unanswered/),
    ).toBeInTheDocument();
  });

  it('explains cores and the inverted faced record', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText(/a pair counts as a core/)).toBeInTheDocument();
    expect(
      screen.getByText(/you winning means the team you faced lost that battle/),
    ).toBeInTheDocument();
  });

  // IMPORTANT 6: teamRank.ts's `projectCore` averages over the thirds actually seen with a core,
  // but falls back to PvPoke's own group, weighted by the blended weights, once a core has never
  // been seen complete (the COMMON case, since a third is only recorded when all three opponents
  // were logged, and the same paragraph says most players log one or two). The card itself
  // already says "Never seen complete. Projected against any third PvPoke would expect."; the
  // page has to say the same thing.
  it('says a core never seen complete is projected against PvPoke instead', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(/a core never seen complete is instead projected against PvPoke/),
    ).toBeInTheDocument();
  });

  // IMPORTANT 7: Teams.tsx's `recordLine` keeps the two battle counts apart ("Run N times and
  // faced M times") but merges the record itself into one line labelled "overall"
  // ("33-27 overall"), so "each card keeps the two counts apart so you can see which is which"
  // overclaimed: the counts are apart, the record is not. The page has to say both halves.
  it('says the battle counts are kept apart but the record is combined', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText(/keeps the battle counts apart/)).toBeInTheDocument();
    expect(
      screen.getByText(/combines the win-loss record into one line, labelled overall/),
    ).toBeInTheDocument();
  });

  it('says an epoch reset deletes nothing', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText(/Nothing is deleted/)).toBeInTheDocument();
  });

  it('lists the teams endpoint', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText(/\/api\/v1\/teams/)).toBeInTheDocument();
  });

  // Also-fix: "already public and needs no key" was true for a server but not for a browser page
  // on another origin, since workers/counter/src/index.ts's `cors()` answers with a fixed
  // allow-list, not a wildcard. The claim has to carry that distinction.
  it('is precise about who can actually read the api without a key', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText(/Reading needs no key/)).toBeInTheDocument();
    expect(screen.getByText(/limited by this site's CORS allow-list for now/)).toBeInTheDocument();
  });

  // Also-fix: `\s` in a JS regex matches a non-breaking space (U+00A0) and a few other characters
  // outside the printable ASCII range, so the guard used to let the single most likely smart
  // character (a pasted NBSP) straight through. `\n\r\t` names only the whitespace this page
  // actually uses. Attribute text (aria-label, title, alt) is checked too, since a screen reader
  // or a tooltip reads those the same as visible text.
  it('is strict 7-bit ASCII throughout, including attribute text', async () => {
    const { container } = render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await screen.findByText(/PvPoke rankings of/);
    expect(container.textContent ?? '').toMatch(/^[\x20-\x7e\n\r\t]*$/);
    for (const el of container.querySelectorAll('[aria-label], [title], [alt]')) {
      for (const attr of ['aria-label', 'title', 'alt']) {
        const value = el.getAttribute(attr);
        if (value !== null) {
          expect(value).toMatch(/^[\x20-\x7e\n\r\t]*$/);
        }
      }
    }
  });

  it('does not promise an api that does not exist yet', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText('Planned')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /request a key/i })).toBeNull();
  });

  it('stamps the PvPoke rankings it was built from', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText(/PvPoke rankings of 2026-09-10/)).toBeInTheDocument();
  });

  it('every section has its own heading', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    for (const name of [
      'What one shared battle contains',
      'Never collected',
      'How to contribute',
      'For other apps',
      'How to read the lists',
      'How the lists are built',
      'How the ranking works',
      'What "projected" means',
      'Teams and cores',
      'When the game changes',
    ]) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('links out to pick3 and to logging a battle', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('link', { name: 'Open pick3' })).toHaveAttribute(
      'href',
      'https://pick3.gg',
    );
    expect(screen.getByRole('link', { name: 'Log a battle' })).toHaveAttribute(
      'href',
      'https://pick3.gg/#/meta/log',
    );
  });
});
