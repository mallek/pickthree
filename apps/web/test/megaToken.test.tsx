import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PokemonToken, useName } from '../src/components.tsx';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}
function Name({ id }: { id: string }) {
  return <span data-testid="name">{useName()(id)}</span>;
}

function megaHost() {
  const base = fakeHost();
  return fakeHost({
    ready: vi.fn(async () => {
      const r = await base.ready();
      return {
        ...r,
        species: {
          ...r.species,
          sableye: { name: 'Sableye', types: ['dark', 'ghost'], familyId: 'sableye', dex: 302 },
          sableye_mega: {
            name: 'Sableye (Mega)',
            types: ['dark', 'ghost'],
            familyId: 'sableye',
            dex: 302,
            megaOf: 'sableye',
          },
        },
        allSpecies: [...r.allSpecies, 'sableye', 'sableye_mega'],
      };
    }),
  });
}

async function mount(node: ReactNode) {
  latest = null;
  const utils = render(
    <AppProvider host={megaHost()}>
      <Probe />
      {node}
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.boot).toBe('ready');
    expect(latest?.settingsLoaded).toBe(true);
  });
  return utils;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('Mega token', () => {
  it('shows the Mega sprite and a Mega pill', async () => {
    const { container } = await mount(<PokemonToken speciesId="sableye_mega" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/data/sprites/sableye_mega.webp',
    );
    expect(container.querySelector('.token-mega-pill')?.textContent).toBe('Mega');
  });

  it('has no Mega pill on the base form', async () => {
    const { container } = await mount(<PokemonToken speciesId="sableye" />);
    expect(container.querySelector('.token-mega-pill')).toBeNull();
  });

  it('names the Mega with the word first', async () => {
    const { getByTestId } = await mount(<Name id="sableye_mega" />);
    expect(getByTestId('name').textContent).toBe('Mega Sableye');
  });
});
