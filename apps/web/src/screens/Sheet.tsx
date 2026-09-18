import { useRef, useState } from 'react';
import { PokemonToken, Seg, useLogCount, useName } from '../components.tsx';
import { TrainerCounter, useTrainerCount } from '../components/TrainerCounter.tsx';
import { BAND_LABELS, BANDS, shareEnabled, type Band } from '../metaShare.ts';
import { dateLabel, num } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';
import { UpdateStatus } from '../components/UpdateToast.tsx';
import { Diagnostics } from '../components/Diagnostics.tsx';
import { LeagueSwitcher, useLeague } from '../components/LeagueSwitcher.tsx';

export function Sheet() {
  const s = useAppState();
  const {
    closeSheet,
    updateSettings,
    toggleExcluded,
    forget,
    navigate,
    startFresh,
    exportLog,
    importLog,
    setShareEnabled,
    setShareBand,
  } = useActions();
  const name = useName();
  const league = useLeague();
  const logCount = useLogCount();
  const trainers = useTrainerCount();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logNote, setLogNote] = useState<string | null>(null);

  const doExport = async (): Promise<void> => {
    const text = await exportLog();
    const name = `pick3-battle-log-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([text], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'pick3 battle log' });
        return;
      } catch {
        // The share sheet was dismissed or refused; fall through to a download.
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setLogNote(`Saved ${name}.`);
  };

  const doImport = async (file: File | null): Promise<void> => {
    if (!file) {
      return;
    }
    try {
      const r = await importLog(await file.text());
      setLogNote(
        `Added ${r.added} ${r.added === 1 ? 'set' : 'sets'}, skipped ${r.skipped} already here.`,
      );
    } catch (e) {
      setLogNote(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  };
  const f = s.settings.filters;
  const toggle = (k: 'noXl' | 'noShadow' | 'noEliteTm' | 'budget'): void =>
    updateSettings((cur) => ({ ...cur, filters: { ...cur.filters, [k]: !cur.filters[k] } }));
  const defs: { k: 'noXl' | 'noShadow' | 'noEliteTm' | 'budget'; label: string; sub: string }[] = [
    { k: 'noXl', label: 'No XL', sub: 'Skip builds that need XL Candy (levels above 40)' },
    { k: 'noShadow', label: 'No Shadows', sub: 'Skip Shadow Pokémon' },
    { k: 'noEliteTm', label: 'No Elite TM', sub: 'Skip movesets that need an Elite TM' },
    { k: 'budget', label: 'Budget builds', sub: 'Hide builds above your Stardust budget' },
  ];
  const excluded = s.settings.excludedSpecimenIds
    .map((id) => s.collection?.specimens.find((sp) => sp.id === id))
    .filter((sp): sp is NonNullable<typeof sp> => Boolean(sp));
  const themes: ('system' | 'dark' | 'light')[] = ['system', 'dark', 'light'];
  return (
    <>
      <div className="overlay" onClick={closeSheet} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-label="Settings">
        <div className="grabber">
          <span />
        </div>
        <div className="between" style={{ padding: '4px 20px 8px' }}>
          <h3 style={{ fontSize: 19 }}>Settings</h3>
          <button type="button" className="btn-ghost" onClick={closeSheet}>
            Done
          </button>
        </div>
        <div className="sheet-body">
          <div className={s.collection ? undefined : 'dimmed'}>
            {!s.collection ? (
              <span className="meta" style={{ display: 'block', paddingBottom: 6 }}>
                Filters apply once you have a collection.
              </span>
            ) : null}
            {defs.map((d) => (
              <button
                type="button"
                className="toggle"
                key={d.k}
                onClick={() => toggle(d.k)}
                aria-pressed={f[d.k]}
              >
                <span>
                  <span style={{ display: 'block', fontSize: 15 }}>{d.label}</span>
                  <span className="meta">{d.sub}</span>
                </span>
                <span className={`switch${f[d.k] ? ' on' : ''}`} />
              </button>
            ))}
            <div className="stack divider-top" style={{ paddingTop: 14, gap: 8 }}>
              <div className="between">
                <span>Stardust budget per Pokémon</span>
                <span
                  style={{
                    fontWeight: 500,
                    color: 'var(--accent-text)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {num(f.budgetCap)}
                </span>
              </div>
              <input
                type="range"
                min={20_000}
                max={500_000}
                step={10_000}
                value={f.budgetCap}
                onChange={(e) =>
                  updateSettings((cur) => ({
                    ...cur,
                    filters: { ...cur.filters, budgetCap: Number(e.target.value) },
                  }))
                }
                aria-label="Stardust budget"
              />
              <span className="meta">
                Applies when Budget builds is on. Builds costing more are left out.
              </span>
            </div>
          </div>
          <div className="stack divider-top" style={{ paddingTop: 14, gap: 8 }}>
            <span>Excluded Pokémon</span>
            {excluded.length === 0 ? (
              <span className="small muted">
                None yet. Open any Pokémon in your collection to exclude it from team suggestions.
              </span>
            ) : null}
            <div className="pills">
              {excluded.map((sp) => (
                <button
                  type="button"
                  className="x-chip"
                  key={sp.id}
                  onClick={() => toggleExcluded(sp.id)}
                >
                  <PokemonToken speciesId={sp.speciesId} size={20} showInitial={false} />
                  {name(sp.speciesId)}
                  <span className="muted">&times;</span>
                </button>
              ))}
            </div>
          </div>
          <div className="stack divider-top" style={{ paddingTop: 14, gap: 8 }}>
            <span>League</span>
            <LeagueSwitcher />
          </div>
          <div className="stack divider-top" style={{ paddingTop: 14, gap: 8 }}>
            <span>Your Meta</span>
            <button
              type="button"
              className="toggle"
              onClick={() =>
                updateSettings((cur) => ({
                  ...cur,
                  yourMeta: { ...cur.yourMeta, blend: !(cur.yourMeta?.blend !== false) },
                }))
              }
              aria-pressed={s.settings.yourMeta?.blend !== false}
            >
              <span>
                <span style={{ display: 'block', fontSize: 15 }}>Use your log</span>
                <span className="meta">
                  Weights Teams, Counters and Build by what you actually face. Kicks in at 15
                  battles. {logCount} logged this season.
                </span>
              </span>
              <span className={`switch${s.settings.yourMeta?.blend !== false ? ' on' : ''}`} />
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (
                  window.confirm(
                    `Start fresh in ${league.title}? Battles before now move to Earlier seasons. Nothing is deleted.`,
                  )
                ) {
                  startFresh();
                }
              }}
            >
              Start fresh in {league.title}
            </button>
            <div className="btn-pair">
              <button type="button" className="btn btn-secondary" onClick={() => void doExport()}>
                Export log
              </button>
              <label className="btn btn-secondary" style={{ textAlign: 'center' }}>
                Import log
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => void doImport(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {logNote ? <span className="meta">{logNote}</span> : null}
            <span className="meta">Export and import are files you handle yourself.</span>
          </div>
          <div className="stack divider-top" style={{ paddingTop: 14, gap: 8 }}>
            <span>Community Meta</span>
            <button
              type="button"
              className="toggle"
              onClick={() => void setShareEnabled(!shareEnabled(s.settings))}
              aria-pressed={shareEnabled(s.settings)}
            >
              <span>
                <span style={{ display: 'block', fontSize: 15 }}>Share your battles</span>
                <span className="meta">
                  Builds a measured meta from real ladders. Sends: league, season, time, your three
                  species and moves when known, opponents seen, win, loss or tanked, rank band,
                  device id and app version. Never your collection, IVs, names, or opponents&apos;
                  moves. Off also deletes what this phone sent.
                </span>
              </span>
              <span className={`switch${shareEnabled(s.settings) ? ' on' : ''}`} />
            </button>
            <span className="meta">Your rank band, for the meta by ladder level:</span>
            <Seg<Band | 'none'>
              value={s.settings.share?.band ?? 'none'}
              onChange={(v) => setShareBand(v === 'none' ? null : v)}
              options={[
                { value: 'none', label: 'Not set' },
                ...BANDS.map((b) => ({ value: b, label: BAND_LABELS[b] })),
              ]}
              style={{ flexWrap: 'wrap' }}
            />
          </div>
          <div className="stack divider-top" style={{ paddingTop: 14, gap: 8 }}>
            <span>Appearance</span>
            <Seg
              value={s.settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={themes.map((t) => ({
                value: t,
                label: t === 'system' ? 'System' : t === 'dark' ? 'Dark' : 'Light',
              }))}
            />
            <button
              type="button"
              className="toggle"
              onClick={() =>
                updateSettings((cur) => ({ ...cur, sprites: !(cur.sprites !== false) }))
              }
              aria-pressed={s.settings.sprites !== false}
            >
              <span>
                <span style={{ display: 'block' }}>Pokémon pictures</span>
                <span className="meta">Off shows a coloured initial instead</span>
              </span>
              <span className={`switch${s.settings.sprites !== false ? ' on' : ''}`} />
            </button>
          </div>
          <div className="divider-top meta stack" style={{ paddingTop: 14, gap: 4 }}>
            <span>
              Game data from PvPoke, updated {s.data ? dateLabel(s.data.pvpokeDate) : '...'}
              {s.data ? ` (${s.data.pvpokeCommit.slice(0, 7)})` : ''}. Opponent meta:{' '}
              {s.leagueInfo?.metaSize ?? '...'} Pokémon.
            </span>
            <span>
              Your collection stays on this phone. What leaves it: an anonymous tick to the trainer
              counter when you build teams, anonymous battle records for the community meta unless
              you switch that off above, and, unless you turn it off below, anonymous error reports.
              None of it includes your Pokémon.
              {s.collection ? ` Last import: ${dateLabel(s.collection.importedAt)}.` : ''}
            </span>
            <UpdateStatus />
            <Diagnostics
              enabled={s.settings.errorReports !== false}
              onToggle={() =>
                updateSettings((cur) => ({ ...cur, errorReports: !(cur.errorReports !== false) }))
              }
            />
            <span>
              Built on <a href="https://github.com/pvpoke/pvpoke">PvPoke</a> (MIT). Not affiliated
              with Niantic, Nintendo, The Pokémon Company, Poke Genie, or PvPoke.{' '}
              <a href="https://github.com/mallek/pickthree">Source</a>.
            </span>
            <TrainerCounter count={trainers} />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              closeSheet();
              navigate({ screen: 'welcome' });
            }}
          >
            {s.collection ? 'Import a new Poke Genie export' : 'Import a Poke Genie export'}
          </button>
          {s.collection ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ color: 'var(--warn)', borderColor: 'var(--warn-tint)' }}
              onClick={() => {
                if (
                  window.confirm(
                    'Forget this collection, your battle log and your settings on this device?',
                  )
                ) {
                  void forget();
                }
              }}
            >
              Forget my collection and log
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
