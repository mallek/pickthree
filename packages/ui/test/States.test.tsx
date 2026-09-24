import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Empty, ErrorState, Loading } from '../src/index.ts';

describe('Loading', () => {
  it('announces its stage and fills to the share done', () => {
    const { container } = render(
      <Loading label="Simulating battles with your exact Pokémon" done={3} total={4} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Simulating battles with your exact Pokémon');
    expect(container.querySelector<HTMLElement>('.ui-loading-bar span')?.style.width).toBe('75%');
  });

  it('shows an indeterminate bar when the total is unknown', () => {
    const { container } = render(<Loading label="Checking which Pokémon fit the league" />);
    expect(container.querySelector('.ui-loading-bar')).toHaveClass('indeterminate');
  });
});

describe('Empty and ErrorState', () => {
  it('Empty says what to do and can offer an action', () => {
    render(
      <Empty
        line="No team fits these filters. Loosen one to see recommendations again."
        action={<button type="button">Filters</button>}
      />,
    );
    expect(screen.getByText(/No team fits these filters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('ErrorState is an alert', () => {
    render(<ErrorState line="Could not load the shared teams. Try again in a moment." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the shared teams.');
  });
});
