import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { stubFetch } from './stubs/stubFetch.js';

const now = (): Date => new Date('2026-09-18T12:00:00.000Z');

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('data-theme');
  // jsdom keeps localStorage across cases in this file; the theme test would otherwise leak
  // its stored choice into whichever case runs after it.
  localStorage.clear();
});

describe('App', () => {
  it('lands on the first league and names the site', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByText('meta')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
  });

  it('switches league through the segmented control and puts it in the url', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Ultra' }));
    await waitFor(() => expect(window.location.pathname).toBe('/ultra'));
  });

  it('moves between the three tabs', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('link', { name: 'Teams' }));
    await waitFor(() => expect(window.location.pathname).toBe('/great/teams'));
    await userEvent.click(screen.getByRole('link', { name: 'About' }));
    await waitFor(() => expect(window.location.pathname).toBe('/about'));
  });

  it('keeps the filters in the url and reads them back', async () => {
    window.history.replaceState(null, '', '/great?w=7&band=legend');
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    expect(await screen.findByRole('radio', { name: '7 days' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Legend' })).toHaveAttribute('aria-checked', 'true');
  });

  it('answers the back button', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('link', { name: 'About' }));
    await waitFor(() => expect(window.location.pathname).toBe('/about'));
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/great'));
  });

  it('cycles the theme and remembers it', async () => {
    render(<App deps={{ fetcher: stubFetch({}), now }} />);
    await userEvent.click(await screen.findByRole('button', { name: /appearance/i }));
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark'),
    );
  });

  // The "says so, without blanking the page, when the api is down" case from the brief asserts
  // on Overview's real copy ("Could not load the shared battles. PvPoke's list is below; try
  // again in a moment." and a "PvPoke's meta group" heading), which is Task 10's content, not
  // this shell's placeholder. That assertion now lives in Task 10's own overview.test.tsx
  // (see task-10-brief.md, "Overview, when the api is down"), which will run against the real
  // screen once it exists.
});
