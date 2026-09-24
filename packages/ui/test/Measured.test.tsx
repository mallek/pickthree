import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MeasuredLine, MeasuredValue, ProgressCard, progressPercent } from '../src/index.ts';

describe('MeasuredValue', () => {
  it('prints the number beside the bar mark', () => {
    const { container } = render(<MeasuredValue value="13%" unit="of battles" />);
    expect(screen.getByText('13%')).toBeInTheDocument();
    expect(screen.getByText('of battles')).toBeInTheDocument();
    expect(container.querySelector('.ui-measured-bars')).not.toBeNull();
  });
});

describe('MeasuredLine', () => {
  it('leads its sentence with the dot mark', () => {
    const { container } = render(<MeasuredLine>27 anonymous battles also counted</MeasuredLine>);
    expect(container.querySelector('.ui-measured-dot')).not.toBeNull();
    expect(screen.getByText('27 anonymous battles also counted')).toBeInTheDocument();
  });
});

describe('progressPercent', () => {
  it('clamps past the goal, a zero goal and a negative count', () => {
    expect(progressPercent(12, 15)).toBe(80);
    expect(progressPercent(27, 15)).toBe(100);
    expect(progressPercent(0, 0)).toBe(100);
    expect(progressPercent(-3, 15)).toBe(0);
    expect(progressPercent(Number.NaN, 15)).toBe(0);
  });
});

describe('ProgressCard', () => {
  it('shows progress and keeps the contribution line apart', () => {
    render(
      <ProgressCard
        title="Make these teams personal"
        done={12}
        goal={15}
        line="Log 3 more battles to weight teams by what you actually face."
        contribution="Anonymous logs also improve the live meta."
      />,
    );
    expect(screen.getByRole('progressbar', { name: 'Make these teams personal' })).toHaveAttribute(
      'aria-valuenow',
      '80',
    );
    expect(screen.getByText('12 / 15')).toBeInTheDocument();
    expect(screen.getByText('Anonymous logs also improve the live meta.')).toBeInTheDocument();
  });

  it('renders no contribution line when none is given', () => {
    const { container } = render(<ProgressCard title="t" done={1} goal={15} line="l" />);
    expect(container.querySelector('.ui-measured-line')).toBeNull();
  });
});
