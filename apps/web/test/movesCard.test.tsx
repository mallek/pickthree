import type { MoveChoice, MovePool } from '@pickthree/engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MovesCard, movesEntered } from '../src/components/species/MovesCard.tsx';

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
  fast: [move('BUBBLE', 'Bubble'), move('ROCK_SMASH', 'Rock Smash')],
  charged: [
    move('HYDRO_PUMP', 'Hydro Pump', { counts: [10, 9, 10] }),
    move('ICE_BEAM', 'Ice Beam', { counts: [7, 7, 7] }),
    move('PLAY_ROUGH', 'Play Rough', { tm: 'elite', counts: [8, 7, 8] }),
  ],
  recommended: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
  source: 'rankings',
};

const radio = (name: RegExp) => screen.getByRole('radio', { name });
const box = (name: RegExp) => screen.getByRole('checkbox', { name });

describe('MovesCard', () => {
  it('read only: ticks the moves the copy knows, stars the recommended set, takes no taps', () => {
    render(
      <MovesCard
        pool={pool}
        known={{ fast: 'ROCK_SMASH', charged: ['HYDRO_PUMP'] }}
        leagueTitle="Great League"
      />,
    );
    expect(radio(/Rock Smash/)).toBeChecked();
    expect(radio(/Bubble/)).not.toBeChecked();
    expect(box(/Hydro Pump/)).toBeChecked();
    expect(box(/Ice Beam/)).not.toBeChecked();
    // The star is on PvPoke's set, known or not.
    expect(screen.getAllByRole('img', { name: 'Recommended' })).toHaveLength(3);
    expect(radio(/Bubble/).querySelector('.star-glyph')).not.toBeNull();
    expect(radio(/Rock Smash/).querySelector('.star-glyph')).toBeNull();
    for (const b of screen.getAllByRole('radio').concat(screen.getAllByRole('checkbox'))) {
      expect(b).toBeDisabled();
    }
    expect(screen.getByText('Recommended by PvPoke for Great League')).toBeTruthy();
  });

  it('with no moves entered, the recommended set is the one ticked', () => {
    render(<MovesCard pool={pool} known={null} leagueTitle="Great League" />);
    expect(radio(/Bubble/)).toBeChecked();
    expect(box(/Ice Beam/)).toBeChecked();
    expect(box(/Play Rough/)).toBeChecked();
    expect(box(/Hydro Pump/)).not.toBeChecked();
  });

  it('badges only the Elite TM move', () => {
    render(<MovesCard pool={pool} known={null} leagueTitle="Great League" />);
    expect(screen.getAllByText('Elite TM')).toHaveLength(1);
    expect(screen.queryByText('TM')).toBeNull();
    expect(screen.queryByText('Has it')).toBeNull();
  });

  it('says so when PvPoke has no set and the stars are the stat fallback', () => {
    render(
      <MovesCard pool={{ ...pool, source: 'fallback' }} known={null} leagueTitle="Great League" />,
    );
    expect(
      screen.getByText('Picked by move stats: PvPoke has no set for it in Great League'),
    ).toBeTruthy();
  });

  it('edit: a tap on a fast move enters the moves, keeping the ticked charged ones', () => {
    const onChange = vi.fn();
    render(<MovesCard pool={pool} known={null} onChange={onChange} leagueTitle="Great League" />);
    fireEvent.click(radio(/Rock Smash/));
    expect(onChange).toHaveBeenCalledWith({
      fast: 'ROCK_SMASH',
      charged: ['ICE_BEAM', 'PLAY_ROUGH'],
    });
  });

  it('edit: with two charged moves ticked a third waits, and unticking one frees it', () => {
    const onChange = vi.fn();
    render(
      <MovesCard
        pool={pool}
        known={{ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] }}
        onChange={onChange}
        leagueTitle="Great League"
      />,
    );
    expect(box(/Hydro Pump/)).toBeDisabled();
    expect(screen.getByText('Untick one to pick another')).toBeTruthy();
    fireEvent.click(box(/Ice Beam/));
    expect(onChange).toHaveBeenCalledWith({ fast: 'BUBBLE', charged: ['PLAY_ROUGH'] });
  });

  it('edit: the last charged move stays ticked, and a second can be added', () => {
    const onChange = vi.fn();
    render(
      <MovesCard
        pool={pool}
        known={{ fast: 'BUBBLE', charged: ['ICE_BEAM'] }}
        onChange={onChange}
        leagueTitle="Great League"
      />,
    );
    fireEvent.click(box(/Ice Beam/));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(box(/Hydro Pump/));
    expect(onChange).toHaveBeenCalledWith({ fast: 'BUBBLE', charged: ['ICE_BEAM', 'HYDRO_PUMP'] });
  });

  it('movesEntered: a fast move or any charged move counts', () => {
    expect(movesEntered({ fast: null, charged: [] })).toBe(false);
    expect(movesEntered({ fast: 'BUBBLE', charged: [] })).toBe(true);
    expect(movesEntered({ fast: null, charged: ['ICE_BEAM'] })).toBe(true);
  });
});
