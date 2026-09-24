import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from '../src/index.ts';

describe('Button', () => {
  it('renders each variant as a button with its class', () => {
    for (const variant of ['primary', 'secondary', 'text', 'danger'] as const) {
      const { unmount } = render(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(`ui-btn-${variant}`);
      unmount();
    }
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
