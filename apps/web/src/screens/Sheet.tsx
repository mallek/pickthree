import { PokemonToken, useName } from '../components.tsx';
import { dateLabel, num } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';

export function Sheet() {
  const s = useAppState();
  const { closeSheet, updateSettings, toggleExcluded, forget, navigate } = useActions();
  const name = useName();
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
      <div className="sheet" role="dialog" aria-label="Filters and settings">
        <div className="grabber">
          <span />
        </div>
        <div className="between" style={{ padding: '4px 20px 8px' }}>
          <h3 style={{ fontSize: 19 }}>Filters and settings</h3>
          <button type="button" className="btn-ghost" onClick={closeSheet}>
            Done
          </button>
        </div>
        <div className="sheet-body">
          <div>
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
          </div>
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
            <span>Appearance</span>
            <div className="seg">
              {themes.map((t) => (
                <span
                  key={t}
                  className={s.settings.theme === t ? 'on' : ''}
                  onClick={() => updateSettings({ theme: t })}
                  role="button"
                  tabIndex={0}
                  style={{
                    cursor: 'pointer',
                    color: s.settings.theme === t ? undefined : 'var(--text)',
                  }}
                >
                  {t === 'system' ? 'System' : t === 'dark' ? 'Dark' : 'Light'}
                </span>
              ))}
            </div>
          </div>
          <div className="divider-top meta stack" style={{ paddingTop: 14, gap: 4 }}>
            <span>
              Game data from PvPoke, updated {s.data ? dateLabel(s.data.pvpokeDate) : '...'}
              {s.data ? ` (${s.data.pvpokeCommit.slice(0, 7)})` : ''}. Opponent meta:{' '}
              {s.data?.metaSize ?? '...'} Pokémon.
            </span>
            <span>
              Your collection stays on this phone. The only outbound request is an anonymous tick to
              the player counter when you build teams.
              {s.collection ? ` Last import: ${dateLabel(s.collection.importedAt)}.` : ''}
            </span>
            <span>
              Built on <a href="https://github.com/pvpoke/pvpoke">PvPoke</a> (MIT). Not affiliated
              with Niantic, Nintendo, The Pokémon Company, Poke Genie, or PvPoke.{' '}
              <a href="https://github.com/mallek/pickthree">Source</a>.
            </span>
          </div>
          {s.collection ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                closeSheet();
                navigate({ screen: 'welcome' });
              }}
            >
              Import a new Poke Genie export
            </button>
          ) : null}
          {s.collection ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ color: 'var(--warn)', borderColor: 'var(--warn-tint)' }}
              onClick={() => {
                if (window.confirm('Forget this collection and your settings on this device?')) {
                  void forget();
                }
              }}
            >
              Forget my collection
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
