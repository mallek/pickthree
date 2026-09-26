import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from '../src/index.ts';

describe('Button', () => {
  it('renders each variant as a button with its class', () => {
    const variants = ['primary', 'secondary', 'text', 'danger', 'win', 'loss', 'warn'] as const;
    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(`ui-btn-${variant}`);
      unmount();
    }
  });

  it('marks only the primary gradient for the static contrast test', () => {
    render(
      <>
        <Button variant="primary">Analyze</Button>
        <Button variant="secondary">Change team</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Analyze' })).toHaveAttribute(
      'data-audit-contrast',
      'static',
    );
    expect(screen.getByRole('button', { name: 'Change team' })).not.toHaveAttribute(
      'data-audit-contrast',
    );
  });

  it('calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Log a battle</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Log a battle' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a link when given an href', () => {
    render(<Button href="https://meta.pick3.gg">Open meta</Button>);
    expect(screen.getByRole('link', { name: 'Open meta' })).toHaveAttribute(
      'href',
      'https://meta.pick3.gg',
    );
  });

  it('marks the pressed one of a set where a tap selects, and says nothing otherwise', () => {
    render(
      <>
        <Button variant="win" pressed>
          Win
        </Button>
        <Button variant="loss" pressed={false}>
          Loss
        </Button>
        <Button variant="warn">Tanked</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Win' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Loss' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Tanked' })).not.toHaveAttribute('aria-pressed');
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Analyze
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('takes its accessible name from label', () => {
    render(
      <IconButton label="Settings" onClick={() => undefined}>
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveClass('ui-icon-btn');
  });

  it('marks the active state', () => {
    render(
      <IconButton label="Filters" onClick={() => undefined} active>
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveClass('active');
  });
});
