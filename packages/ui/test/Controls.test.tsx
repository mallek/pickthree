import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterButton, LeagueSwitcher, Select } from '../src/index.ts';

describe('Select', () => {
  it('always prints its label', () => {
    render(
      <Select
        label="Window"
        value="meta"
        onChange={() => undefined}
        options={[
          { value: 'meta', label: 'This meta' },
          { value: '7', label: '7 days' },
        ]}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Window' });
    const caption = select.closest('.field')?.querySelector('.field-l');
    expect(caption?.textContent).toBe('Window');
    expect(caption).not.toHaveClass('vh');
  });
});

describe('LeagueSwitcher', () => {
  const options = [
    { value: 'great', label: 'Great' },
    { value: 'ultra', label: 'Ultra' },
    { value: 'master', label: 'Master' },
  ];

  it('renders no overflow control unless asked', () => {
    render(<LeagueSwitcher label="League" value="great" onChange={() => undefined} options={options} />);
    expect(screen.queryByRole('button', { name: 'More leagues and cups' })).toBeNull();
  });

  it('adds an overflow control outside the radio group', async () => {
    const onMore = vi.fn();
    render(
      <LeagueSwitcher
        label="League"
        value="great"
        onChange={() => undefined}
        options={options}
        more={{ label: 'More leagues and cups', onClick: onMore }}
      />,
    );
    const more = screen.getByRole('button', { name: 'More leagues and cups' });
    expect(screen.getByRole('radiogroup', { name: 'League' })).not.toContainElement(more);
    await userEvent.click(more);
    expect(onMore).toHaveBeenCalledTimes(1);
  });
});

describe('FilterButton', () => {
  it('names the count for a screen reader', () => {
    render(<FilterButton count={2} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Filters, 2 on' })).toHaveClass('on');
  });

  it('says only Filters when none are on', () => {
    render(<FilterButton count={0} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Filters' })).not.toHaveClass('on');
  });
});
