import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, waitFor, within } from '@testing-library/react';
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
  it('shows the Mega sprite and a badge named Mega', async () => {
    const { container } = await mount(<PokemonToken speciesId="sableye_mega" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/data/sprites/sableye_mega.webp',
    );
    expect(within(container).getByRole('img', { name: 'Mega' })).toBeInTheDocument();
  });

  it('has no Mega badge on the base form', async () => {
    const { container } = await mount(<PokemonToken speciesId="sableye" />);
    expect(within(container).queryByRole('img', { name: 'Mega' })).toBeNull();
  });

  it('badges a base form the collection marks as a Mega', async () => {
    const { container } = await mount(<PokemonToken speciesId="sableye" markedMega />);
    expect(within(container).getByRole('img', { name: 'Mega' })).toBeInTheDocument();
  });

  it('badges a small token too, the glyph never under 12px', async () => {
    const { container } = await mount(<PokemonToken speciesId="sableye_mega" size={20} />);
    const svg = within(container).getByRole('img', { name: 'Mega' }).querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('12');
  });

  it('gives every glyph on the page its own gradient', async () => {
    const { container } = await mount(
      <>
        <PokemonToken speciesId="sableye_mega" />
        <PokemonToken speciesId="sableye_mega" />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(container.querySelector(`circle[fill="url(#${id})"]`)).not.toBeNull();
    }
  });

  it('names the Mega with the word first', async () => {
    const { getByTestId } = await mount(<Name id="sableye_mega" />);
    expect(getByTestId('name').textContent).toBe('Mega Sableye');
  });
});
