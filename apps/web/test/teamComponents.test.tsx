import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { getDefaultNormalizer, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { TeamCardBody } from '../src/components/team/TeamCardBody.tsx';
import { TeamRowSummary } from '../src/components/team/TeamRowSummary.tsx';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';
import { makeTeam } from './teamFixture.ts';

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

/**
 * TeamRowSummary and TeamCardBody call useName() and PokemonToken, which read the app store, so
 * each render is wrapped in AppProvider the way apps/web/test/teamsHeader.test.tsx does. Waiting
 * for settingsLoaded (not just boot-ready) sidesteps a known race between the two in store.tsx.
 * The fixture's species ids (e.g. "snorlax") are not in fakeHost's species map, so names fall
 * back to the id verbatim; assertions below match names case-insensitively.
 */
async function mount(node: ReactNode) {
  latest = null;
  // The same host is reused for a rerender, so AppProvider (whose boot effect only ever runs
  // once, empty deps) is never remounted mid-test.
  const host = fakeHost();
  const wrap = (n: ReactNode) => (
    <AppProvider host={host}>
      <Probe />
      {n}
    </AppProvider>
  );
  const utils = render(wrap(node));
  await waitFor(() => {
    expect(latest?.boot).toBe('ready');
    expect(latest?.settingsLoaded).toBe(true);
  });
  return { ...utils, rerenderTeam: (next: ReactNode) => utils.rerender(wrap(next)) };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('TeamRowSummary', () => {
  it('names the three Pokémon and says the number, fit, difficulty and Stardust in one line', async () => {
    await mount(<TeamRowSummary team={makeTeam()} />);
    expect(
      screen.getByText(/^88\u00a0· Strong fit\u00a0· Moderate\u00a0· 263,900 Stardust$/, {
        normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('team-summary-names').textContent).toMatch(/snorlax/i);
  });

  it('holds no buttons or links, so it can sit inside the row toggle', async () => {
    const { container } = await mount(<TeamRowSummary team={makeTeam()} />);
    expect(container.querySelector('button, a')).toBeNull();
  });
});

describe('TeamCardBody', () => {
  it('shows fit, structure as a tap-to-define term, difficulty and its reason, and the cost', async () => {
    await mount(<TeamCardBody team={makeTeam({ structure: 'ABC' })} />);
    expect(screen.getByText('Strong fit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Balanced ABC' })).toHaveAttribute(
      'data-inline-control',
    );
    expect(screen.getByText('Moderate to play')).toBeInTheDocument();
    expect(screen.getByText('Snorlax needs to bait one shield.')).toBeInTheDocument();
    // Whitespace left as rendered: the default normalizer would fold the non-breaking spaces away.
    expect(
      screen.getByText(/263,900\u00a0Stardust\u00a0· 255\u00a0Candy\u00a0· 1\u00a0Elite\u00a0TM/, {
        normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
      }),
    ).toBeInTheDocument();
  });

  it('names the ABB line structure the same way', async () => {
    await mount(<TeamCardBody team={makeTeam({ structure: 'ABB' })} />);
    expect(screen.getByRole('button', { name: 'ABB line' })).toBeInTheDocument();
  });

  it('shows the role legend only when asked', async () => {
    const { rerenderTeam } = await mount(<TeamCardBody team={makeTeam()} />);
    expect(screen.queryByText(/Lead opens the battle/)).toBeNull();
    rerenderTeam(<TeamCardBody team={makeTeam()} legend />);
    expect(screen.getByText(/Lead opens the battle/)).toBeInTheDocument();
  });

  it('lists the three roles in battle order', async () => {
    await mount(<TeamCardBody team={makeTeam()} />);
    const roles = screen.getAllByText(/^(Lead|Safe Switch|Closer)$/).map((e) => e.textContent);
    expect(roles).toEqual(['Lead', 'Safe Switch', 'Closer']);
  });
});
