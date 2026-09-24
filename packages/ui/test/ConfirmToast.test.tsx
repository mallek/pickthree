import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmSheet, Toast } from '../src/index.ts';

describe('ConfirmSheet', () => {
  it('opens with focus on Cancel, so Enter never confirms by accident', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmSheet
        title="Forget my collection and log?"
        line="This removes your collection, battle log and settings from this device."
        confirmLabel="Forget"
        cancelLabel="Keep everything"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('button', { name: 'Keep everything' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is an alert dialog named by its question and described by its line', () => {
    render(
      <ConfirmSheet
        title="Start fresh in Great League?"
        line="Your current battles move to Earlier seasons."
        confirmLabel="Start fresh"
        cancelLabel="Keep this season"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Start fresh in Great League?' });
    expect(dialog).toHaveAccessibleDescription('Your current battles move to Earlier seasons.');
  });

  it('uses the danger style only when asked', () => {
    const { rerender } = render(
      <ConfirmSheet
        title="t"
        line="l"
        confirmLabel="Start fresh"
        cancelLabel="Cancel"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Start fresh' })).toHaveClass('ui-btn-primary');
    rerender(
      <ConfirmSheet
        title="t"
        line="l"
        confirmLabel="Forget"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Forget' })).toHaveClass('ui-btn-danger');
  });

  it('Escape cancels', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmSheet
        title="t"
        line="l"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dismisses itself after its duration', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Win logged" onDismiss={onDismiss} duration={5000} />);
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('runs its action once even when tapped twice', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast message="Win logged" actionLabel="Undo" onAction={onAction} onDismiss={onDismiss} />,
    );
    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undo);
    fireEvent.click(undo);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('is announced politely', () => {
    render(<Toast message="Link copied" onDismiss={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
  });
});
