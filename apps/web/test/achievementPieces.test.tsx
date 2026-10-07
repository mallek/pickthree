import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementsView } from '../src/achievements/AchievementsProvider.tsx';
import { AchievementToast } from '../src/components/achievements/AchievementToast.tsx';
import { BlankToken, RewardToken, SilhouetteSlot } from '../src/components/achievements/tokens.tsx';
import { WelcomeReveal } from '../src/components/achievements/WelcomeReveal.tsx';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

function emptyView(): AchievementsView {
  return {
    loaded: true,
    record: { earned: [], marks: [] } as unknown as AchievementsView['record'],
    statuses: [],
    earnedCount: 0,
    total: 11,
    shinyCount: 0,
    nudge: null,
    toast: null,
    reveal: null,
    dismissToast: vi.fn(),
    closeReveal: vi.fn(),
  };
}

const view: { current: AchievementsView } = { current: emptyView() };

// The real provider is swapped for a pass-through so each test chooses what the pieces see.
vi.mock('../src/achievements/AchievementsProvider.tsx', () => ({
  AchievementsProvider: ({ children }: { children: ReactNode }) => children,
  useAchievements: () => view.current,
}));

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

function achievementHost() {
  const base = fakeHost();
  return fakeHost({
    ready: vi.fn(async () => {
      const r = await base.ready();
      return {
        ...r,
        species: {
          ...r.species,
          bulbasaur: {
            name: 'Bulbasaur',
            types: ['grass', 'poison'],
            familyId: 'bulbasaur',
            dex: 1,
          },
          lapras: { name: 'Lapras', types: ['water', 'ice'], familyId: 'lapras', dex: 131 },
        },
      };
    }),
  });
}

async function mount(node: ReactNode) {
  latest = null;
  const utils = render(
    <AppProvider host={achievementHost()}>
      <Probe />
      {node}
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
  });
  return utils;
}

const FIRST = { id: 'first-battle', species: 'bulbasaur', shiny: false, earnedAt: 'x' };
const LAPRAS = { id: 'back-again', species: 'lapras', shiny: true, earnedAt: 'x' };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  window.location.hash = '';
  view.current = emptyView();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AchievementToast', () => {
  it('shows the earned toast with the Pokemon and opens the page on See it', async () => {
    view.current = {
      ...emptyView(),
      toast: { kind: 'earned', name: 'First battle', earned: FIRST },
    };
    await mount(<AchievementToast />);
    expect(screen.getByRole('status')).toHaveTextContent('First battle. You got Bulbasaur.');
    fireEvent.click(screen.getByRole('button', { name: 'See it' }));
    expect(window.location.hash).toBe('#/achievements?row=first-battle');
    expect(view.current.dismissToast).toHaveBeenCalled();
  });

  it('says a shiny in the line and shows the badge', async () => {
    view.current = {
      ...emptyView(),
      toast: { kind: 'earned', name: 'Back again', earned: LAPRAS },
    };
    await mount(<AchievementToast />);
    expect(screen.getByRole('status')).toHaveTextContent('Back again. You got a shiny Lapras.');
    expect(screen.getByRole('img', { name: 'Shiny' })).toBeInTheDocument();
  });

  it('shows the nudge and dismisses it on a tap', async () => {
    view.current = {
      ...emptyView(),
      toast: { kind: 'nudge', line: 'Next: Three-peat. Log a battle next season.' },
    };
    await mount(<AchievementToast />);
    fireEvent.click(screen.getByRole('button', { name: /Next: Three-peat/ }));
    expect(view.current.dismissToast).toHaveBeenCalled();
  });

  it('dismisses an earned toast after eight seconds and a nudge after three', async () => {
    const timer = vi.spyOn(window, 'setTimeout');
    const delays = () => timer.mock.calls.map((c) => c[1]);
    view.current = {
      ...emptyView(),
      toast: { kind: 'earned', name: 'First battle', earned: FIRST },
    };
    const first = await mount(<AchievementToast />);
    expect(delays()).toContain(8000);
    first.unmount();
    timer.mockClear();
    view.current = { ...emptyView(), toast: { kind: 'nudge', line: 'Next: Three-peat.' } };
    await mount(<AchievementToast />);
    expect(delays()).toContain(3000);
    expect(delays()).not.toContain(8000);
    timer.mockRestore();
  });

  it('keeps its clock when the view recomputes while it is up', async () => {
    const timer = vi.spyOn(window, 'setTimeout');
    const clear = vi.spyOn(window, 'clearTimeout');
    view.current = {
      ...emptyView(),
      toast: { kind: 'earned', name: 'First battle', earned: FIRST },
    };
    await mount(<AchievementToast />);
    const armed = () => timer.mock.calls.filter((c) => c[1] === 8000);
    expect(armed()).toHaveLength(1);
    const cleared = clear.mock.calls.length;
    // An evaluation landing: a new view object with the same toast and the same handlers.
    view.current = { ...view.current };
    act(() => {
      latest?.actions.navigate({ screen: 'teams' });
    });
    expect(armed()).toHaveLength(1);
    expect(clear.mock.calls.length).toBe(cleared);
    const fire = armed()[0]?.[0] as () => void;
    fire();
    expect(view.current.dismissToast).toHaveBeenCalledTimes(1);
    timer.mockRestore();
    clear.mockRestore();
  });

  it('waits while the app notice is up', async () => {
    view.current = {
      ...emptyView(),
      toast: { kind: 'earned', name: 'First battle', earned: FIRST },
    };
    await mount(<AchievementToast />);
    expect(screen.getByRole('status')).toHaveTextContent('First battle');
    act(() => {
      latest?.actions.notify('Battle logged', 'info');
    });
    expect(screen.queryByText(/First battle/)).not.toBeInTheDocument();
    act(() => {
      latest?.actions.notify(null);
    });
    expect(screen.getByRole('status')).toHaveTextContent('First battle');
  });
});

describe('AchievementToast waiting', () => {
  it('waits while the reveal is open', async () => {
    view.current = {
      ...emptyView(),
      toast: { kind: 'earned', name: 'First battle', earned: FIRST },
      reveal: { title: '2 new achievements', firstRun: false, items: [] },
    };
    await mount(<AchievementToast />);
    expect(screen.queryByText(/First battle/)).not.toBeInTheDocument();
  });

  it('waits while an app sheet is open', async () => {
    view.current = {
      ...emptyView(),
      toast: { kind: 'earned', name: 'First battle', earned: FIRST },
    };
    await mount(<AchievementToast />);
    expect(screen.getByRole('status')).toHaveTextContent('First battle');
    act(() => {
      latest?.actions.openSheet();
    });
    expect(screen.queryByText(/First battle/)).not.toBeInTheDocument();
    act(() => {
      latest?.actions.closeSheet();
    });
    expect(screen.getByRole('status')).toHaveTextContent('First battle');
  });
});

describe('RewardToken', () => {
  it('marks a shiny with the Shiny badge and the shiny picture', async () => {
    const { container } = await mount(<RewardToken species="lapras" shiny size={36} />);
    expect(within(container).getByRole('img', { name: 'Shiny' })).toBeInTheDocument();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/data/sprites/shiny/lapras.webp',
    );
  });

  it('has no badge and the normal picture when not shiny', async () => {
    const { container } = await mount(<RewardToken species="lapras" size={36} />);
    expect(within(container).queryByRole('img', { name: 'Shiny' })).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/data/sprites/lapras.webp');
  });
});

describe('WelcomeReveal', () => {
  it('shows the reveal title and one token per Pokemon', async () => {
    view.current = {
      ...emptyView(),
      reveal: {
        title: 'You have earned 2 already',
        firstRun: true,
        items: [
          { earned: FIRST, name: 'First battle' },
          { earned: LAPRAS, name: 'Back again' },
        ],
      },
    };
    await mount(<WelcomeReveal />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('You have earned 2 already')).toBeInTheDocument();
    expect(within(dialog).getByText(/Your battle log counts from the start/)).toBeInTheDocument();
    expect(within(dialog).getByText('Bulbasaur')).toBeInTheDocument();
    expect(within(dialog).getByText('Shiny Lapras')).toBeInTheDocument();
    expect(within(dialog).getByText('First battle')).toBeInTheDocument();
    expect(within(dialog).getByText('Back again')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('img', { name: /Bulbasaur|Lapras/ })).toHaveLength(2);
  });

  it('drops the battle log line when it is not the first run', async () => {
    view.current = {
      ...emptyView(),
      reveal: {
        title: '2 new achievements',
        firstRun: false,
        items: [{ earned: FIRST, name: 'First battle' }],
      },
    };
    await mount(<WelcomeReveal />);
    expect(screen.getByText('Each one gave you a Kanto Pokémon.')).toBeInTheDocument();
    expect(screen.queryByText(/counts from the start/)).not.toBeInTheDocument();
  });

  it('opens the page and closes on See your achievements', async () => {
    view.current = {
      ...emptyView(),
      reveal: {
        title: 'You have earned 1 already',
        firstRun: true,
        items: [{ earned: FIRST, name: 'First battle' }],
      },
    };
    await mount(<WelcomeReveal />);
    fireEvent.click(screen.getByRole('button', { name: 'See your achievements' }));
    expect(window.location.hash).toBe('#/achievements');
    expect(view.current.closeReveal).toHaveBeenCalled();
  });

  it('renders nothing without a reveal', async () => {
    await mount(<WelcomeReveal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('unearned slots', () => {
  it('draws an unearned dex slot as a silhouette with sprites on', () => {
    const { container } = render(<SilhouetteSlot species="charmander" size={28} />);
    // Hidden from screen readers: the dex grid's own label says how many are lit.
    expect(screen.queryByRole('img')).toBeNull();
    const slot = container.querySelector('.ach-sil') as HTMLElement;
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot.style.getPropertyValue('--sprite')).toBe('url(/data/sprites/charmander.webp)');
  });

  it('draws the dex number on a blank disc with sprites off', () => {
    render(<BlankToken size={28} label="7" />);
    const blank = screen.getByRole('img', { name: 'Not earned yet' });
    expect(blank).toHaveTextContent('7');
    expect(blank).toHaveClass('ach-blank');
  });

  it('hides a decorative blank disc from screen readers', () => {
    const { container } = render(<BlankToken size={28} label="7" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('.ach-blank')).toHaveAttribute('aria-hidden', 'true');
  });
});
