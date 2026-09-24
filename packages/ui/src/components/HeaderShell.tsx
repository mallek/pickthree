import type { ReactNode } from 'react';

/**
 * The shell every sticky page header shares: a back slot (or spacer, so the title stays
 * centred) on the left, the title and an optional subtitle in the middle, an actions slot on the
 * right (or spacer), and an optional extra row underneath that scrolls with the header. It owns
 * layout only; `Header` (top and sub) is what both sites now render on top of it (design
 * foundation, 2026-09-24).
 */
export function HeaderShell({
  back,
  title,
  sub,
  actions,
  extra,
}: {
  back?: ReactNode;
  title: string;
  sub?: string | undefined;
  actions?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <header className="hdr">
      {back ?? <span className="back-spacer" />}
      <span className="hdr-title">
        <span>{title}</span>
        {sub ? <span className="hdr-sub">{sub}</span> : null}
      </span>
      {actions ? <span className="hdr-actions">{actions}</span> : <span className="back-spacer" />}
      {extra ? <div className="hdr-extra">{extra}</div> : null}
    </header>
  );
}
