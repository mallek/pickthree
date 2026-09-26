import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { KeyMatchup, SwitchAdvice } from '@pickthree/engine';
import { PokemonDetails } from '../src/components/team/PokemonDetails.tsx';
import { ScoreCard } from '../src/components/team/ScoreCard.tsx';
import { KeyWins, SwitchList, Threats } from '../src/components/team/Threats.tsx';
import { WhyThisTeam } from '../src/components/team/WhyThisTeam.tsx';
import { costLine, SEP } from '../src/format.ts';
import { AppProvider } from '../src/state/store.tsx';
import { fakeHost } from './fakeHost.ts';
import { makeTeam } from './teamFixture.ts';

const NO_WINS =
  'No Pokémon in the meta group is a clear win for this team in the simulated scenarios.';

const wrap = (ui: ReactNode) => render(<AppProvider host={fakeHost()}>{ui}</AppProvider>);

/** A KeyMatchup built from makeTeam's own first key threat, with a fresh opponent and line. */
function threat(opponent: string, line: string): KeyMatchup {
  return { ...makeTeam().explanation.keyThreats[0]!, opponent, opponentName: opponent, line };
}

/** A SwitchAdvice built from makeTeam's own first switch entry, with a fresh opponent and, when
 * given, a fresh engine line. */
function switchRow(opponent: string, line?: string): SwitchAdvice {
  return {
    ...makeTeam().explanation.switchPlan[0]!,
    opponent,
    opponentName: opponent,
    ...(line === undefined ? {} : { line }),
  };
}

describe('ScoreCard, the hero card', () => {
  it('shows the number alone, the structure, the fit and five bars', () => {
    const team = makeTeam({ battle: 81.6, total: 64 });
    wrap(
      <ScoreCard
        team={team}
        custom={null}
        onTakeToBattle={() => undefined}
        onEdit={() => undefined}
        onShowMember={() => undefined}
      />,
    );
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.queryByText(/\/ 100/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Balanced ABC|ABB line/ })).toBeInTheDocument();
    for (const label of ['Coverage', 'Consistency', 'Safety', 'Affordable', 'Accessibility']) {
      expect(
        screen.getByRole('meter', { name: new RegExp(`^${label} \\d+ of 100$`) }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByText(/Run it in this order/)).not.toBeInTheDocument();
  });

  it('fills each bar with its factor, rounded, and states the difficulty', () => {
    const team = makeTeam({ battle: 81.6, total: 64 });
    team.score.factors = {
      coverage: 98.6,
      consistency: 55.2,
      safety: 100,
      cost: 0,
      accessibility: 60.4,
    };
    wrap(
      <ScoreCard
        team={team}
        custom={null}
        onTakeToBattle={() => undefined}
        onEdit={() => undefined}
        onShowMember={() => undefined}
      />,
    );
    const coverage = screen.getByRole('meter', { name: 'Coverage 99 of 100' });
    expect(coverage).toHaveAttribute('aria-valuenow', '99');
    expect(coverage).toHaveAttribute('aria-valuemin', '0');
    expect(coverage).toHaveAttribute('aria-valuemax', '100');
    expect(coverage.querySelector('.hero-bar-fill')).toHaveStyle({ width: '99%' });
    expect(screen.getByRole('meter', { name: 'Affordable 0 of 100' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Accessibility 60 of 100' })).toBeInTheDocument();
    expect(
      screen.getByText(`${team.score.difficulty} to play: ${team.score.difficultyWhy}`),
    ).toBeInTheDocument();
  });

  it('a custom team shows three bars and what it costs to build', () => {
    const team = makeTeam({ battle: 70, total: 60 });
    const analysis = {
      team,
      orders: [],
      hypothetical: [],
      chosenMoves: [],
      unranked: [],
      assumptions: {} as never,
      ms: 0,
    } as unknown as import('@pickthree/engine').TeamAnalysis;
    wrap(
      <ScoreCard
        team={team}
        custom={{ analysis, best: null, shared: false, leagueTitle: 'Great League' }}
        onTakeToBattle={() => undefined}
        onEdit={() => undefined}
        onShowMember={() => undefined}
      />,
    );
    expect(screen.getAllByRole('meter')).toHaveLength(3);
    expect(screen.queryByRole('meter', { name: /Affordable/ })).not.toBeInTheDocument();
    expect(screen.getByText(/^To build all three:/).textContent).toBe(
      `To build all three: ${costLine(team.cost)}`,
    );
  });

  it('the pencil edits and a strip tap shows that Pokémon', () => {
    const onEdit = vi.fn();
    const onShowMember = vi.fn();
    const team = makeTeam();
    wrap(
      <ScoreCard
        team={team}
        custom={null}
        onTakeToBattle={() => undefined}
        onEdit={onEdit}
        onShowMember={onShowMember}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit team' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: /Lead|Switch|Closer/ })[1]!);
    expect(onShowMember).toHaveBeenCalledWith(1);
  });

  it('puts Take to battle, the one primary action, under the card', () => {
    const take = vi.fn();
    wrap(
      <ScoreCard
        team={makeTeam()}
        custom={null}
        onTakeToBattle={take}
        onEdit={() => undefined}
        onShowMember={() => undefined}
      />,
    );
    const card = screen.getByRole('region', { name: 'Battle score' });
    const button = screen.getByRole('button', { name: 'Take to battle' });
    expect(card).not.toContainElement(button);
    expect(card.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(button);
    expect(take).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.ui-btn-primary')).toHaveLength(1);
    expect(document.querySelector('.custom-note')).toBeNull();
  });

  it('adds the custom notes under Take to battle: best recommended, assumed IVs, chosen moves, unranked, orders', () => {
    const team = makeTeam({ battle: 70, total: 60 });
    const best = makeTeam({ battle: 88, total: 70 });
    const analysis = {
      team,
      orders: [
        { slots: ['a', 'b', 'c'], names: ['A', 'B', 'C'], battle: 70, total: 60, fit: 'Solid' },
        { slots: ['c', 'b', 'a'], names: ['C', 'B', 'A'], battle: 55, total: 50, fit: 'Weak' },
      ],
      hypothetical: ['azumarill'],
      chosenMoves: ['tinkaton'],
      unranked: ['clodsire'],
      assumptions: {} as never,
      ms: 0,
    } as unknown as import('@pickthree/engine').TeamAnalysis;
    wrap(
      <ScoreCard
        team={team}
        custom={{ analysis, best, shared: false, leagueTitle: 'Great League' }}
        onTakeToBattle={() => undefined}
        onEdit={() => undefined}
        onShowMember={() => undefined}
      />,
    );
    const notes = document.querySelector('.custom-note') as HTMLElement;
    expect(notes).toHaveClass('score-notes');
    const button = screen.getByRole('button', { name: 'Take to battle' });
    expect(button.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(notes).getByText(/Your best recommended team rates/)).toHaveTextContent('88');
    expect(within(notes).getByText(/not in your collection/)).toBeInTheDocument();
    expect(within(notes).getByText(/ran the moves you chose/)).toBeInTheDocument();
    expect(within(notes).getByText(/PvPoke does not rank/)).toBeInTheDocument();
    expect(within(notes).getByText(/tried all six orders/)).toHaveTextContent('70');
    expect(screen.queryByText(/Run it in this order/)).not.toBeInTheDocument();
    expect(screen.queryByText('Run in the order you picked.')).not.toBeInTheDocument();
  });

  it('with only the picked order tried, no orders line and no order sentence', () => {
    const team = makeTeam({ battle: 70, total: 60 });
    const analysis = {
      team,
      orders: [
        { slots: ['a', 'b', 'c'], names: ['A', 'B', 'C'], battle: 70, total: 60, fit: 'Solid' },
      ],
      hypothetical: [],
      chosenMoves: [],
      unranked: [],
      assumptions: {} as never,
      ms: 0,
    } as unknown as import('@pickthree/engine').TeamAnalysis;
    wrap(
      <ScoreCard
        team={team}
        custom={{ analysis, best: null, shared: false, leagueTitle: 'Great League' }}
        onTakeToBattle={() => undefined}
        onEdit={() => undefined}
        onShowMember={() => undefined}
      />,
    );
    expect(screen.queryByText(/Run it in this order/)).not.toBeInTheDocument();
    expect(screen.queryByText('Run in the order you picked.')).not.toBeInTheDocument();
    expect(screen.queryByText(/tried all six orders/)).not.toBeInTheDocument();
  });
});

describe('Threats', () => {
  it('lists the engine threats as rows and counts the rest that beat the team', () => {
    const team = makeTeam();
    team.explanation.keyThreats = [threat('a', 'A line.'), threat('b', 'B line.')];
    team.score.uncoveredOpponents = ['a', 'b', 'c', 'd', 'e'];
    wrap(<Threats team={team} />);
    expect(screen.getAllByTestId('threat-row')).toHaveLength(2);
    expect(screen.getByText('and 3 more beat this team')).toBeInTheDocument();
  });

  it('says "beats" when one more beats the team', () => {
    const team = makeTeam();
    team.explanation.keyThreats = [threat('a', 'A line.')];
    team.score.uncoveredOpponents = ['a', 'b'];
    wrap(<Threats team={team} />);
    expect(screen.getByText('and 1 more beats this team')).toBeInTheDocument();
  });

  it('says so when nothing beats all three', () => {
    const team = makeTeam();
    team.explanation.keyThreats = [];
    team.score.uncoveredOpponents = [];
    wrap(<Threats team={team} />);
    expect(screen.getByText(/Nothing in the meta group beats all three/)).toBeInTheDocument();
    expect(screen.queryByText(/more beats? this team/)).not.toBeInTheDocument();
  });
});

describe('SwitchList', () => {
  it('skips opponents already under Threats, shows five, Show all up to eight', () => {
    const team = makeTeam();
    team.explanation.keyThreats = [threat('o1', 'x')];
    team.explanation.switchPlan = Array.from({ length: 10 }, (_, i) => switchRow(`o${i + 1}`));
    wrap(<SwitchList team={team} leadName="Tinkaton" />);
    expect(screen.queryByTestId('switch-o1')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^switch-/)).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getAllByTestId(/^switch-/)).toHaveLength(8);
  });

  it('says so when nothing beats the lead', () => {
    const team = makeTeam();
    team.explanation.keyThreats = [];
    team.explanation.switchPlan = [];
    wrap(<SwitchList team={team} leadName="Tinkaton" />);
    expect(
      screen.getByText('Nothing in the meta group beats your lead in a 1-shield fight.'),
    ).toBeInTheDocument();
  });

  it('says everything is listed under Threats when the raw plan is fully covered there', () => {
    const team = makeTeam();
    team.explanation.keyThreats = [threat('o1', 'x')];
    team.explanation.switchPlan = [switchRow('o1')];
    wrap(<SwitchList team={team} leadName="Tinkaton" />);
    expect(
      screen.getByText('Everything that beats your lead is listed under Threats.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Nothing in the meta group beats your lead in a 1-shield fight.'),
    ).not.toBeInTheDocument();
  });

  it("prints the engine's own line, not a recomputed one", () => {
    const team = makeTeam();
    team.explanation.keyThreats = [];
    team.explanation.switchPlan = [switchRow('o1', 'Engine-written switch line.')];
    wrap(<SwitchList team={team} leadName="Tinkaton" />);
    expect(screen.getByText('Engine-written switch line.')).toBeInTheDocument();
  });
});

describe('KeyWins', () => {
  it('lists the engine key wins as rows', () => {
    const team = makeTeam();
    wrap(<KeyWins team={team} />);
    expect(screen.getAllByTestId('key-win')).toHaveLength(team.explanation.keyWins.length);
  });

  it('says so when there is no win', () => {
    const team = makeTeam();
    team.explanation.keyWins = [];
    wrap(<KeyWins team={team} />);
    expect(screen.queryAllByTestId('key-win')).toHaveLength(0);
    expect(screen.getByText(NO_WINS)).toHaveClass('muted');
  });
});

describe('PokemonDetails', () => {
  it('one expandable row per Pokémon; safe types past six open per row', () => {
    const team = makeTeam();
    team.explanation.slotDetail[0]!.resistances = [
      'fire',
      'water',
      'grass',
      'ice',
      'bug',
      'steel',
      'fairy',
      'dark',
    ];
    team.explanation.slotDetail[1]!.resistances = [
      'fire',
      'water',
      'grass',
      'ice',
      'bug',
      'steel',
      'fairy',
      'dark',
    ];
    wrap(
      <PokemonDetails
        team={team}
        hypothetical={[]}
        open={[true, true, false]}
        onToggle={() => undefined}
      />,
    );
    const more = screen.getAllByRole('button', { name: '+2 more' });
    for (const b of more) {
      // Its own line under the chips, not wrapped in among them, so its 44px target overlaps none.
      expect(b.closest('.tchips')).toBeNull();
      expect(b.parentElement?.querySelector('.tchips')).not.toBeNull();
      // A control looks like one: the text Button, never the read-only rank-tag pill.
      expect(b).toHaveClass('ui-btn', 'ui-btn-text');
      expect(b.querySelector('.mtag')).toBeNull();
      expect(b).toHaveAttribute('aria-expanded', 'false');
    }
    fireEvent.click(more[0]!);
    const fewer = screen.getByRole('button', { name: 'Show fewer' });
    expect(fewer).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: '+2 more' })).toHaveLength(1);
  });

  it('sets the "Move counts" term off from the move count with a separator', () => {
    const team = makeTeam();
    wrap(
      <PokemonDetails
        team={team}
        hypothetical={[]}
        open={[true, false, false]}
        onToggle={() => undefined}
      />,
    );
    const button = screen.getByRole('button', { name: 'Move counts' });
    const sub = button.closest('.move-sub');
    expect(sub).not.toBeNull();
    expect(sub!.textContent).toBe(`4-4-3 Fast Move${SEP}Move counts`);
  });

  it('builds the To build cost line from the shared costParts: SEP joins, zero XL/Elite omitted, unlock and estimated suffixes', () => {
    const team = makeTeam();
    const slot = team.slots[0]!;
    slot.candidate.cost = {
      stardust: 25000,
      candy: 50,
      xlCandy: 10,
      eliteTm: 2,
      evolutionCandy: 0,
      secondMoveUnlock: true,
      powerUpSteps: 5,
      estimated: true,
      weight: 999999,
    };
    wrap(
      <PokemonDetails
        team={team}
        hypothetical={[]}
        open={[true, false, false]}
        onToggle={() => undefined}
      />,
    );
    const toBuild = screen.getByText('To build').nextElementSibling as HTMLElement;
    expect(toBuild.textContent).toBe(
      'Level 20 to 25 · 25,000 Stardust · 50 Candy · 10 XL Candy · 2 Elite TM · second move unlock (evolution candy estimated)',
    );
    // "second move unlock" never breaks, so "unlock" cannot wrap onto a line alone.
    expect(toBuild.textContent).toContain('second\u00a0move\u00a0unlock');
  });
});

describe('WhyThisTeam', () => {
  it("shows the engine's own why and the team structure, with no numeric score breakdown", () => {
    const team = makeTeam({ battle: 80, total: 66 });
    team.score.factors = { coverage: 90, consistency: 70, safety: 80, cost: 60, accessibility: 40 };
    wrap(<WhyThisTeam team={team} />);
    expect(screen.getByText(team.explanation.why)).toBeInTheDocument();
    // The hero card owns the number and the factor bars; this never repeats them as a sentence.
    expect(screen.queryByText(/Battle strength/)).not.toBeInTheDocument();
    expect(screen.queryByText(/To build all three/)).not.toBeInTheDocument();
  });

  it('says the same for a hand-built team: no breakdown and no build-cost sentence', () => {
    const team = makeTeam({ battle: 80, total: 66 });
    team.score.factors = {
      coverage: 90,
      consistency: 70,
      safety: 80,
      cost: 100,
      accessibility: 40,
    };
    const { container } = wrap(<WhyThisTeam team={team} />);
    expect(screen.queryByText(/Battle strength/)).not.toBeInTheDocument();
    // The hero card already gives a hand-built team's build cost; this never duplicates it.
    expect(container.textContent).not.toContain(costLine(team.cost));
  });
});
