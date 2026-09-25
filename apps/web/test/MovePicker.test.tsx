import type { MoveChoice, MovePool } from '@pickthree/engine';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MovePicker } from '../src/components/MovePicker.tsx';

function move(moveId: string, name: string, extra: Partial<MoveChoice> = {}): MoveChoice {
  return {
    moveId,
    name,
    type: 'water',
    tm: 'tm',
    energy: 50,
    energyGain: 8,
    turns: 1,
    countFromFast: null,
    counts: null,
    effects: [],
    altType: null,
    ...extra,
  };
}

const pool: MovePool = {
  fast: [move('BUBBLE', 'Bubble', { tm: 'have' }), move('ROCK_SMASH', 'Rock Smash')],
  charged: [
    move('HYDRO_PUMP', 'Hydro Pump', { counts: [10, 9, 10] }),
    move('ICE_BEAM', 'Ice Beam', { counts: [7, 7, 7] }),
    move('PLAY_ROUGH', 'Play Rough', { tm: 'elite', counts: [8, 7, 8] }),
  ],
  recommended: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
};

const f1 = 'BUBBLE';
const c1 = 'ICE_BEAM';
const c2 = 'PLAY_ROUGH';
const c3 = 'HYDRO_PUMP';

const nameOf = (id: string): string => [...pool.fast, ...pool.charged].find((m) => m.moveId === id)?.name ?? id;

describe('MovePicker', () => {
  it('shows the pool with the chosen moves marked', () => {
    render(
      <MovePicker
        pool={pool}
        value={{ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: /Bubble/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Rock Smash/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ice Beam/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Hydro Pump/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Reset to recommended/ })).toBeDisabled();
  });

  it('swaps the fast move', () => {
    const onChange = vi.fn();
    render(
      <MovePicker
        pool={pool}
        value={{ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Rock Smash/ }));
    expect(onChange).toHaveBeenCalledWith({
      fast: 'ROCK_SMASH',
      charged: ['ICE_BEAM', 'PLAY_ROUGH'],
    });
  });

  it('clicking a third charged move does nothing when two are already selected', () => {
    const onChange = vi.fn();
    render(
      <MovePicker
        pool={pool}
        value={{ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Hydro Pump/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('unticks a charged move but never the last one', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MovePicker
        pool={pool}
        value={{ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Ice Beam/ }));
    expect(onChange).toHaveBeenCalledWith({ fast: 'BUBBLE', charged: ['PLAY_ROUGH'] });
    onChange.mockClear();
    rerender(
      <MovePicker
        pool={pool}
        value={{ fast: 'BUBBLE', charged: ['PLAY_ROUGH'] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Play Rough/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('resets to the recommendation and shows counts and badges', () => {
    const onChange = vi.fn();
    render(
      <MovePicker
        pool={pool}
        value={{ fast: 'ROCK_SMASH', charged: ['HYDRO_PUMP'] }}
        onChange={onChange}
      />,
    );
    const reset = screen.getByRole('button', { name: /Reset to recommended/ });
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    expect(onChange).toHaveBeenCalledWith({ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] });
    expect(screen.getByRole('checkbox', { name: /Play Rough/ })).toHaveTextContent('Elite TM');
    expect(screen.getByRole('checkbox', { name: /Ice Beam/ })).toHaveTextContent('7');
  });

  it('never bumps: with two picked, the other charged rows are disabled with a hint', () => {
    const onChange = vi.fn();
    render(<MovePicker pool={pool} value={{ fast: f1, charged: [c1, c2] }} onChange={onChange} />);
    const third = screen.getByRole('checkbox', { name: new RegExp(nameOf(c3)) });
    expect(third).toBeDisabled();
    expect(screen.getByText('Untick one to pick another')).toBeInTheDocument();
    fireEvent.click(third);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the last charged move ticked', () => {
    const onChange = vi.fn();
    render(<MovePicker pool={pool} value={{ fast: f1, charged: [c1] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(nameOf(c1)) }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Untick one to pick another')).not.toBeInTheDocument();
  });

  it('has no hint and no disabled row when the pool has only two charged moves', () => {
    const small = { ...pool, charged: pool.charged.slice(0, 2) };
    render(<MovePicker pool={small} value={{ fast: f1, charged: [c1, c2] }} onChange={vi.fn()} />);
    expect(screen.queryByText('Untick one to pick another')).not.toBeInTheDocument();
    for (const row of screen.getAllByRole('checkbox')) {
      expect(row).not.toBeDisabled();
    }
  });

  it('shows the recommended set and tags what differs from it', () => {
    render(
      <MovePicker
        pool={pool}
        value={{ fast: pool.recommended.fast, charged: [c3] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Recommended:/)).toBeInTheDocument();
    const changed = screen.getByRole('checkbox', { name: new RegExp(nameOf(c3)) });
    expect(within(changed).getByText('Changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How move counts work' })).toBeInTheDocument();
  });
});
