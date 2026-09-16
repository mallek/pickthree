import type { MoveChoice, MovePool } from '@pickthree/engine';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('a third charged move replaces the one picked first', () => {
    const onChange = vi.fn();
    render(
      <MovePicker
        pool={pool}
        value={{ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Hydro Pump/ }));
    expect(onChange).toHaveBeenCalledWith({
      fast: 'BUBBLE',
      charged: ['PLAY_ROUGH', 'HYDRO_PUMP'],
    });
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
});
