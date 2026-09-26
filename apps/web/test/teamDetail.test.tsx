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

const NOT_FOUND = 'This team is not in the current results. Filters may have changed.';

/**
 * Show `TeamDetail id` opened fresh at the team's own address, as a reload or a pasted link
 * would, and wait for the recommendation it runs by itself (returning `teams`) to arrive.
 */
async function mountRecommended(
  id: string,
  teams: TeamRecommendation[] = [TEAM],
  host = hostWith(teams),
) {
  window.history.replaceState(null, '', hashFor({ screen: 'team', id }));
  render(
    <AppProvider host={host}>
      <Probe />
      <TeamDetail id={id} />
    </AppProvider>,
  );
  await waitFor(() => expect(latest?.state.recommendation?.teams.length).toBe(teams.length));
  return host;
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

  it('a recommended team that is gone after the run offers Back to teams', async () => {
    const host = await mountRecommended('gone');
    expect(host.recommend).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to teams' }));
    await waitFor(() => expect(window.location.hash).toBe('#/teams'));
  });

  it('a reloaded team link shows Loading while it runs the recommendation, then the team', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const host = hostWith([TEAM]);
    const run = host.recommend;
    host.recommend = vi.fn(async (...args: Parameters<typeof run>) => {
      await gate;
      return run(...args);
    }) as typeof host.recommend;
    // Never, at any moment, the false "not in the current results".
    let sawNotFound = false;
    const watch = new MutationObserver(() => {
      sawNotFound ||= document.body.textContent?.includes(NOT_FOUND) ?? false;
    });
    watch.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.history.replaceState(null, '', hashFor({ screen: 'team', id: 'a' }));
    render(
      <AppProvider host={host}>
        <Probe />
        <TeamDetail id="a" />
      </AppProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading game data');
    await waitFor(() => expect(host.recommend).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toBeInTheDocument();
    release();
    const card = await screen.findByRole('region', { name: 'Battle score' });
    expect(card.querySelector('.hero-num')).toHaveTextContent(/^71$/);
    expect(screen.queryByRole('status')).toBeNull();
    watch.disconnect();
    expect(sawNotFound).toBe(false);
    expect(host.recommend).toHaveBeenCalledTimes(1);
  });

  it('a failed run shows the error with Try again and never runs again by itself', async () => {
    // recordError's device summary reads matchMedia, which jsdom does not implement.
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const host = hostWith([TEAM]);
    const run = host.recommend;
    host.recommend = vi
      .fn(run)
      .mockRejectedValueOnce(new Error('The engine stopped.')) as typeof host.recommend;
    window.history.replaceState(null, '', hashFor({ screen: 'team', id: 'a' }));
    render(
      <AppProvider host={host}>
        <Probe />
        <TeamDetail id="a" />
      </AppProvider>,
    );
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('The engine stopped.');
    await act(async () => {});
    expect(host.recommend).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(NOT_FOUND)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(within(error).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('region', { name: 'Battle score' });
    expect(host.recommend).toHaveBeenCalledTimes(2);
  });

  it('headlines battle strength, not the total', async () => {
    await mountRecommended('a');
    const card = await screen.findByRole('region', { name: 'Battle score' });
    expect(card.querySelector('.hero-num')).toHaveTextContent(/^71$/);
    expect(card).not.toHaveTextContent('/ 100');
    expect(document.querySelector('.custom-note')).toBeNull();
    // The one primary action sits under the card, outside it.
    const take = screen.getByRole('button', { name: 'Take to battle' });
    expect(take).toHaveClass('ui-btn-primary');
    expect(card).not.toContainElement(take);
    expect(card.compareDocumentPosition(take) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The card carries the team: the three Pokémon and the Edit pencil.
    expect(within(card).getAllByRole('button', { name: /Lead|Switch|Closer/ })).toHaveLength(3);
    expect(within(card).getByRole('button', { name: 'Edit team' })).toBeInTheDocument();
  });

  it('jump buttons scroll their sections into view', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    await mountRecommended('a');
    const jumps: [string, string][] = [
      ['Battle plan', 'plan'],
      ['Threats', 'threats'],
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
    expect(document.getElementById('threats')).toHaveTextContent('Threats');
    expect(document.getElementById('pokemon')).toHaveTextContent(/^Pokémon details$/);
    expect(document.getElementById('details')).toHaveTextContent('Why this team');
  });

  it('jumps without the smooth scroll when the player asks for reduced motion', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    const reduce = (q: string) => ({ matches: q.includes('reduce') }) as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(reduce));
    await mountRecommended('a');
    fireEvent.click(screen.getByRole('button', { name: 'Threats' }));
    expect(spy).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }) as MediaQueryList),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Threats' }));
    expect(spy).toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('rounds every number in the score breakdown, as the headline does', async () => {
    const team = makeTeam({ id: 'a', battle: 88.4, total: 71.7 });
    team.score.factors = {
      coverage: 98.5,
      consistency: 56.3,
      safety: 100,
      cost: 0.4,
      accessibility: 59.5,
    };
    await mountRecommended('a', [team]);
    expect(document.getElementById('details')!.parentElement).toHaveTextContent(
      'Battle strength 88 is coverage, consistency and safety (99, 56, 100). The total, 72, also counts cost (0 of 100 against the other teams pick3 simulated from your collection, higher is cheaper) and accessibility (60 of 100, higher needs fewer power-ups).',
    );
  });

  it('Assumptions keep each "·" with the label before it', async () => {
    await mountRecommended('a');
    const head = screen.getByRole('button', { name: 'Assumptions and detail' });
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    const body = document.querySelector('.assump-body')!;
    for (const label of [
      'Shields',
      'Opponent meta',
      'Opponent weights',
      'IVs',
      'Level cap',
      'Total build',
    ]) {
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
    expect(document.querySelector('.custom-note')).not.toBeNull();
    // The hero card gives a hand-built team's build cost in place of the Affordable bar.
    expect(within(card).queryByRole('meter', { name: /Affordable/ })).toBeNull();
    expect(card).toHaveTextContent('To build all three:');
    // Scored only against its own orders, a hand-built team's breakdown gives its build cost instead.
    expect(document.getElementById('details')!.parentElement).toHaveTextContent(
      'To build all three:',
    );
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
    expect(document.querySelector('.custom-note')).toHaveTextContent('Shared team link.');
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
