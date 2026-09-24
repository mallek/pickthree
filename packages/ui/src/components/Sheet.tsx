import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Chevron } from './Chevron.tsx';
import { trapTab, useReturnFocus } from './focus.ts';

export interface SheetNav {
  push: (page: SheetPage) => void;
  pop: () => void;
  close: () => void;
  depth: number;
}

export interface SheetPage {
  id: string;
  title: string;
  render: (nav: SheetNav) => ReactNode;
}

/**
 * A bottom sheet with pages: grabber, back (named for the page below, only once a page is
 * pushed), title, Done. Done, Escape and the overlay close the whole sheet from any depth; focus
 * stays inside while it is open and returns to the opener when it closes. Rendered through a
 * portal to `document.body` by default: a caller that opens the sheet from inside its own
 * stacking context (a sticky header, for one) would otherwise trap the sheet's z-index inside
 * that context, where a later sibling with a lower z-index (the app's fixed tab bar) can still
 * paint on top of it. `container` overrides the portal target; the gallery is the one caller that
 * needs this, so several open sheets can sit in their own mock phone frames on one long page
 * instead of all pinning to the real viewport and covering each other.
 */
export function Sheet({
  root,
  onClose,
  doneLabel = 'Done',
  container,
}: {
  root: SheetPage;
  onClose: () => void;
  doneLabel?: string;
  container?: Element;
}) {
  const [stack, setStack] = useState<SheetPage[]>([root]);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useReturnFocus();
  const top = stack[stack.length - 1] ?? root;
  // Focus the sheet on open and again on every page change: the control that pushed or popped
  // the page is gone, and focus left on the body would take Escape and Tab out of the sheet.
  useEffect(() => {
    dialog.current?.focus();
  }, [top.id]);
  const below = stack.length > 1 ? stack[stack.length - 2] : undefined;
  const nav: SheetNav = {
    push: (page) => setStack((s) => [...s, page]),
    pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    close: onClose,
    depth: stack.length - 1,
  };
  return createPortal(
    <>
      <div className="ui-overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="ui-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(e) => {
          // Escape and Tab stop here: React events bubble through the React tree, so a sheet
          // opened from inside another modal layer would otherwise close or trap for it too.
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
            return;
          }
          if (e.key === 'Tab') {
            trapTab(e, dialog.current);
            e.stopPropagation();
          }
        }}
      >
        <div className="ui-grabber">
          <span />
        </div>
        <div className="ui-sheet-head">
          {below ? (
            <button type="button" className="back" onClick={nav.pop}>
              <Chevron dir="left" />
              {below.title}
            </button>
          ) : (
            <span className="back-spacer" />
          )}
          <h3 id={titleId} className="ui-sheet-title">
            {top.title}
          </h3>
          <button type="button" className="ui-sheet-done" onClick={onClose}>
            {doneLabel}
          </button>
        </div>
        <div className="ui-sheet-body" key={top.id}>
          {top.render(nav)}
        </div>
      </div>
    </>,
    container ?? document.body,
  );
}
