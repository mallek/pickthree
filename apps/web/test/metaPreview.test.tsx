import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaPreview } from '../src/components/MetaPreview.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { fakeHost } from './fakeHost.ts';

/** The card is rendered inside the provider so PokemonToken and useName have a store to read. */
function mount() {
  return render(
    <AppProvider host={fakeHost()}>
      <MetaPreview />
    </AppProvider>,
  );
}

function reply(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MetaPreview', () => {
  it('always offers a way into the meta site, whatever the network did', async () => {
    vi.stubGlobal('fetch', reply({ battles: 0, species: [] }));
    mount();
    const link = await screen.findByRole('link');
    expect(link.getAttribute('href')).toBe('https://meta.pick3.gg');
    expect(screen.getByText(/Explore the live meta/)).toBeTruthy();
  });

  it('ranks by sightings and reports share of battles, not of sightings', async () => {
    vi.stubGlobal(
      'fetch',
      reply({
        battles: 40,
        species: [
          { speciesId: 'azumarill', sightings: 4 },
          { speciesId: 'snorlax', sightings: 10 },
          { speciesId: 'medicham', sightings: 6 },
          { speciesId: 'lickitung', sightings: 1 },
        ],
      }),
    );
    mount();
    // 10 of 40 battles is 25 per cent. Share of total sightings (21) would have been 48.
    await waitFor(() => expect(screen.getByText('25%')).toBeTruthy());
    expect(screen.getByText('15%')).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();
    // Only the top three, so the fourth species is left off.
    expect(screen.queryByText('3%')).toBeNull();
  });

  it('says so plainly when the window holds no battles', async () => {
    vi.stubGlobal('fetch', reply({ battles: 0, species: [] }));
    mount();
    await waitFor(() => expect(screen.getByText(/No battles logged in this window/)).toBeTruthy());
  });

  it('degrades to a note rather than an empty card when the request fails', async () => {
    vi.stubGlobal('fetch', reply({ error: 'nope' }, false));
    mount();
    await waitFor(() => expect(screen.getByText(/Could not load the latest numbers/)).toBeTruthy());
    expect(screen.getByText(/Explore the live meta/)).toBeTruthy();
  });

  it('asks the counter worker for a great league window', async () => {
    const f = reply({ battles: 0, species: [] });
    vi.stubGlobal('fetch', f);
    mount();
    await waitFor(() => expect(f).toHaveBeenCalled());
    const first = f.mock.calls[0] as unknown as [string] | undefined;
    const url = new URL(String(first?.[0]));
    expect(url.pathname).toBe('/api/v1/meta');
    expect(url.searchParams.get('league')).toBe('great');
    expect(Date.parse(url.searchParams.get('since') ?? '')).toBeLessThan(
      Date.parse(url.searchParams.get('until') ?? ''),
    );
  });
});
