import 'fake-indexeddb/auto';
import { cpFor, type MoveChoice, type MovePool, type Specimen } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddPokemon } from '../src/screens/AddPokemon.tsx';
import { SpecimenRedirect } from '../src/screens/SpecimenRedirect.tsx';
import { emptyLayoutValue } from '../src/format.ts';
import {
  AppProvider,
  useActions,
  useAppState,
  type AppState,
  type Route,
} from '../src/state/store.tsx';
import { canGoBack, resetHistoryForTests } from '../src/state/history.ts';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

/** The form on its own route, the hand-off on an old Pokémon link, nothing anywhere else. */
function Gate() {
  const r = useAppState().route;
  if (r.screen === 'add') {
    return <AddPokemon key={r.edit ?? 'add'} />;
  }
  return r.screen === 'specimen' ? <SpecimenRedirect id={r.id} /> : null;
}

const IVS = { atk: 0, def: 15, sta: 15 };
const MARILL = { atk: 37, def: 93, hp: 172 };
const AZUMARILL = { atk: 112, def: 152, hp: 225 };

function specimen(
  id: string,
  speciesId: string,
  opts: { manual?: boolean; level?: number; cp?: number } = {},
): Specimen {
  const level = opts.level ?? 20;
  return {
    id,
    speciesId,
    familyId: speciesId,
    ivs: { ...IVS },
    level: { min: level, max: level },
    cp: opts.cp ?? 1400,
    hp: 150,
    shadow: speciesId.endsWith('_shadow'),
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-20 12:00:00',
    raw: {},
    ...(opts.manual ? { source: 'manual' } : {}),
  } as unknown as Specimen;
}

/** Azumarill, scanned; Clodsire, typed in; a Shadow Dragonite; a marked Mega Sableye; a Marill. */
const AZU = specimen('b', 'azumarill', { cp: cpFor(AZUMARILL, IVS, 20) });
const MANUAL = specimen('m', 'clodsire', { manual: true });
const SHADOW = specimen('h', 'dragonite_shadow');
const MARKED = { ...specimen('k', 'sableye', { level: 30 }), megaForm: 'mega' } as Specimen;
const BABY = specimen('y', 'marill', { cp: cpFor(MARILL, IVS, 20) });
const SPECIMENS = [AZU, MANUAL, SHADOW, MARKED, BABY];
const IDS = SPECIMENS.map((x) => x.id);

async function seed(specimens: Specimen[] = SPECIMENS): Promise<void> {
  await storage.saveCollection({
    specimens,
    report: {
      scansRead: specimens.length,
      recognized: specimens.length,
      duplicatesMerged: 0,
      missingIvs: { count: 0, names: [] },
      unrecognized: [],
      rowProblems: [],
      layout: emptyLayoutValue(),
      newestScan: '2026-09-20 12:00:00',
    },
    importedAt: '2026-09-20T12:00:00Z',
    fileName: null,
  });
}

/**
 * The fake data plus what Edit needs: base stats, an evolution (Marill into Azumarill), one Mega
 * (Tinkaton, Sableye's a supermega), two (Charizard), a supermega pair (Mewtwo).
 */
function withSpecies(): Parameters<typeof fakeHost>[0] {
  const base = fakeHost();
  return {
    ready: vi.fn(async () => {
      const r = await base.ready();
      const sp = (name: string, id: string, extra: object = {}) => ({
        name,
        types: ['dark', 'ghost'] as ['dark', 'ghost'],
        familyId: id,
        dex: 302,
        ...extra,
      });
      return {
        ...r,
        species: {
          ...r.species,
          azumarill: { ...r.species.azumarill!, baseStats: AZUMARILL },
          marill: sp('Marill', 'azumarill', { baseStats: MARILL, evolvesTo: ['azumarill'] }),
          sableye: sp('Sableye', 'sableye'),
          sableye_mega: sp('Sableye (Mega)', 'sableye', { megaOf: 'sableye', superMega: true }),
          tinkaton_mega: sp('Tinkaton (Mega)', 'tinkaton', { megaOf: 'tinkaton' }),
          charizard: sp('Charizard', 'charizard'),
          charizard_mega_x: sp('Charizard (Mega X)', 'charizard', { megaOf: 'charizard' }),
          charizard_mega_y: sp('Charizard (Mega Y)', 'charizard', { megaOf: 'charizard' }),
          mewtwo: sp('Mewtwo', 'mewtwo'),
          mewtwo_mega_x: sp('Mewtwo (Mega X)', 'mewtwo', { megaOf: 'mewtwo', superMega: true }),
          mewtwo_mega_y: sp('Mewtwo (Mega Y)', 'mewtwo', { megaOf: 'mewtwo', superMega: true }),
          bulbasaur: sp('Bulbasaur', 'bulbasaur'),
        },
        allSpecies: [...r.allSpecies, 'sableye', 'charizard', 'mewtwo', 'bulbasaur', 'marill'],
      };
    }),
  };
}

interface Typed {
  speciesId: string;
  ivs: { atk: number; def: number; sta: number };
  cp: number;
  lucky?: boolean;
  purified?: boolean;
  currentMoves?: { fast: string | null; charged: string[] };
  level?: number;
}

/** What the worker would make of the typed values: a fresh id, the hinted level or 21. */
const manual = (id = 'fresh') =>
  vi.fn(async (input: Typed) => {
    const level = input.level ?? 21;
    return {
      specimen: {
        ...specimen(id, input.speciesId, { manual: true, level }),
        ivs: input.ivs,
        cp: input.cp,
        lucky: input.lucky ?? false,
        purified: input.purified ?? false,
        currentMoves: input.currentMoves ?? { fast: null, charged: [] },
        scannedAt: '2026-10-01 09:00:00',
      } as Specimen,
      level,
      exactCp: true,
      matchedCp: input.cp,
    };
  });

function choice(moveId: string, name: string, extra: Partial<MoveChoice> = {}): MoveChoice {
  return {
    moveId,
    name,
    type: 'water',
    tm: 'tm',
    energy: 50,
    energyGain: 4,
    turns: 1,
    countFromFast: null,
    counts: null,
    effects: [],
    altType: null,
    ...extra,
  };
}

const POOL: MovePool = {
  fast: [choice('BUBBLE', 'Bubble'), choice('ROCK_SMASH', 'Rock Smash')],
  charged: [
    choice('ICE_BEAM', 'Ice Beam', { tm: 'elite', counts: [5, 4, 5] }),
    choice('PLAY_ROUGH', 'Play Rough', { counts: [7, 6, 7] }),
    choice('HYDRO_PUMP', 'Hydro Pump', { counts: [9, 9, 8] }),
  ],
  recommended: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
  source: 'rankings',
};

async function mount(
  more: Parameters<typeof fakeHost>[0] = {},
  specimens: Specimen[] = SPECIMENS,
): Promise<void> {
  await seed(specimens);
  render(
    <AppProvider host={fakeHost({ verdicts: vi.fn(async () => ({})), ...withSpecies(), ...more })}>
      <Probe />
      <Gate />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
    expect(latest?.state.collection).not.toBeNull();
  });
}

/** Boot as a normal visit (welcome hands off to Teams), then let that route settle. */
async function boot(more?: Parameters<typeof fakeHost>[0], specimens?: Specimen[]): Promise<void> {
  await mount(more, specimens);
  await waitFor(() => {
    expect(window.location.hash).toBe('#/teams');
    expect(latest?.state.route.screen).toBe('teams');
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function go(route: Route): Promise<void> {
  await act(async () => {
    latest!.actions.navigate(route);
  });
  await waitFor(() => expect(latest?.state.route.screen).toBe(route.screen));
}

/** Edit, opened from the copy's species page as the app opens it. */
async function openEdit(
  sp: Specimen,
  more?: Parameters<typeof fakeHost>[0],
  specimens?: Specimen[],
): Promise<void> {
  await boot(more, specimens);
  await go({ screen: 'species', id: sp.speciesId, copy: sp.id });
  await go({ screen: 'add', edit: sp.id });
  await waitFor(() => expect(field('CP').value).toBe(String(sp.cp)));
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const saveButton = () => screen.queryByRole('button', { name: 'Save changes' });
const type = async (label: string, value: string): Promise<void> => {
  await act(async () => {
    fireEvent.change(field(label), { target: { value } });
  });
};
const click = async (el: HTMLElement): Promise<void> => {
  await act(async () => {
    fireEvent.click(el);
  });
};
/** Save from the bar and wait for the form to hand back to the species page. */
const saveAndLeave = async (): Promise<void> => {
  await click(saveButton()!);
  await waitFor(() => expect(latest?.state.route.screen).toBe('species'));
};
const stored = async (id: string) =>
  (await storage.loadCollection())!.specimens.find((x) => x.id === id)!;

function fresh(): void {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetHistoryForTests();
  // A fresh first entry: no pick3 depth left over from an earlier test.
  window.history.replaceState(null, '', window.location.pathname);
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  latest = null;
}

describe('an old Pokémon link', () => {
  beforeEach(fresh);

  it('hands off to the copy on its own species page, taking the link place in history', async () => {
    await boot();
    await go({ screen: 'collection' });
    await go({ screen: 'specimen', id: 'b' });
    await waitFor(() =>
      expect(latest?.state.route).toEqual({ screen: 'species', id: 'azumarill', copy: 'b' }),
    );
    expect(window.location.hash).toBe('#/species/azumarill?copy=b');
    // The link is not left behind: one step back is the screen before it.
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('collection'));
  });

  it('a Shadow lands on its Shadow form page', async () => {
    await boot();
    await go({ screen: 'specimen', id: 'h' });
    await waitFor(() =>
      expect(latest?.state.route).toEqual({ screen: 'species', id: 'dragonite_shadow', copy: 'h' }),
    );
  });

  it('says so for a Pokémon that is gone, under the sub header', async () => {
    await boot();
    await go({ screen: 'specimen', id: 'nope' });
    expect(document.querySelector('.ui-empty')).toHaveTextContent(
      'That Pokémon is not in the current collection.',
    );
    const header = document.querySelector('header')!;
    expect(within(header).getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('on a fresh load, shows Loading, not "not in the collection", until the collection is read', async () => {
    await seed();
    window.location.hash = '#/collection/b';
    render(
      <AppProvider host={fakeHost({ verdicts: vi.fn(async () => ({})) })}>
        <Probe />
        <SpecimenRedirect id="b" />
      </AppProvider>,
    );
    expect(latest?.state.settingsLoaded).toBe(false);
    expect(document.querySelector('.ui-empty')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading your collection');
    await waitFor(() =>
      expect(latest?.state.route).toEqual({ screen: 'species', id: 'azumarill', copy: 'b' }),
    );
    expect(screen.queryByText('That Pokémon is not in the current collection.')).toBeNull();
  });
});

describe('Add a Pokémon', () => {
  beforeEach(fresh);

  async function openAdd(
    m: ReturnType<typeof manual>,
    pick: string,
    term: string,
    more: Parameters<typeof fakeHost>[0] = {},
  ): Promise<void> {
    await boot({ manual: m as never, ...more });
    await go({ screen: 'collection' });
    await go({ screen: 'add' });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search any Pokemon, e.g. shadow swampert'), {
        target: { value: term },
      });
    });
    await click(screen.getByRole('button', { name: pick }));
  }

  async function save(): Promise<void> {
    await type('CP', '1400');
    await click(screen.getByRole('button', { name: 'Add to my collection' }));
    await waitFor(() => expect(latest?.state.route.screen).toBe('species'));
  }

  const saved = () => stored('n');

  it('lands on the new Pokémon on its species page, which takes the form place in history', async () => {
    const m = manual('n');
    await openAdd(m, 'Clodsire', 'clod');
    // Adding has its own button; the save bar is Edit's.
    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).toBeNull();
    await save();
    expect(latest?.state.route).toEqual({ screen: 'species', id: 'clodsire', copy: 'n' });
    expect(window.location.hash).toBe('#/species/clodsire?copy=n');
    expect(m).toHaveBeenCalledOnce();
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('collection'));
  });

  it('opened with ?species= prefills that species, and an unknown one is ignored', async () => {
    await boot({ manual: manual('n') as never });
    await go({ screen: 'add', species: 'bulbasaur' });
    expect(await screen.findByText('Bulbasaur')).toBeInTheDocument();
    expect(screen.getByText('Change')).toBeInTheDocument();
    await go({ screen: 'teams' });
    await go({ screen: 'add', species: 'notamon' });
    expect(screen.queryByText('Change')).toBeNull();
  });

  it('does not prefill an id the picker cannot search (in species but not released)', async () => {
    const more = withSpecies() as { ready: ReturnType<typeof fakeHost>['ready'] };
    await boot({
      manual: manual('n') as never,
      ready: vi.fn(async () => {
        const r = await more.ready();
        return { ...r, allSpecies: r.allSpecies.filter((id: string) => id !== 'bulbasaur') };
      }),
    });
    await go({ screen: 'add', species: 'bulbasaur' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByText('Change')).toBeNull();
  });

  it('saves the moves ticked and Purified with the new Pokémon', async () => {
    const m = manual('n');
    await openAdd(m, 'Azumarill', 'azumarill', { movePool: vi.fn(async () => POOL) });
    // Not entered until a tick changes: the starred set is only what pick3 assumes.
    expect(await screen.findByText(/Moves not entered yet/)).toBeInTheDocument();
    await click(screen.getByRole('checkbox', { name: /Ice Beam/ }));
    await click(screen.getByRole('checkbox', { name: /Purified/ }));
    await save();
    expect(m.mock.calls[0]![0]).toMatchObject({
      speciesId: 'azumarill',
      purified: true,
      currentMoves: { fast: 'BUBBLE', charged: ['PLAY_ROUGH'] },
    });
    expect((await saved()).currentMoves).toEqual({ fast: 'BUBBLE', charged: ['PLAY_ROUGH'] });
    expect((await saved()).purified).toBe(true);
  });

  it('with the moves left alone, saves them as not entered', async () => {
    const m = manual('n');
    await openAdd(m, 'Azumarill', 'azumarill', { movePool: vi.fn(async () => POOL) });
    await screen.findByText(/Moves not entered yet/);
    await save();
    expect(m.mock.calls[0]![0].currentMoves).toEqual({ fast: null, charged: [] });
  });

  it('offers a checkbox for a species with one Mega, and saves megaForm mega', async () => {
    await openAdd(manual('n'), 'Tinkaton', 'tinkaton');
    const box = screen.getByRole('checkbox', { name: 'Mega-evolved before' });
    expect(screen.queryByRole('checkbox', { name: 'Mega Level 4' })).toBeNull();
    await click(box);
    expect(screen.queryByRole('checkbox', { name: 'Mega Level 4' })).toBeNull();
    await save();
    expect((await saved()).megaForm).toBe('mega');
    expect((await saved()).megaLevel4).toBeUndefined();
  });

  it('saves no mark when the box is left alone', async () => {
    await openAdd(manual('n'), 'Tinkaton', 'tinkaton');
    await save();
    expect((await saved()).megaForm ?? null).toBeNull();
  });

  it('offers none, Mega X and Mega Y for a species with two, and saves the choice', async () => {
    await openAdd(manual('n'), 'Charizard', 'charizard');
    const pick = screen.getByRole('combobox', { name: 'Mega-evolved before' });
    expect(
      within(pick)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['No', 'Mega X', 'Mega Y']);
    await act(async () => {
      fireEvent.change(pick, { target: { value: 'mega_y' } });
    });
    await save();
    expect((await saved()).megaForm).toBe('mega_y');
  });

  it('shows no Mega control for a species with no Mega, or for a Shadow', async () => {
    await openAdd(manual('n'), 'Bulbasaur', 'bulbasaur');
    expect(screen.queryByLabelText('Mega-evolved before')).toBeNull();
    expect(screen.queryByText('Mega')).toBeNull();
  });

  it('a Shadow has no Mega control and is never Purified', async () => {
    await openAdd(manual('n'), 'Shadow Dragonite', 'shadow dragonite');
    expect(screen.queryByLabelText('Mega-evolved before')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Purified/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Lucky/ })).toBeInTheDocument();
  });

  it('offers Mega Level 4 only once a supermega form is chosen, and saves it', async () => {
    await openAdd(manual('n'), 'Mewtwo', 'mewtwo');
    const pick = screen.getByRole('combobox', { name: 'Mega-evolved before' });
    expect(screen.queryByRole('checkbox', { name: 'Mega Level 4' })).toBeNull();
    await act(async () => {
      fireEvent.change(pick, { target: { value: 'mega_y' } });
    });
    await click(screen.getByRole('checkbox', { name: 'Mega Level 4' }));
    await save();
    const sp = await saved();
    expect(sp.megaForm).toBe('mega_y');
    expect(sp.megaLevel4).toBe(true);
  });

  it('drops Mega Level 4 when the mark is cleared', async () => {
    await openAdd(manual('n'), 'Mewtwo', 'mewtwo');
    const pick = screen.getByRole('combobox', { name: 'Mega-evolved before' });
    await act(async () => {
      fireEvent.change(pick, { target: { value: 'mega_x' } });
    });
    await click(screen.getByRole('checkbox', { name: 'Mega Level 4' }));
    await act(async () => {
      fireEvent.change(pick, { target: { value: '' } });
    });
    expect(screen.queryByRole('checkbox', { name: 'Mega Level 4' })).toBeNull();
    await save();
    const sp = await saved();
    expect(sp.megaForm ?? null).toBeNull();
    expect(sp.megaLevel4).toBeUndefined();
  });
});

describe('Edit', () => {
  beforeEach(fresh);

  it('opens filled in from the Pokémon, with nothing to save until something changes', async () => {
    await openEdit(AZU, { manual: manual() as never });
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.queryByText('Add a Pokémon')).toBeNull();
    expect(document.querySelector('.pick-slot')).toHaveTextContent('Azumarill');
    // The form edits the Pokémon, not which Pokémon it is: no search box, no Change.
    expect(screen.queryByPlaceholderText('Search any Pokemon, e.g. shadow swampert')).toBeNull();
    expect(screen.queryByText('Change')).toBeNull();
    expect(document.querySelector('.pick-slot')?.tagName).toBe('DIV');
    expect(field('Attack').value).toBe('0');
    expect(field('Defense').value).toBe('15');
    expect(field('HP').value).toBe('15');
    expect(screen.getByRole('checkbox', { name: /Lucky/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Purified/ })).not.toBeChecked();
    expect(saveButton()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to my collection' })).toBeNull();
  });

  it('a change brings up the save bar; Discard puts the stored values back and it goes', async () => {
    await openEdit(AZU, { manual: manual() as never });
    await type('CP', '1450');
    const bar = screen.getByRole('group', { name: 'Unsaved changes' });
    expect(within(bar).getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await click(within(bar).getByRole('button', { name: 'Discard' }));
    expect(field('CP').value).toBe(String(AZU.cp));
    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).toBeNull();
    // Typing the stored value back by hand is not a change either.
    await type('CP', '1450');
    await type('CP', String(AZU.cp));
    expect(saveButton()).toBeNull();
  });

  it('saves the new values in place and goes back to the species page that opened it', async () => {
    const m = manual();
    const verdicts = vi.fn(async () => ({}));
    await openEdit(AZU, { manual: m as never, verdicts });
    await type('CP', '1450');
    await saveAndLeave();
    expect(m).toHaveBeenCalledWith({
      speciesId: 'azumarill',
      ivs: { atk: 0, def: 15, sta: 15 },
      cp: 1450,
      lucky: false,
      purified: false,
      currentMoves: { fast: null, charged: [] },
      level: 20,
    });
    await waitFor(() =>
      expect(latest?.state.route).toEqual({ screen: 'species', id: 'azumarill', copy: 'b' }),
    );
    // Same id, same place, new values; nothing added.
    const saved = (await storage.loadCollection())!.specimens;
    expect(saved.map((x) => x.id)).toEqual(IDS);
    const b = saved.find((x) => x.id === 'b')!;
    expect(b.cp).toBe(1450);
    expect(b.level).toEqual({ min: 20, max: 20 });
    // Typing values in is not a scan: the scan date stays, and a scan stays a scan.
    expect(b.scannedAt).toBe('2026-09-20 12:00:00');
    expect(b.source).toBeUndefined();
    expect(b.editedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('opened straight from a link, lands on the species page with the copy shown', async () => {
    window.history.replaceState(null, '', '#/add?edit=b');
    await mount({ manual: manual() as never });
    await waitFor(() => expect(field('CP').value).toBe(String(AZU.cp)));
    expect(canGoBack()).toBe(false);
    await type('CP', '1450');
    await saveAndLeave();
    await waitFor(() =>
      expect(latest?.state.route).toEqual({ screen: 'species', id: 'azumarill', copy: 'b' }),
    );
  });

  it('Back with unsaved changes asks first; Keep editing stays, Discard leaves', async () => {
    await openEdit(AZU, { manual: manual() as never });
    await type('CP', '1450');
    await click(screen.getByRole('button', { name: 'Back' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(dialog).toHaveAccessibleDescription('What you changed here has not been saved.');
    await click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(latest?.state.route.screen).toBe('add');
    expect(field('CP').value).toBe('1450');
    await click(screen.getByRole('button', { name: 'Back' }));
    await click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(latest?.state.route.screen).toBe('species'));
    expect((await stored('b')).cp).toBe(AZU.cp);
  });

  it('Back with nothing changed just goes back', async () => {
    await openEdit(AZU, { manual: manual() as never });
    await click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(latest?.state.route.screen).toBe('species'));
  });

  it('shows the calculated level as CP and IVs change, and says when no level gives the CP', async () => {
    await openEdit(AZU, { manual: manual() as never });
    const level = (): string =>
      screen.getByText('Calculated level').closest('.kv')?.lastElementChild?.textContent ?? '';
    expect(level()).toBe('20');
    await type('CP', String(cpFor(AZUMARILL, IVS, 25)));
    expect(level()).toBe('25');
    expect(screen.queryByText(/No level gives exactly/)).toBeNull();
    const between = cpFor(AZUMARILL, IVS, 25) + 1;
    await type('CP', String(between));
    expect(
      screen.getByText(new RegExp(`No level gives exactly CP ${between} with those IVs`)),
    ).toBeInTheDocument();
    // Blank IVs: nothing to work a level out from.
    await type('Attack', '');
    expect(screen.queryByText('Calculated level')).toBeNull();
  });

  it('evolving keeps the id, level and IVs, sets the new CP and forgets the moves', async () => {
    const m = manual();
    const knows = {
      ...BABY,
      currentMoves: { fast: 'BUBBLE', charged: ['PLAY_ROUGH'] },
    } as Specimen;
    await openEdit(
      knows,
      { manual: m as never, movePool: vi.fn(async () => POOL) },
      SPECIMENS.map((x) => (x.id === 'y' ? knows : x)),
    );
    const pick = screen.getByRole('combobox', { name: 'Evolved it? Pick what it is now' });
    expect(
      within(pick)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Still Marill', 'Azumarill']);
    await act(async () => {
      fireEvent.change(pick, { target: { value: 'azumarill' } });
    });
    const evolvedCp = cpFor(AZUMARILL, IVS, 20);
    const slot = document.querySelector('.pick-slot')!;
    expect(slot).toHaveTextContent('Azumarill');
    expect(slot).toHaveTextContent('Evolved from Marill');
    expect(field('CP').value).toBe(String(evolvedCp));
    expect(
      screen.getByText(
        `It keeps its level and IVs. Its CP becomes ${evolvedCp} and its moves go back to not entered.`,
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Moves not entered yet/)).toBeInTheDocument();

    await saveAndLeave();
    expect(m.mock.calls[0]![0]).toEqual({
      speciesId: 'azumarill',
      ivs: IVS,
      cp: evolvedCp,
      lucky: false,
      purified: false,
      currentMoves: { fast: null, charged: [] },
      level: 20,
    });
    await waitFor(async () => expect((await stored('y')).speciesId).toBe('azumarill'));
    const y = await stored('y');
    expect(y.evolvedFrom).toBe('marill');
    expect(y.level).toEqual({ min: 20, max: 20 });
    expect(y.currentMoves).toEqual({ fast: null, charged: [] });
    expect((await storage.loadCollection())!.specimens.map((x) => x.id)).toEqual(IDS);
  });

  it('a CP typed after evolving is the one saved', async () => {
    const m = manual();
    await openEdit(BABY, { manual: m as never });
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: /Evolved it/ }), {
        target: { value: 'azumarill' },
      });
    });
    const powered = cpFor(AZUMARILL, IVS, 24);
    await type('CP', String(powered));
    expect(screen.getByText('Calculated level').closest('.kv')?.lastElementChild?.textContent).toBe(
      '24',
    );
    await saveAndLeave();
    expect(m.mock.calls[0]![0]).toMatchObject({ speciesId: 'azumarill', cp: powered });
  });

  it('"Still Marill" undoes the evolution: its own CP and moves come back, nothing to save', async () => {
    const knows = {
      ...BABY,
      currentMoves: { fast: 'BUBBLE', charged: ['PLAY_ROUGH'] },
    } as Specimen;
    await openEdit(
      knows,
      { manual: manual() as never, movePool: vi.fn(async () => POOL) },
      SPECIMENS.map((x) => (x.id === 'y' ? knows : x)),
    );
    const pick = screen.getByRole('combobox', { name: /Evolved it/ });
    await act(async () => {
      fireEvent.change(pick, { target: { value: 'azumarill' } });
    });
    expect(saveButton()).not.toBeNull();
    await act(async () => {
      fireEvent.change(pick, { target: { value: 'marill' } });
    });
    expect(field('CP').value).toBe(String(BABY.cp));
    expect(document.querySelector('.pick-slot')).not.toHaveTextContent('Evolved from');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Play Rough/ })).toBeChecked());
    expect(saveButton()).toBeNull();
  });

  it('a Pokémon that does not evolve has no evolve select; one evolved here says what it was', async () => {
    const evolved = { ...AZU, evolvedFrom: 'marill' } as Specimen;
    await openEdit(
      evolved,
      { manual: manual() as never },
      SPECIMENS.map((x) => (x.id === 'b' ? evolved : x)),
    );
    expect(screen.queryByRole('combobox', { name: /Evolved it/ })).toBeNull();
    expect(document.querySelector('.pick-slot')).toHaveTextContent('Evolved from Marill');
  });

  it('moves: the starred set is assumed until entered; entering, changing and clearing them', async () => {
    const m = manual();
    await openEdit(AZU, { manual: m as never, movePool: vi.fn(async () => POOL) });
    expect(
      await screen.findByText('Moves not entered yet. pick3 assumes the starred moves.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Bubble/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ice Beam/ })).toBeChecked();
    expect(saveButton()).toBeNull();

    // Confirming the starred set enters it: that is a change to save.
    await click(screen.getByRole('button', { name: 'These are its moves' }));
    expect(
      screen.getByText('pick3 uses these to work out what the recommended moves would cost.'),
    ).toBeInTheDocument();
    expect(saveButton()).not.toBeNull();

    // Two charged moves ticked: a third waits until one is unticked.
    expect(screen.getByRole('checkbox', { name: /Hydro Pump/ })).toBeDisabled();
    await click(screen.getByRole('checkbox', { name: /Ice Beam/ }));
    await click(screen.getByRole('checkbox', { name: /Hydro Pump/ }));
    await click(screen.getByRole('radio', { name: /Rock Smash/ }));

    // Clearing goes back to not entered, which is what is stored: nothing to save.
    await click(screen.getByRole('button', { name: 'Clear moves' }));
    expect(screen.getByText(/Moves not entered yet/)).toBeInTheDocument();
    expect(saveButton()).toBeNull();

    await click(screen.getByRole('checkbox', { name: /Ice Beam/ }));
    await saveAndLeave();
    expect(m.mock.calls[0]![0].currentMoves).toEqual({ fast: 'BUBBLE', charged: ['PLAY_ROUGH'] });
    await waitFor(async () =>
      expect((await stored('b')).currentMoves).toEqual({ fast: 'BUBBLE', charged: ['PLAY_ROUGH'] }),
    );
  });

  it('asks for the move counts again when the fast move changes', async () => {
    const movePool = vi.fn(async () => POOL);
    await openEdit(AZU, { manual: manual() as never, movePool });
    await screen.findByText(/Moves not entered yet/);
    expect(movePool).toHaveBeenLastCalledWith(
      'azumarill',
      null,
      { fast: null, charged: [] },
      { allowEliteTm: true },
    );
    await click(screen.getByRole('radio', { name: /Rock Smash/ }));
    await waitFor(() =>
      expect(movePool).toHaveBeenLastCalledWith(
        'azumarill',
        'ROCK_SMASH',
        { fast: null, charged: [] },
        { allowEliteTm: true },
      ),
    );
  });

  it('keeps Frustration through an edit that does not touch the moves', async () => {
    const m = manual();
    const frustrated = {
      ...SHADOW,
      currentMoves: { fast: 'BUBBLE', charged: ['FRUSTRATION'] },
    } as Specimen;
    await openEdit(
      frustrated,
      { manual: m as never, movePool: vi.fn(async () => POOL) },
      SPECIMENS.map((x) => (x.id === 'h' ? frustrated : x)),
    );
    await screen.findByRole('radio', { name: /Bubble/ });
    await click(screen.getByRole('checkbox', { name: /Lucky/ }));
    await saveAndLeave();
    expect(m.mock.calls[0]![0].currentMoves).toEqual({ fast: 'BUBBLE', charged: ['FRUSTRATION'] });
  });

  it('Purified is a tick for a Pokémon that is not a Shadow, and is saved', async () => {
    const m = manual();
    await openEdit(AZU, { manual: m as never });
    await click(screen.getByRole('checkbox', { name: /Purified/ }));
    await saveAndLeave();
    expect(m.mock.calls[0]![0]).toMatchObject({ purified: true });
    await waitFor(async () => expect((await stored('b')).purified).toBe(true));
  });

  it('a Shadow has no Purified tick', async () => {
    await openEdit(SHADOW, { manual: manual() as never });
    expect(screen.queryByRole('checkbox', { name: /Purified/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Lucky/ })).toBeInTheDocument();
  });

  it('keeps the Mega mark it was saved with unless the form changes it', async () => {
    await openEdit(MARKED, { manual: manual() as never });
    const box = await screen.findByRole('checkbox', { name: 'Mega-evolved before' });
    await waitFor(() => expect(box).toBeChecked());
    // Level 4 lives here now: a marked supermega offers it.
    await click(screen.getByRole('checkbox', { name: 'Mega Level 4' }));
    await saveAndLeave();
    await waitFor(async () => expect((await stored('k')).megaLevel4).toBe(true));
    expect((await stored('k')).megaForm).toBe('mega');
  });

  it('leaves the IVs blank for a Pokémon whose IVs never came through, until typed in', async () => {
    const noIvs = { ...specimen('r', 'azumarill'), ivs: null } as unknown as Specimen;
    await openEdit(noIvs, { manual: manual() as never }, [...SPECIMENS, noIvs]);
    expect(field('Attack').value).toBe('');
    expect(saveButton()).toBeNull();
    await type('Attack', '12');
    // Something changed, but it cannot be saved with IVs missing; Discard still works.
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();
    await type('Defense', '14');
    await type('HP', '13');
    await saveAndLeave();
    await waitFor(async () =>
      expect((await stored('r')).ivs).toEqual({ atk: 12, def: 14, sta: 13 }),
    );
  });

  it('says so for an id the collection does not have', async () => {
    await boot();
    await go({ screen: 'add', edit: 'nope' });
    expect(
      await screen.findByText('That Pokémon is not in the current collection.'),
    ).toBeInTheDocument();
    expect(saveButton()).toBeNull();
  });
});

describe('editing through the store', () => {
  beforeEach(fresh);

  it('an edit that sends no moves or Purified keeps the copy own', async () => {
    const knows = {
      ...AZU,
      purified: true,
      currentMoves: { fast: 'BUBBLE', charged: ['PLAY_ROUGH'] },
    } as Specimen;
    await boot(
      { manual: manual() as never },
      SPECIMENS.map((x) => (x.id === 'b' ? knows : x)),
    );
    await act(async () => {
      await latest!.actions.updateManual('b', { speciesId: 'azumarill', ivs: IVS, cp: 1450 });
    });
    const b = await stored('b');
    expect(b.purified).toBe(true);
    expect(b.currentMoves).toEqual({ fast: 'BUBBLE', charged: ['PLAY_ROUGH'] });
  });

  it("gives a Pokémon typed in with an edited copy's old values an id of its own", async () => {
    // The worker's id comes from the values: Azumarill 0/15/15 at its scanned CP is "b".
    const m = vi.fn(async (input: Typed) => ({
      specimen: {
        ...specimen('b', input.speciesId, { manual: true, level: input.cp === AZU.cp ? 20 : 21 }),
        ivs: input.ivs,
        cp: input.cp,
      } as Specimen,
      level: 20,
      exactCp: true,
      matchedCp: input.cp,
    }));
    await boot({ manual: m as never });
    await act(async () => {
      await latest!.actions.updateManual('b', { speciesId: 'azumarill', ivs: IVS, cp: 1450 });
    });
    await act(async () => {
      await latest!.actions.addManual({ speciesId: 'azumarill', ivs: IVS, cp: AZU.cp });
    });
    let saved = (await storage.loadCollection())!.specimens;
    expect(saved).toHaveLength(SPECIMENS.length + 1);
    expect(saved.find((x) => x.id === 'b')?.cp).toBe(1450);
    expect(saved.find((x) => x.id.startsWith('b-'))?.cp).toBe(AZU.cp);
    // Typed in again with the values it has now, the copy is replaced, not doubled.
    await act(async () => {
      await latest!.actions.addManual({ speciesId: 'azumarill', ivs: IVS, cp: 1450 });
    });
    saved = (await storage.loadCollection())!.specimens;
    expect(saved).toHaveLength(SPECIMENS.length + 1);
  });

  it('drops a verdict run that started before an edit and judges the edited copy', async () => {
    const noIvs = { ...specimen('r', 'azumarill'), ivs: null } as unknown as Specimen;
    let first: (v: Record<string, never>) => void = () => undefined;
    const verdicts = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
      .mockImplementation(async () => ({}));
    await boot({ manual: manual() as never, verdicts }, [...SPECIMENS, noIvs]);
    await act(async () => {
      void latest!.actions.loadVerdicts();
    });
    await waitFor(() => expect(verdicts).toHaveBeenCalledTimes(1));
    await act(async () => {
      await latest!.actions.updateManual('r', {
        speciesId: 'azumarill',
        ivs: { atk: 10, def: 10, sta: 10 },
        cp: 1400,
      });
    });
    // The run over the old values lands now: the edited copy is judged again.
    await act(async () => {
      first({});
    });
    await waitFor(() => expect(verdicts).toHaveBeenCalledTimes(2));
    const judged = verdicts.mock.calls[1]![0] as Specimen[];
    expect(judged.find((x) => x.id === 'r')?.ivs).toEqual({ atk: 10, def: 10, sta: 10 });
  });
});
