import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoticeToast } from '../src/components/NoticeToast.tsx';
import { AppProvider, useActions, useAppState, type NoticeTone } from '../src/state/store.tsx';
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

function NotifyAction({ run }: { run: () => void }) {
  const { notify } = useActions();
  return (
    <button
      type="button"
      onClick={() => notify('Retro Cup is live this week.', 'info', { label: 'Switch', run })}
    >
      raise with action
    </button>
  );
}

function renderActionNotice(run: () => void) {
  render(
    <AppProvider host={fakeHost()}>
      <NotifyAction run={run} />
      <NoticeToast />
    </AppProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'raise with action' }));
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

/** A stand-in page foot: the tab bar on Your Meta, Log a Battle's taller result bar on its page. */
function Foot() {
  const s = useAppState();
  const { navigate } = useActions();
  return (
    <>
      <button type="button" onClick={() => navigate({ screen: 'meta-log' })}>
        log a battle
      </button>
      {s.route.screen === 'meta-log' ? <div className="result-bar" /> : <nav className="tabs" />}
    </>
  );
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

  it("moves a confirmation above the new page's bar when the page changes while it is up", async () => {
    window.history.replaceState(null, '', '#/meta');
    // jsdom lays nothing out: each bar's top is stubbed, the tab bar 56px tall, the result bar 120.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const h = this.classList.contains('result-bar')
        ? 120
        : this.classList.contains('tabs')
          ? 56
          : 0;
      const top = window.innerHeight - h;
      return {
        top,
        bottom: top + h,
        height: h,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: top,
      } as DOMRect;
    });
    render(
      <AppProvider host={fakeHost()}>
        <Notify message="Link copied." tone="info" />
        <Foot />
        <NoticeToast />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'raise' }));
    expect(screen.getByRole('status')).toHaveStyle({ bottom: '68px' });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'log a battle' }));
    });
    // The route lands through the hashchange event; the notice is still up (well inside 3 s).
    await waitFor(() => expect(document.querySelector('.result-bar')).not.toBeNull());
    expect(screen.getByRole('status')).toHaveStyle({ bottom: '132px' });
    vi.restoreAllMocks();
  });

  it('shows an action button on an info notice, runs it, and clears the notice', () => {
    const run = vi.fn();
    renderActionNotice(run);
    expect(screen.getByRole('status')).toHaveTextContent('Retro Cup is live this week.');
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lets an action notice be dismissed without running the action', () => {
    const run = vi.fn();
    renderActionNotice(run);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps an action notice up for 8 seconds, not the 3 of a plain confirmation', () => {
    vi.useFakeTimers();
    renderActionNotice(vi.fn());
    act(() => {
      vi.advanceTimersByTime(7900);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
