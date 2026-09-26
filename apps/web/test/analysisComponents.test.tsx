import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { BattlePlan } from '../src/components/team/BattlePlan.tsx';
import { Matchups } from '../src/components/team/Matchups.tsx';
import { PokemonDetails } from '../src/components/team/PokemonDetails.tsx';
import { ScoreCard } from '../src/components/team/ScoreCard.tsx';
import { WhyThisTeam } from '../src/components/team/WhyThisTeam.tsx';
import { SEP } from '../src/format.ts';
import { AppProvider } from '../src/state/store.tsx';
import { fakeHost } from './fakeHost.ts';
import { makeTeam } from './teamFixture.ts';

const wrap = (ui: ReactNode) => render(<AppProvider host={fakeHost()}>{ui}</AppProvider>);

describe('ScoreCard', () => {
  it('headlines battle strength, not the total, with one primary action', () => {
    const team = makeTeam({ battle: 81.6, total: 64 });
    const take = vi.fn();
    wrap(<ScoreCard team={team} custom={null} onTakeToBattle={take} />);
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.queryByText('64')).not.toBeInTheDocument();
    expect(screen.getByText(/^Run it in this order:/)).toBeInTheDocument();
    screen.getByRole('button', { name: 'Take to battle' }).click();
    expect(take).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.ui-btn-primary')).toHaveLength(1);
  });

  it('adds the custom notes: best recommended, assumed IVs, chosen moves, unranked, orders', () => {
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
      />,
    );
    expect(screen.getByText(/Your best recommended team rates/)).toHaveTextContent('88');
    expect(screen.getByText(/not in your collection/)).toBeInTheDocument();
    expect(screen.getByText(/ran the moves you chose/)).toBeInTheDocument();
    expect(screen.getByText(/PvPoke does not rank/)).toBeInTheDocument();
    expect(screen.getByText(/tried all six orders/)).toHaveTextContent('70');
    expect(screen.queryByText('Run in the order you picked.')).not.toBeInTheDocument();
  });

  it('with only the picked order tried, says the order once', () => {
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
      />,
    );
    expect(screen.getByText(/^Run it in this order:/)).toBeInTheDocument();
    expect(screen.queryByText('Run in the order you picked.')).not.toBeInTheDocument();
    expect(screen.queryByText(/tried all six orders/)).not.toBeInTheDocument();
  });
});

describe('BattlePlan', () => {
  it('writes the three steps from engine strings only', () => {
    const team = makeTeam();
    team.explanation.roleWhy = { lead: 'Lead why.', switch: 'Switch why.', closer: 'Closer why.' };
    team.explanation.slotDetail[0]!.formNote = 'Form note.';
    team.explanation.slotDetail[2]!.keepShield = { delta: 3, line: 'Keep a shield.' };
    team.explanation.switchPlan = [
      { ...team.explanation.switchPlan[0]!, line: 'First switch.' },
      { ...team.explanation.switchPlan[0]!, opponent: 'x2', line: 'Second switch.' },
      { ...team.explanation.switchPlan[0]!, opponent: 'x3', line: 'Third switch.' },
    ];
    wrap(<BattlePlan team={team} />);
    for (const t of [
      'Lead why.',
      'Form note.',
      'First switch.',
      'Second switch.',
      'Closer why.',
      'Keep a shield.',
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.queryByText('Third switch.')).not.toBeInTheDocument();
  });

  it('leaves out what the engine did not write', () => {
    const team = makeTeam();
    team.explanation.slotDetail[0]!.formNote = null;
    team.explanation.slotDetail[2]!.keepShield = null;
    team.explanation.switchPlan = [];
    wrap(<BattlePlan team={team} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('Matchups', () => {
  it('shows one key win and one key threat, then everything behind Show all', () => {
    const team = makeTeam(); // needs >= 2 keyWins, >= 2 keyThreats, >= 1 switchPlan entry
    wrap(<Matchups team={team} leadName="Tinkaton" />);
    expect(screen.getAllByTestId('key-win')).toHaveLength(1);
    expect(screen.getAllByTestId('key-threat')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getAllByTestId('key-win')).toHaveLength(team.explanation.keyWins.length);
    expect(screen.getByText('When to switch')).toBeInTheDocument();
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
  it('says the headline is battle strength and lists the factors', () => {
    const team = makeTeam({ battle: 80, total: 66 });
    wrap(<WhyThisTeam team={team} />);
    expect(
      screen.getByText(/Battle strength 80 is coverage, consistency and safety/),
    ).toBeInTheDocument();
    const f = team.score.factors;
    // Every factor reads so higher is plainly better: cost is how cheap, not how much.
    expect(
      screen.getByText(
        `The total, 66, also counts cost (${Math.round(f.cost)} of 100, higher is cheaper) and accessibility (${Math.round(f.accessibility)} of 100, higher needs fewer power-ups).`,
        { exact: false },
      ),
    ).toBeInTheDocument();
  });
});
