import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { trapTab, useReturnFocus } from './focus.ts';

/**
 * The in-app confirm, in place of window.confirm: the question as the title, one line on what
 * happens, two buttons that say what they do. Focus starts on Cancel so Enter never confirms by
 * accident. `danger` is only for actions that destroy data (Forget, sharing off, Remove); Start
 * fresh moves battles and deletes nothing, so it keeps the default tone. onConfirm runs at most
 * once per mount, so a fast double tap cannot remove two battles before the parent unmounts it.
 * Rendered through a portal to `document.body` by default, same reason as `Sheet`: opened from
 * inside a caller's own stacking context, its z-index would otherwise only compete inside that
 * context. `container` overrides the portal target, for the gallery's own mock phone frames.
 */
export function ConfirmSheet({
  title,
  line,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
  container,
}: {
  title: string;
  line: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  container?: Element;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);
  const titleId = useId();
  const lineId = useId();
  useReturnFocus();
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  return createPortal(
    <>
      <div className="ui-overlay" onClick={onCancel} aria-hidden="true" />
      <div
        className="ui-sheet ui-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={lineId}
        ref={box}
        onKeyDown={(e) => {
          // Escape and Tab stop here: React events bubble through the React tree, so a confirm
          // inside a Sheet page would otherwise also close the Sheet or run its Tab trap.
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
            return;
          }
          if (e.key === 'Tab') {
            trapTab(e, box.current);
            e.stopPropagation();
          }
        }}
      >
        <div className="ui-grabber">
          <span />
        </div>
        <h3 id={titleId} className="ui-confirm-title">
          {title}
        </h3>
        <p id={lineId} className="ui-confirm-line">
          {line}
        </p>
        <div className="ui-confirm-actions">
          <button ref={cancel} type="button" className="ui-btn ui-btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ui-btn ${tone === 'danger' ? 'ui-btn-danger' : 'ui-btn-primary'}`}
            {...(tone === 'danger' ? {} : { 'data-audit-contrast': 'static' })}
            onClick={() => {
              if (confirmed.current) {
                return;
              }
              confirmed.current = true;
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>,
    container ?? document.body,
  );
}
