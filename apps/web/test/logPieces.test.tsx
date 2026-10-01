import 'fake-indexeddb/auto';
import type { BattleSet, LoggedBattle } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetStickyForTests } from '../src/components.tsx';
import {
  Contribution,
  CurrentTeam,
  NoTeam,
  ProgressLine,
} from '../src/components/meta/LogPieces.tsx';
import { AppProvider, useAppState } from '../src/state/store.tsx';
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

/** The open set the way the Meta landing hands it to CurrentTeam, or NoTeam when none is open. */
function Landing() {
  const s = useAppState();
  const open = s.sets.find((x) => !x.closed && x.league === (s.settings.league ?? 'great'));
  return (
    <>
      <div className="page-head">
        <ProgressLine />
        <Contribution />
      </div>
      {open ? <CurrentTeam set={open} /> : <NoTeam />}
    </>
  );
}

function renderPieces() {
  return render(
    <AppProvider host={fakeHost()}>
      <Landing />
    </AppProvider>,
  );
}

async function withSettings(patch: Partial<Settings>): Promise<void> {
  await storage.saveSettings({ ...DEFAULT_SETTINGS, ...patch });
}

describe('shared logging pieces', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    resetStickyForTests();
  });

  it('counts the sent battles in a pink measured line, leaving tanked and unsent out', async () => {
    const sent = '2026-09-15T11:00:00Z';
    await storage.saveSet(
      openSet([
        battle('b1', 5, { sharedAt: sent }),
        battle('b2', 10, { sharedAt: sent, result: 'loss' }),
        battle('b3', 15, { sharedAt: sent, result: null, tanked: true }),
        battle('b4', 20),
      ]),
    );
    // Another league's sent battle counts too: all leagues and seasons.
    await storage.saveSet(
      openSet([battle('u1', 5, { sharedAt: sent })], { id: 'u', league: 'ultra', closed: true }),
    );
    const { container } = renderPieces();
    await waitFor(() =>
      expect(container.querySelector('.ui-measured-line')).toHaveTextContent(
        '3 of your battles are in the community meta',
      ),
    );
    expect(container.querySelectorAll('.ui-measured-line')).toHaveLength(1);
  });

  it('with none sent yet, says battles join as you log them, in plain text', async () => {
    await storage.saveSet(openSet(MIXED));
    const { container } = renderPieces();
    expect(
      await screen.findByText('Your battles join the community meta as you log them'),
    ).toBeInTheDocument();
    expect(container.querySelector('.ui-measured-line')).toBeNull();
  });

  it('with sharing off, says so in plain text with a way to Settings', async () => {
    await withSettings({ share: { enabled: false } });
    const { container } = renderPieces();
    const line = await screen.findByText('Sharing is off');
    expect(line.closest('.ui-measured-line')).toBeNull();
    expect(container.querySelector('.ui-measured-line')).toBeNull();
    expect(container.querySelector('.page-head')).toContainElement(line);
    expect(
      within(line.parentElement as HTMLElement).getByRole('button', { name: 'Settings' }),
    ).toBeInTheDocument();
  });

  it('shows the record as wins and losses, tanked left out', async () => {
    await storage.saveSet(openSet(MIXED));
    renderPieces();
    expect(await screen.findByText(/^2-1 since/)).toBeInTheDocument();
    expect(screen.queryByText(/2-1-1/)).toBeNull();
    expect(screen.getByText('Current team')).toBeInTheDocument();
  });

  it('makes each result a button that opens that battle for editing', async () => {
    await storage.saveSet(openSet(MIXED));
    renderPieces();
    const win = await screen.findByRole('button', {
      name: 'Win against Medicham, Shadow Dragonite',
    });
    expect(screen.getByRole('button', { name: /^Loss against Medicham/ })).toBeInTheDocument();
    // A battle with no opponents logged is named by its result and time.
    expect(screen.getByRole('button', { name: /^Tanked, / })).toBeInTheDocument();
    expect(screen.getByText('Tap a result to fix it')).toBeInTheDocument();
    fireEvent.click(win);
    await waitFor(() => expect(window.location.hash).toBe('#/meta/log/s1/b1'));
  });

  it('has one primary action, Log a battle, with Change team and Share as text buttons', async () => {
    await storage.saveSet(openSet(MIXED));
    const { container } = renderPieces();
    const log = await screen.findByRole('button', { name: 'Log a battle' });
    const primaries = container.querySelectorAll('.ui-btn-primary');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toBe(log);
    expect(screen.getByRole('button', { name: 'Change team' })).toHaveClass('ui-btn-text');
    expect(screen.getByRole('button', { name: 'Share this team' })).toHaveClass('ui-btn-text');
  });

  it('with no team running, Pick your team is the primary', async () => {
    const { container } = renderPieces();
    const pick = await screen.findByRole('button', { name: 'Pick your team' });
    expect(pick).toHaveClass('ui-btn-primary');
    expect(container.querySelectorAll('.ui-btn-primary')).toHaveLength(1);
    expect(screen.getByText('No team picked')).toBeInTheDocument();
  });
});
