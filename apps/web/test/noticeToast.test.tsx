import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoticeToast } from '../src/components/NoticeToast.tsx';
import { AppProvider, useActions, type NoticeTone } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

function Notify({ message, tone }: { message: string; tone?: NoticeTone | undefined }) {
  const { notify } = useActions();
  return (
    <button type="button" onClick={() => notify(message, tone)}>
      raise
    </button>
  );
}

function renderNotice(message: string, tone?: NoticeTone) {
  render(
    <AppProvider host={fakeHost()}>
      <Notify message={message} tone={tone} />
      <NoticeToast />
    </AppProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'raise' }));
}

describe('NoticeToast', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a confirmation at the foot, with no OK, gone on a tap', () => {
    renderNotice('Win logged · 2 with this team', 'info');
    const toast = screen.getByRole('status');
    expect(toast).toHaveClass('notice-info', 'notice-foot');
    expect(toast).not.toHaveClass('notice-warn');
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Win logged · 2 with this team'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clears a confirmation after about 3 seconds', () => {
    vi.useFakeTimers();
    renderNotice('Link copied. Paste it anywhere; it opens this team in pick3.', 'info');
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2900);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps a warning at the top with its OK, for 8 seconds', () => {
    vi.useFakeTimers();
    renderNotice('Could not save that battle.');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('notice-warn');
    expect(alert).not.toHaveClass('notice-foot');
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveTextContent('OK');
    act(() => {
      vi.advanceTimersByTime(7900);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
