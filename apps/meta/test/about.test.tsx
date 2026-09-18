import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { resetBaselines } from '../src/baseline.js';
import { resetStatic } from '../src/data.js';
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

  // rank.ts's MEASURED_MIN (300 battles) and MEASURED_MIN_DEVICES (5 devices) both gate the
  // measured list; a league can clear the battle count alone and still show PvPoke's list, so
  // the page has to name the device floor too, not just the battle one. stats.ts's TREND_MIN
  // (200) and rank.ts's WIN_RATE_MIN (30) are the other two thresholds this card promises.
  it('explains the thresholds in the same numbers the code uses', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText(/300 or more counted battles/)).toBeInTheDocument();
    expect(screen.getByText(/5 or more devices/)).toBeInTheDocument();
    expect(screen.getByText(/fewer than 30 decided battles/)).toBeInTheDocument();
    expect(screen.getByText(/at least 200 battles/)).toBeInTheDocument();
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
