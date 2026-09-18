import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { resetBaselines } from '../src/baseline.js';
import { resetStatic } from '../src/data.js';
import { battleWord, count, plural } from '../src/format.js';
import { MEASURED_MIN, MEASURED_MIN_DEVICES, WIN_RATE_MIN } from '../src/rank.js';
import { TREND_MIN } from '../src/stats.js';
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

  // rank.ts's MEASURED_MIN and MEASURED_MIN_DEVICES both gate the measured list; a league can
  // clear the battle count alone and still show PvPoke's list, so the page has to name the
  // device floor too, not just the battle one. stats.ts's TREND_MIN and rank.ts's WIN_RATE_MIN
  // are the other two thresholds this card promises. These assertions read the same constants
  // the page interpolates, not typed-out digits: if one of the four ever changes, the page's
  // prose changes with it and this test keeps passing, or the page falls out of sync with the
  // constant and this test is the thing that catches it, never a pair of literals that quietly
  // agree with each other while disagreeing with the code.
  it('explains the thresholds in the same numbers the code uses', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(
      await screen.findByText(
        new RegExp(`${count(MEASURED_MIN)} or more counted ${battleWord(MEASURED_MIN)}`),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(
          `${count(MEASURED_MIN_DEVICES)} or more ${plural(MEASURED_MIN_DEVICES, 'device', 'devices')}`,
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`fewer than ${count(WIN_RATE_MIN)} decided ${battleWord(WIN_RATE_MIN)}`),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`at least ${count(TREND_MIN)} ${battleWord(TREND_MIN)}`)),
    ).toBeInTheDocument();
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
