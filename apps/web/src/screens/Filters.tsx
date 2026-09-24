import type { TeamStyle } from '@pickthree/engine';
import { Select } from '@pickthree/ui';
import { PokemonToken, useName } from '../components.tsx';
import { num } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';

export function Filters() {
  const s = useAppState();
  const { closeFilters, updateSettings, toggleExcluded } = useActions();
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
  return (
    <>
      <div className="overlay" onClick={closeFilters} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-label="Filters">
        <div className="grabber">
          <span />
        </div>
        <div className="between" style={{ padding: '4px 20px 8px' }}>
          <h3 style={{ fontSize: 19 }}>Filters</h3>
          <button type="button" className="btn-ghost" onClick={closeFilters}>
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
            <Select<TeamStyle>
              label="Team style"
              value={f.style}
              options={[
                { value: 'any', label: 'Any' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'abb', label: 'ABB line' },
              ]}
              onChange={(style) =>
                updateSettings((cur) => ({ ...cur, filters: { ...cur.filters, style } }))
              }
            />
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
        </div>
      </div>
    </>
  );
}
