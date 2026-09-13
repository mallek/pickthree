import { useState } from 'react';
import { PokemonToken, useName } from '../components.tsx';
import { useActions, useAppState } from '../state/store.tsx';

interface Row {
  n: number;
  label: string;
  sub?: string;
  fix?: string | undefined;
  names: string[];
  ids?: string[] | undefined;
}

export function Report() {
  const { collection } = useAppState();
  const { navigate } = useActions();
  const name = useName();
  const [open, setOpen] = useState<Record<number, boolean>>({});
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
      label: 'Duplicates merged',
      sub: 'Same Pokémon scanned twice',
      fix: r.duplicatesMerged > 0 ? 'Kept the newest scan of each. Nothing to do.' : undefined,
      names: dupNames,
    },
    {
      n: r.missingIvs.count,
      label: 'Skipped for missing IVs',
      sub: 'Poke Genie saved a scan without the appraisal',
      fix:
        r.missingIvs.count > 0
          ? `Rescan these ${r.missingIvs.count} in Poke Genie with the IV appraisal screen open, then upload again.`
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
  if (r.rowProblems.length > 0) {
    rows.push({
      n: r.rowProblems.length,
      label: 'Lines that could not be read',
      sub: 'Malformed rows in the file',
      fix: 'These lines were skipped. Re-export from Poke Genie if the count looks wrong.',
      names: r.rowProblems.slice(0, 8).map((p) => `line ${p.line}: ${p.detail}`),
    });
  }
  const optional = r.header.missingOptional.length;
  return (
    <div className="screen">
      <div className="scroll" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 48px)' }}>
        <div>
          <div className="kicker">Import finished</div>
          <h2 style={{ marginTop: 4, fontSize: 26 }}>
            {r.recognized} Pokémon ready to build teams from
          </h2>
          {collection.fileName ? <p className="meta">{collection.fileName}</p> : null}
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
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {optional > 0 ? (
          <p className="small muted">
            {optional} optional column{optional === 1 ? '' : 's'} missing from this export (
            {r.header.missingOptional.slice(0, 4).join(', ')}
            {optional > 4 ? ', ...' : ''}). Results still work; some details may be blank.
          </p>
        ) : null}
        <p className="small muted">
          IVs are the three hidden stats Poke Genie reads from the appraisal screen. Without them,
          PickThree cannot rank a Pokémon.
        </p>
      </div>
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
