import type { ReactNode } from 'react';
import { Chevron } from './Chevron.tsx';
import { HeaderShell } from './HeaderShell.tsx';

export interface HeaderBack {
  label: string;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
}

/**
 * The two headers both sites use. `top`: a tab's own page, a page title and icon buttons, no back.
 * `sub`: a page reached from another, back on the left, the title centered, icon buttons on the
 * right. `mark` is meta.pick3.gg's small site mark beside a top title; pick3 leaves it out.
 * Back should return to where the reader came from (the app decides how); a jump somewhere else
 * is a labeled action, not the back control.
 */
export function Header({
  variant,
  title,
  back,
  actions,
  mark,
  sub,
}: {
  variant: 'top' | 'sub';
  title: string;
  back?: HeaderBack | undefined;
  actions?: ReactNode;
  mark?: ReactNode;
  sub?: string | undefined;
}) {
  if (variant === 'top') {
    return (
      <header className="ui-top">
        <div className="ui-top-row">
          <div className="ui-top-title">
            <h2>{title}</h2>
            {mark ?? null}
          </div>
          {actions ? <div className="ui-top-actions">{actions}</div> : null}
        </div>
        {sub ? <p className="ui-top-sub">{sub}</p> : null}
      </header>
    );
  }
  const backNode =
    back === undefined ? undefined : back.href !== undefined ? (
      <a className="back" href={back.href}>
        <Chevron dir="left" />
        {back.label}
      </a>
    ) : (
      <button type="button" className="back" onClick={back.onClick}>
        <Chevron dir="left" />
        {back.label}
      </button>
    );
  return <HeaderShell back={backNode} title={title} sub={sub} actions={actions} />;
}
