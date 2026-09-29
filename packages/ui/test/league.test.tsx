import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueList } from '../src/components/League.tsx';

describe('LeagueList detail lines', () => {
  it('shows each detail line under the title and keeps the title as the name', () => {
    render(
      <LeagueList
        label="Leagues"
        value="great"
        onChange={() => undefined}
        options={[
          { value: 'great', label: 'Great League' },
          {
            value: 'little',
            label: 'Little Cup',
            detail: ['Starts Tue 10/13', 'PvPoke last updated March 2024'],
          },
        ]}
      />,
    );
    const row = screen.getByRole('radio', { name: 'Little Cup' });
    expect(row).toHaveAccessibleDescription('Starts Tue 10/13 PvPoke last updated March 2024');
    expect(screen.getByText('PvPoke last updated March 2024')).toHaveClass('ui-league-row-detail');
    expect(screen.getByRole('radio', { name: 'Great League' })).not.toHaveAttribute(
      'aria-describedby',
    );
  });
});
