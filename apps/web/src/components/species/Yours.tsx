import type { Specimen, Verdict } from '@pickthree/engine';
import { Button, IconButton, Tag } from '@pickthree/ui';
import { useState } from 'react';
import { PinGlyph, PlusGlyph, VerdictTag, useName } from '../../components.tsx';
import { hashFor } from '../../state/store.tsx';
import { copyLine } from './ShownCopy.tsx';

/** How many copies show before "Show all". */
const FIRST = 3;

export interface YoursRow {
  sp: Specimen;
  verdict: Verdict;
}

/**
 * Your copies on a species page, best IV rank for the page's species first: three, then "Show
 * all". A tap shows that copy at the top of the page. The pinned copy carries a filled pin; the
 * one shown, when it is another, says so.
 */
export function Yours({
  speciesId,
  leagueTitle,
  rows,
  pinnedId,
  shownId,
  onShow,
}: {
  speciesId: string;
  leagueTitle: string;
  rows: readonly YoursRow[];
  pinnedId: string | null;
  shownId: string | null;
  onShow: (id: string) => void;
}) {
  const name = useName();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FIRST);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <h3>Yours</h3>
        <IconButton label="Add one" href={hashFor({ screen: 'add', species: speciesId })}>
          <PlusGlyph />
        </IconButton>
      </div>
      <div className="card sp-yours" style={{ padding: '0 14px', gap: 0 }}>
        {shown.map(({ sp, verdict }) => (
          <a
            className="spec-row sub"
            key={sp.id}
            href={hashFor({ screen: 'species', id: speciesId, copy: sp.id })}
            style={{ gridTemplateColumns: '1fr auto' }}
            aria-current={sp.id === shownId ? 'true' : undefined}
            onClick={(e) => {
              // Swapping the copy shown is not a new screen: Back still leaves the page.
              e.preventDefault();
              onShow(sp.id);
            }}
          >
            <span className="meta" style={{ display: 'block' }}>
              {copyLine(sp, verdict, speciesId, name)}
            </span>
            <span className="row" style={{ gap: 6, alignItems: 'center' }}>
              {sp.id === pinnedId ? (
                <span className="muted sp-pinned" role="img" aria-label="Pinned">
                  <PinGlyph on />
                </span>
              ) : null}
              {sp.id === shownId && sp.id !== pinnedId ? <Tag tone="neutral">Shown</Tag> : null}
              <VerdictTag label={verdict.label} />
            </span>
          </a>
        ))}
      </div>
      {rows.length > FIRST ? (
        <div style={{ display: 'flex', marginLeft: -8 }}>
          <Button variant="text" ariaExpanded={all} onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${rows.length}`}
          </Button>
        </div>
      ) : null}
      <p className="small muted" style={{ margin: 0 }}>
        Best IV rank for {leagueTitle} first. Tap one to show it.
      </p>
    </div>
  );
}
