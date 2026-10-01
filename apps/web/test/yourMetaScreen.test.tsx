import 'fake-indexeddb/auto';
import type { BattleSet, LoggedBattle } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStickyForTests } from '../src/components.tsx';
import { YourBattles } from '../src/screens/YourBattles.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { DEFAULT_SETTINGS, resetDbForTests, storage, type Settings } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

function battle(id: string, minute: number, over: Partial<LoggedBattle> = {}): LoggedBattle {
  return {
    id,
    at: `2026-09-15T10:${String(minute).padStart(2, '0')}:00Z`,
    opponents: ['medicham'],
    result: 'win',
    tanked: false,
    ...over,
  };
}

function openSet(battles: LoggedBattle[], over: Partial<BattleSet> = {}): BattleSet {
  return {
    id: 's1',
    league: 'great',
    startedAt: '2026-09-15T10:00:00Z',
    team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
    battles,
    closed: false,
    ...over,
  };
}

/** Two wins, one loss and a tanked game: the record is 2-1, the strip shows all four. */
const MIXED: LoggedBattle[] = [
  battle('b1', 5, { opponents: ['medicham', 'dragonite_shadow'] }),
  battle('b2', 10, { result: 'loss' }),
  battle('b3', 15, { opponents: [], result: null, tanked: true }),
  battle('b4', 20, { opponents: ['azumarill', 'medicham'] }),
];

function renderBattles(host = fakeHost()) {
  return render(
    <AppProvider host={host}>
      <YourBattles />
    </AppProvider>,
  );
}

async function withSettings(patch: Partial<Settings>): Promise<void> {
  await storage.saveSettings({ ...DEFAULT_SETTINGS, ...patch });
}

describe('Your battles screen', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '#/meta/battles';
    resetStickyForTests();
  });

  it('says the progress to 15 once, with the count still to go', async () => {
    await storage.saveSet(openSet(MIXED));
    renderBattles();
    expect(
      await screen.findByText(
        '3 of 15 battles · 12 more until your meta weights Teams, Counters and Build',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/of 15/)).toHaveLength(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
  });

  it('from 15 battles, says the meta is weighting and fills the bar', async () => {
    const many = Array.from({ length: 16 }, (_, i) => battle(`b${i}`, i + 1));
    await storage.saveSet(openSet(many));
    renderBattles();
    expect(
      await screen.findByText(
        'Your meta is weighting Teams, Counters and Build · 16 battles this season',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/of 15/)).toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('keeps the state line and drops the bar when the log is not the Teams source', async () => {
    await withSettings({ facing: { source: 'prior', window: 'meta' } });
    renderBattles();
    expect(
      await screen.findByText(
        'Pick "Your meta" as the Source on Teams to weight teams by these battles.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('lists the faced species under the switch, with the season and its count', async () => {
    await storage.saveSet(openSet(MIXED));
    renderBattles();
    expect(await screen.findByText('Twilight Trails · 3 battles')).toBeInTheDocument();
    // The switch names the list; no heading repeats it, whichever is picked.
    expect(screen.getAllByText('Most faced')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Worst record' }));
    expect(screen.getByRole('button', { name: 'Worst record' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByText('Most faced')).toHaveLength(1);
    expect(screen.getAllByText('Worst record')).toHaveLength(1);
    const medicham = screen.getByText('Medicham').closest('.faced-row');
    expect(medicham).toHaveTextContent('faced 3');
    expect(medicham).toHaveTextContent('2-1');
    expect(medicham).toHaveTextContent('Who beats it');
    expect(medicham).toHaveAttribute('href', '#/species/medicham');
    expect(screen.getByRole('link', { name: /^Who beats Medicham/ })).toBe(medicham);
    // The frequency bar is a thin bar inside the row, sized by how often it was faced.
    expect(medicham?.querySelector('.faced-bar')).toHaveStyle({ width: '100%' });
    expect(screen.getByText('2-1', { selector: '.team-row b' })).toBeInTheDocument();
  });

  it('marks a species outside the meta group quietly and explains the mark once', async () => {
    await storage.saveSet(openSet(MIXED));
    const { container } = renderBattles();
    await screen.findByText('Twilight Trails · 3 battles');
    // The fake meta group is Tinkaton, Azumarill and Clodsire: Medicham and Dragonite are outside.
    const outside = container.querySelectorAll('.faced-out');
    expect(outside).toHaveLength(2);
    const azumarill = screen.getByText('Azumarill', { selector: '.faced-row *' }).closest('a');
    expect(azumarill?.querySelector('.faced-out')).toBeNull();
    expect(
      screen.getAllByText(/Outside PvPoke's 3: logged here, simulated on this phone\./),
    ).toHaveLength(1);
    expect(screen.queryByText(/outside the meta/)).toBeNull();
    expect(
      screen.getByRole('link', { name: /^Who beats Medicham.*outside PvPoke's meta group/ }),
    ).toBeInTheDocument();
  });

  it('explains the log once, and the explainer can be dismissed', async () => {
    renderBattles();
    const copy =
      'Once you log 15 battles, Teams, Counters and Build weigh opponents by how often you face them. Your collection never leaves this phone; battle records are shared anonymously unless you turn sharing off in Settings.';
    expect(await screen.findByText(copy)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(copy)).toBeNull();
  });

  it('closes with the privacy footer, sharing on', async () => {
    renderBattles();
    expect(
      await screen.findByText(
        'Your collection stays on this phone. Battle sharing is on and anonymous; change it in Settings.',
      ),
    ).toBeInTheDocument();
  });

  it('closes with the privacy footer, sharing off', async () => {
    await withSettings({ share: { enabled: false } });
    renderBattles();
    expect(
      await screen.findByText('Battle sharing is off; change it in Settings.'),
    ).toBeInTheDocument();
  });

  it('confirms Start fresh in a sheet with the default tone, then moves the battles', async () => {
    const base = fakeHost();
    const bootReply = await base.ready();
    // A season list last updated long ago: the stale card offers Start fresh.
    const host = fakeHost({
      ready: vi.fn(async () => ({
        ...bootReply,
        seasons: [{ id: 20, name: 'Old Season', start: '2025-01-01T00:00:00Z' }],
      })),
    });
    await storage.saveSet(openSet(MIXED));
    const confirm = vi.spyOn(window, 'confirm');
    renderBattles(host);
    fireEvent.click(await screen.findByRole('button', { name: 'Start fresh' }));
    const sheet = await screen.findByRole('alertdialog', { name: 'Start fresh?' });
    expect(sheet).toHaveTextContent(
      'Battles before now move to Earlier seasons. Nothing is deleted.',
    );
    expect(sheet.querySelector('.ui-btn-danger')).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Start fresh' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByRole('button', { name: /Earlier seasons/ })).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('is titled Your battles, with Back to Meta and a Settings button', async () => {
    window.location.hash = '#/meta/battles';
    renderBattles();
    expect(await screen.findByText('Your battles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.location.hash).toBe('#/meta'));
  });

  it('has no meta.pick3.gg link, no action row to it, and none of the landing cards', async () => {
    await storage.saveSet(openSet(MIXED));
    const { container } = renderBattles();
    await screen.findByText('Twilight Trails · 3 battles');
    expect(screen.queryByRole('link', { name: /meta\.pick3\.gg/ })).toBeNull();
    expect(screen.queryByText(/See what everyone else is facing/)).toBeNull();
    expect(container.querySelector('a[href="https://meta.pick3.gg"]')).toBeNull();
    expect(screen.queryByText('Current team')).toBeNull();
    expect(screen.queryByText('No team picked')).toBeNull();
    expect(screen.queryByText(/community meta/)).toBeNull();
    expect(screen.queryByText('Sharing is off')).toBeNull();
    expect(container.querySelector('.ui-btn-primary')).toBeNull();
  });
});
