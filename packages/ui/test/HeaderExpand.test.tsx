import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ExpandRow, Header } from '../src/index.ts';

describe('Header', () => {
  it('top: a page title as a level-2 heading, with its actions', () => {
    render(<Header variant="top" title="Your Teams" actions={<button type="button">Settings</button>} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Your Teams' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('top: shows the site mark beside the title', () => {
    render(<Header variant="top" title="Teams" mark={<span>meta</span>} />);
    expect(screen.getByText('meta')).toBeInTheDocument();
  });

  it('sub: a back button that calls back', async () => {
    const onBack = vi.fn();
    render(<Header variant="sub" title="Team Analysis" back={{ label: 'Teams', onClick: onBack }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Teams' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Team Analysis')).toBeInTheDocument();
  });

  it('sub: a back link when given an href', () => {
    render(<Header variant="sub" title="Melmetal" back={{ label: 'Great', href: '#/pokemon' }} />);
    expect(screen.getByRole('link', { name: 'Great' })).toHaveAttribute('href', '#/pokemon');
  });
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <ExpandRow summary="Araquanid, Melmetal" open={open} onToggle={() => setOpen((o) => !o)}>
      <p>Seen with Mimikyu</p>
    </ExpandRow>
  );
}

describe('ExpandRow', () => {
  it('opens and closes, and says so', async () => {
    render(<Harness />);
    const head = screen.getByRole('button', { name: /Araquanid, Melmetal/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Seen with Mimikyu')).toBeNull();
    await userEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Seen with Mimikyu')).toBeVisible();
    await userEvent.click(head);
    expect(screen.queryByText('Seen with Mimikyu')).toBeNull();
  });

  it('points the button at the region it controls', async () => {
    render(<Harness />);
    const head = screen.getByRole('button', { name: /Araquanid/ });
    await userEvent.click(head);
    const id = head.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')).toContainElement(screen.getByText('Seen with Mimikyu'));
  });
});
