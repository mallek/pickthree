import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmSheet, Sheet, type SheetPage } from '../src/index.ts';

const about: SheetPage = { id: 'about', title: 'About', render: () => <p>Game data</p> };
const settings: SheetPage = {
  id: 'settings',
  title: 'Settings',
  render: (nav) => (
    <button type="button" onClick={() => nav.push(about)}>
      About
    </button>
  ),
};

function Opener({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open settings
      </button>
      {open ? (
        <Sheet
          root={settings}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

describe('Sheet', () => {
  it('pushes a page with a back control named for the page below', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.getByRole('dialog', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByText('Game data')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('Done closes the whole sheet from a pushed page, once', async () => {
    const onClose = vi.fn();
    render(<Opener onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'About' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape closes from a pushed page and focus returns to the opener', async () => {
    const onClose = vi.fn();
    render(<Opener onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open settings' });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'About' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside the sheet', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    const done = screen.getByRole('button', { name: 'Done' });
    done.focus();
    await userEvent.tab();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('wraps Tab from the last control to the first, and Shift+Tab from the first to the last', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    // On the root page the head has no back control, so Done is the first control and the
    // page's About button the last.
    const done = screen.getByRole('button', { name: 'Done' });
    const about = screen.getByRole('button', { name: 'About' });
    about.focus();
    await userEvent.tab();
    expect(done).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(about).toHaveFocus();
  });

  it('Escape in a ConfirmSheet inside a page cancels only the confirm, the sheet stays open', async () => {
    const onClose = vi.fn();
    const onCancel = vi.fn();
    function Confirming() {
      const [asking, setAsking] = useState(false);
      if (!asking) {
        return (
          <button type="button" onClick={() => setAsking(true)}>
            Remove battle
          </button>
        );
      }
      return (
        <ConfirmSheet
          title="Remove this battle?"
          line="It leaves your log."
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onConfirm={() => undefined}
          onCancel={() => {
            onCancel();
            setAsking(false);
          }}
        />
      );
    }
    const page: SheetPage = { id: 'log', title: 'Log', render: () => <Confirming /> };
    render(<Sheet root={page} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove battle' }));
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Log' })).toBeInTheDocument();
  });
});
