import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recommendation, TeamAnalysis, TeamRecommendation } from '@pickthree/engine';
import { SharedTeam } from '../src/screens/SharedTeam.tsx';
import { TeamDetail } from '../src/screens/TeamDetail.tsx';
import {
  AppProvider,
  hashFor,
  useActions,
  useAppState,
  type AppState,
} from '../src/state/store.tsx';
import { canGoBack, resetHistoryForTests } from '../src/state/history.ts';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { emptyLayoutValue } from '../src/format.ts';
import { fakeHost } from './fakeHost.ts';
import { makeTeam } from './teamFixture.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

async function saveEmptyCollection(): Promise<void> {
  await storage.saveCollection({
    specimens: [],
    report: {
      scansRead: 0,
      recognized: 0,
      duplicatesMerged: 0,
      missingIvs: { count: 0, names: [] },
      unrecognized: [],
      rowProblems: [],
      layout: emptyLayoutValue(),
      newestScan: null,
    },
    importedAt: '2026-09-16T00:00:00Z',
    fileName: null,
  });
}

function hostWith(teams: TeamRecommendation[]) {
  const host = fakeHost();
  const base = host.recommend as unknown as () => Promise<Recommendation>;
  host.recommend = vi.fn(async () => ({ ...(await base()), teams })) as typeof host.recommend;
  return host;
}

/** The row toggles only: an open row's body holds Term buttons that also carry aria-expanded. */
function rowHeads(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.ui-expand-head')];
}

const TEAM = makeTeam({
  id: 'a',
  species: ['medicham', 'azumarill', 'dragonite_shadow'],
  battle: 71,
  total: 93,
});

/** Boot the store, run a recommendation that returns `teams`, and show `TeamDetail id`. */
async function mountRecommended(id: string, teams: TeamRecommendation[] = [TEAM]) {
  // Opened fresh at the team's own address, as a reload or a pasted link would.
  window.history.replaceState(null, '', hashFor({ screen: 'team', id }));
  render(
    <AppProvider host={hostWith(teams)}>
      <Probe />
      <TeamDetail id={id} />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.leagueInfo).not.toBeNull();
    expect(latest?.state.collection).not.toBeNull();
  });
  await act(async () => {
    await latest!.actions.runRecommend();
  });
  await waitFor(() => expect(latest?.state.recommendation?.teams.length).toBe(teams.length));
}

function analysisOf(team: TeamRecommendation): TeamAnalysis {
  return {
    team,
    orders: [],
    hypothetical: [],
    chosenMoves: [],
    unranked: [],
    assumptions: {
      league: 'great',
      leagueTitle: 'Great League',
      cpCap: 1500,
      levelCap: 50,
      shields: { lead: '', switch: '', closer: '' },
      ivs: '',
      metaName: '',
      metaSize: 3,
      facing: '',
      source: 'prior',
      pvpokeCommit: 'abc',
      pvpokeDate: '2026-09-10',
      gamemasterTimestamp: '',
      dataBuiltAt: '',
    },
    ms: 0,
  } as unknown as TeamAnalysis;
}

/** Boot the store, analyze three species picks into `team`, and show the custom analysis. */
async function mountCustom(team: TeamRecommendation) {
  const host = fakeHost({ analyze: vi.fn(async () => analysisOf(team)) });
  render(
    <AppProvider host={host}>
      <Probe />
      <TeamDetail id="custom" />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.leagueInfo).not.toBeNull();
  });
  act(() => {
    latest!.actions.setPicks(
      team.slots.map((x) => ({
        kind: 'species',
        id: x.candidate.build.speciesId,
      })) as AppState['picks'],
      false,
    );
  });
  await act(async () => {
    await latest!.actions.analyze();
  });
  await waitFor(() => expect(latest?.state.analysis).not.toBeNull());
}

async function saveRunningSet(): Promise<void> {
  await storage.saveSet({
    id: 's1',
    league: 'great',
    startedAt: '2026-09-15T10:00:00Z',
    team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
    battles: Array.from({ length: 3 }, (_, i) => ({
      id: `b${i}`,
      at: `2026-09-15T10:0${i}:00Z`,
      opponents: ['medicham'],
      result: 'win' as const,
      tanked: false,
    })),
    closed: false,
  });
}

describe('Team Analysis', () => {
  const scrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetHistoryForTests();
    // A fresh entry with no pick3 depth on it, so nothing sits behind the screen under test.
    window.history.replaceState(null, '', '#/');
    latest = null;
    await saveEmptyCollection();
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.unstubAllGlobals();
  });

  it('with no analysis, shows Empty with a way to Build, and Back stays in pick3', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <TeamDetail id="custom" />
      </AppProvider>,
    );
    expect(
      await screen.findByText('No hand-built team yet. Pick three and analyze them.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No hand-built team yet. Pick three and analyze them.').closest('.ui-empty'),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Build a team' }));
    await waitFor(() => expect(window.location.hash).toBe('#/build'));
  });

  it('a recommended team that is gone offers Back to teams', async () => {
    await mountRecommended('gone');
    expect(
      screen.getByText('This team is not in the current results. Filters may have changed.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to teams' }));
    await waitFor(() => expect(window.location.hash).toBe('#/teams'));
  });

  it('headlines battle strength, not the total', async () => {
    await mountRecommended('a');
    const card = await screen.findByRole('region', { name: 'Battle score' });
    expect(card.querySelector('.score-num')).toHaveTextContent(/^71$/);
    expect(card).not.toHaveClass('custom-note');
    expect(within(card).getByRole('button', { name: 'Take to battle' })).toHaveClass(
      'ui-btn-primary',
    );
  });

  it('jump buttons scroll their sections into view', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    await mountRecommended('a');
    const jumps: [string, string][] = [
      ['Battle plan', 'plan'],
      ['Matchups', 'matchups'],
      ['Pokémon', 'pokemon'],
      ['Details', 'details'],
    ];
    for (const [label, id] of jumps) {
      spy.mockClear();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(spy).toHaveBeenCalledTimes(1);
      expect((spy.mock.contexts[0] as HTMLElement).id).toBe(id);
    }
    expect(document.getElementById('plan')).toHaveTextContent('Battle plan');
    expect(document.getElementById('matchups')).toHaveTextContent('Matchups to remember');
    expect(document.getElementById('pokemon')).toHaveTextContent('Your Pokémon');
    expect(document.getElementById('details')).toHaveTextContent('Why this team');
  });

  it('Assumptions keep each "·" with the label before it', async () => {
    await mountRecommended('a');
    const head = screen.getByRole('button', { name: 'Assumptions and detail' });
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    const body = document.querySelector('.assump-body')!;
    for (const label of ['Shields', 'Opponent meta', 'IVs', 'Level cap', 'Total build']) {
      expect(body.textContent).toContain(`${label}\u00a0· `);
    }
    expect(body.textContent).toContain('W wins\u00a0· L loses\u00a0· ~ close');
  });

  it('tapping a strip Pokémon opens its row and scrolls to it, leaving the first row open', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    await mountRecommended('a');
    expect(rowHeads()[0]).toHaveAttribute('aria-expanded', 'true');
    expect(rowHeads()[1]).toHaveAttribute('aria-expanded', 'false');
    const strip = document.querySelector('.analysis-strip') as HTMLElement;
    const members = within(strip).getAllByRole('button');
    expect(members).toHaveLength(3);
    expect(members[1]).toHaveTextContent('Azumarill');
    fireEvent.click(members[1]!);
    expect(rowHeads()[1]).toHaveAttribute('aria-expanded', 'true');
    expect(rowHeads()[0]).toHaveAttribute('aria-expanded', 'true');
    expect(rowHeads()[2]).toHaveAttribute('aria-expanded', 'false');
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.contexts[0] as HTMLElement).id).toBe('pokemon-1');
    // A second tap on an open row's member keeps it open: the strip opens, it never closes.
    fireEvent.click(members[1]!);
    expect(rowHeads()[1]).toHaveAttribute('aria-expanded', 'true');
  });

  it('Take to battle with no running set starts one and opens Log a battle', async () => {
    await mountRecommended('a');
    fireEvent.click(screen.getByRole('button', { name: 'Take to battle' }));
    await waitFor(() => expect(window.location.hash).toBe(hashFor({ screen: 'meta-log' })));
    const open = latest!.state.sets.filter((x) => !x.closed);
    expect(open).toHaveLength(1);
    expect(open[0]!.team.species).toEqual(['medicham', 'azumarill', 'dragonite_shadow']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it("asks before switching from another team's running set; Keep it leaves the set alone", async () => {
    await saveRunningSet();
    await mountRecommended('a');
    await waitFor(() => expect(latest!.state.sets).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Take to battle' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Switch teams?' });
    expect(dialog).toHaveTextContent(
      'You are running Tinkaton, Azumarill, Clodsire (3 logged). Switch to this team?',
    );
    // The count never wraps away from its unit.
    expect(dialog.textContent).toContain('(3\u00a0logged)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {});
    expect(latest!.state.sets).toHaveLength(1);
    expect(latest!.state.sets[0]!.closed).toBe(false);
    expect(window.location.hash).not.toBe(hashFor({ screen: 'meta-log' }));
  });

  it('Take to battle with this team already running opens Log a battle, no sheet, no new set', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['medicham', 'azumarill', 'dragonite_shadow'] },
      battles: [],
      closed: false,
    });
    await mountRecommended('a');
    await waitFor(() => expect(latest!.state.sets).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Take to battle' }));
    await waitFor(() => expect(window.location.hash).toBe(hashFor({ screen: 'meta-log' })));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(latest!.state.sets).toHaveLength(1);
    expect(latest!.state.sets[0]).toMatchObject({ id: 's1', closed: false });
  });

  it('Switch closes the running set, starts this team and opens Log a battle', async () => {
    await saveRunningSet();
    await mountRecommended('a');
    await waitFor(() => expect(latest!.state.sets).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Take to battle' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Switch teams?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch' }));
    await waitFor(() => expect(window.location.hash).toBe(hashFor({ screen: 'meta-log' })));
    const open = latest!.state.sets.filter((x) => !x.closed);
    expect(open).toHaveLength(1);
    expect(open[0]!.team.species).toEqual(['medicham', 'azumarill', 'dragonite_shadow']);
    expect(latest!.state.sets.find((x) => x.id === 's1')?.closed).toBe(true);
  });

  it('Edit team loads the three into Build', async () => {
    await mountRecommended('a');
    fireEvent.click(screen.getByRole('button', { name: 'Edit team' }));
    await waitFor(() => expect(window.location.hash).toBe('#/build'));
    expect(latest!.state.picks.map((p) => p?.id)).toEqual([
      'medicham',
      'azumarill',
      'dragonite_shadow',
    ]);
  });

  it('Back with nothing behind it lands on Teams for a recommended team', async () => {
    await mountRecommended('a');
    expect(canGoBack()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.location.hash).toBe('#/teams'));
  });

  it('Back with nothing behind it lands on Build for a custom team, which carries its notes', async () => {
    await mountCustom(TEAM);
    // Analyze navigated to the custom route; open it fresh, as a reload would.
    resetHistoryForTests();
    const card = await screen.findByRole('region', { name: 'Battle score' });
    expect(card).toHaveClass('custom-note');
    expect(canGoBack()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.location.hash).toBe('#/build'));
  });
});

/** The two screens a team link passes through, routed as App routes them. */
function LinkRoutes() {
  const r = useAppState().route;
  if (r.screen === 'shared') {
    return <SharedTeam league={r.league} members={r.members} />;
  }
  if (r.screen === 'custom') {
    return <TeamDetail id="custom" />;
  }
  return null;
}

describe('Team Analysis from a team link', () => {
  const LINKED = makeTeam({ id: 'custom', species: ['tinkaton', 'azumarill', 'clodsire'] });
  let analyze: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetHistoryForTests();
    latest = null;
    await saveEmptyCollection();
    // recordError's device summary reads matchMedia, which jsdom does not implement.
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    analyze = vi.fn(async () => analysisOf(LINKED));
    // The link is the first page opened in this tab.
    window.history.replaceState(
      null,
      '',
      hashFor({ screen: 'shared', league: 'great', members: 'tinkaton+azumarill+clodsire' }),
    );
    render(
      <AppProvider host={fakeHost({ analyze })}>
        <Probe />
        <LinkRoutes />
      </AppProvider>,
    );
    await screen.findByRole('region', { name: 'Battle score' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces the landing with the analysis, keeping it the first screen', () => {
    expect(window.location.hash).toBe('#/build/team');
    expect((window.history.state as { pick3Depth?: number }).pick3Depth).toBe(0);
    expect(canGoBack()).toBe(false);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('Back lands on Teams: not off the site, not back through the link', async () => {
    expect(screen.getByRole('region', { name: 'Battle score' })).toHaveTextContent(
      'Shared team link.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.location.hash).toBe('#/teams'));
    await waitFor(() => expect(latest!.state.route.screen).toBe('teams'));
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('after Edit team and Analyze again, Back returns to Build', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Edit team' }));
    await waitFor(() => expect(latest!.state.route.screen).toBe('build'));
    await act(async () => {
      await latest!.actions.analyze();
    });
    await waitFor(() => expect(latest!.state.route.screen).toBe('custom'));
    expect(window.location.hash).toBe('#/build/team');
    expect(canGoBack()).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.location.hash).toBe('#/build'));
    await waitFor(() => expect(latest!.state.route.screen).toBe('build'));
    expect(analyze).toHaveBeenCalledTimes(2);
  });
});
