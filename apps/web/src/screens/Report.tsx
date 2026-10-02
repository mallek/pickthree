import { useState } from 'react';
import { Button, ConfirmSheet } from '@pickthree/ui';
import { PokemonToken, useName } from '../components.tsx';
import { layoutLine, layoutNotes } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';

interface Row {
  n: number;
  label: string;
  sub?: string;
  fix?: string | undefined;
  names: string[];
  ids?: string[] | undefined;
  /** A button under the fix line, for the one row the player can act on here. */
  action?: { label: string; run: () => void } | undefined;
}

export function Report() {
  const { collection } = useAppState();
  const { navigate, removeMissing } = useActions();
  const name = useName();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!collection) {
    navigate({ screen: 'welcome' });
    return null;
  }
  const r = collection.report;
  const dupNames = [...new Set(collection.specimens.map((s) => s.speciesId))].slice(0, 0);
  const rows: Row[] = [
    { n: r.scansRead, label: 'Scans read', names: [] },
    {
      n: r.recognized,
      label: 'Pokémon recognized',
      sub: `${r.recognized - r.missingIvs.count} with IVs, ready to rank`,
      names: [],
    },
    {
      n: r.duplicatesMerged,
      label: 'Duplicate scans',
      sub: 'Same Pokémon scanned twice in this file',
      fix: r.duplicatesMerged > 0 ? 'Kept the newest scan of each. Nothing to do.' : undefined,
      names: dupNames,
    },
    {
      n: r.missingIvs.count,
      label: 'Skipped for missing IVs',
      sub: 'The scan had no IV appraisal',
      fix:
        r.missingIvs.count > 0
          ? `Rescan these ${r.missingIvs.count} with the IV appraisal screen open, then upload again.`
          : undefined,
      names: [...new Set(r.missingIvs.names)].slice(0, 12),
      ids: collection.specimens
        .filter((s) => s.ivs === null)
        .map((s) => s.speciesId)
        .slice(0, 12),
    },
    {
      n: r.unrecognized.reduce((a, u) => a + u.count, 0),
      label: 'Species not recognized',
      sub: 'Newer than our game data, or a form we do not support yet',
      fix:
        r.unrecognized.length > 0
          ? 'Check back after the next game-data update. They are left out of team building.'
          : undefined,
      names: r.unrecognized.map((u) => (u.form ? `${u.name} (${u.form})` : u.name)),
    },
  ];
  // A re-import: what the scan did to the collection already stored.
  const m = r.merge;
  if (m) {
    const missing = new Set(m.notInScan);
    rows.splice(
      3,
      0,
      { n: m.added, label: 'New', sub: 'Added by this import', names: [] },
      {
        n: m.merged,
        label: 'Merged',
        sub: `Matched a Pokémon you already had, ${m.updated} updated by a newer scan`,
        names: [],
      },
      {
        n: m.skipped,
        label: 'Skipped (deleted)',
        sub: 'Matched a Pokémon you removed',
        fix:
          m.skipped > 0
            ? 'They stay removed. Add one back by hand if you removed it by mistake.'
            : undefined,
        names: [],
      },
      {
        n: m.notInScan.length,
        label: 'Not in this scan',
        sub: 'Kept in your collection',
        fix:
          m.notInScan.length > 0
            ? 'pick3 keeps what a scan leaves out. If you transferred these, remove them.'
            : undefined,
        names: [],
        ids: collection.specimens
          .filter((s) => missing.has(s.id))
          .map((s) => s.speciesId)
          .slice(0, 12),
        action:
          m.notInScan.length > 0
            ? { label: 'Remove them', run: () => setConfirmRemove(true) }
            : undefined,
      },
    );
  }
  if (r.rowProblems.length > 0) {
    rows.push({
      n: r.rowProblems.length,
      label: 'Lines that could not be read',
      sub: 'Malformed rows in the file',
      fix: 'These lines were skipped. Export the file again if the count looks wrong.',
      names: r.rowProblems.slice(0, 8).map((p) => `line ${p.line}: ${p.detail}`),
    });
  }
  const readAs = layoutLine(r.layout);
  const notes = layoutNotes(
    r.layout,
    collection.specimens.some((s) => s.shadow),
  );
  return (
    <div className="screen">
      <div className="scroll" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 48px)' }}>
        <div>
          <div className="kicker">Import finished</div>
          <h2 style={{ marginTop: 4, fontSize: 26 }}>
            {m ? collection.specimens.length : r.recognized} Pokémon ready to build teams from
          </h2>
          {collection.fileName ? <p className="meta">{collection.fileName}</p> : null}
          {readAs ? <p className="meta">{readAs}</p> : null}
        </div>
        <div className="report">
          {rows.map((row, i) => {
            const problem = Boolean(row.fix) && row.n > 0;
            const isOpen = Boolean(open[i]);
            return (
              <div className="report-row" key={row.label}>
                <button
                  type="button"
                  className="report-head"
                  style={{ cursor: problem ? 'pointer' : 'default' }}
                  onClick={() => problem && setOpen((o) => ({ ...o, [i]: !isOpen }))}
                  aria-expanded={problem ? isOpen : undefined}
                >
                  <span className={`report-n${problem ? ' warn' : ''}`}>{row.n}</span>
                  <span>
                    <span>{row.label}</span>
                    {row.sub ? (
                      <span className="meta" style={{ display: 'block' }}>
                        {row.sub}
                      </span>
                    ) : null}
                  </span>
                  {problem ? (
                    <span className={`chev${isOpen ? ' open' : ''}`}>&#8964;</span>
                  ) : (
                    <span />
                  )}
                </button>
                {problem && isOpen ? (
                  <div className="report-body">
                    <div className="fix">{row.fix}</div>
                    <div className="pills">
                      {row.ids
                        ? row.ids.map((id, k) => (
                            <span className="pill" key={`${id}-${k}`}>
                              <PokemonToken speciesId={id} size={16} showInitial={false} />
                              {name(id)}
                            </span>
                          ))
                        : row.names.map((n) => (
                            <span className="pill" key={n}>
                              {n}
                            </span>
                          ))}
                    </div>
                    {row.action ? (
                      <div>
                        <Button variant="danger" onClick={row.action.run}>
                          {row.action.label}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {notes.map((n) => (
          <p className="small muted" key={n}>
            {n}
          </p>
        ))}
        <p className="small muted">
          IVs are the three hidden stats a scanner reads from the appraisal screen. Without them,
          pick3 cannot rank a Pokémon.
        </p>
      </div>
      {confirmRemove && m ? (
        <ConfirmSheet
          title={`Remove ${m.notInScan.length} Pokémon?`}
          line="They leave your collection and a later import will not bring them back."
          confirmLabel="Remove them"
          cancelLabel="Keep them"
          tone="danger"
          onConfirm={() => {
            setConfirmRemove(false);
            void removeMissing();
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
      <div className="bottom-actions">
        <button type="button" className="btn" onClick={() => navigate({ screen: 'teams' })}>
          Show my teams
        </button>
        <button type="button" className="btn-ghost" onClick={() => navigate({ screen: 'add' })}>
          Add more by hand &rsaquo;
        </button>
      </div>
    </div>
  );
}
