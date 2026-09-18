import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedTeam } from '../src/screens/SharedTeam.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

describe('shared team link', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    // recordError's device summary reads matchMedia, which jsdom does not implement.
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  it('fills Build with the three as species picks and runs the analysis', async () => {
    const analyze = vi.fn(async () => {
      throw new Error('stop here');
    });
    render(
      <AppProvider host={fakeHost({ analyze })}>
        <SharedTeam
          league="great"
          members="azumarill.BUBBLE.ICE_BEAM.PLAY_ROUGH+tinkaton+clodsire"
        />
      </AppProvider>,
    );
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    const picks = (analyze.mock.calls[0] as unknown[])[0];
    expect(picks).toEqual([
      {
        kind: 'species',
        id: 'azumarill',
        preferOwned: true,
        moves: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
      },
      { kind: 'species', id: 'tinkaton', preferOwned: true },
      { kind: 'species', id: 'clodsire', preferOwned: true },
    ]);
    // The engine's complaint reaches the screen with a way into Build.
    await waitFor(() => expect(screen.getByText('stop here')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Open in Build' })).toBeInTheDocument();
  });

  it('explains a link with a Pokemon pick3 does not know', async () => {
    const analyze = vi.fn();
    render(
      <AppProvider host={fakeHost({ analyze })}>
        <SharedTeam league="great" members="azumarill+missingno+clodsire" />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByText(/does not know missingno/)).toBeInTheDocument());
    expect(analyze).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Build a team' })).toBeInTheDocument();
  });
});
