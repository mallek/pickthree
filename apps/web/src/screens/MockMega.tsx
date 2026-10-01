// THROWAWAY: Mega glyph options for Travis. Never merged.
import { Header } from '@pickthree/ui';
import { useId, type ReactNode } from 'react';
import { PokemonToken, useName } from '../components.tsx';

/** The type tokens the gradient walks through: fairy, psychic, water, ice, grass, electric. */
const STOPS = ['--type-fairy', '--type-psychic', '--type-water', '--type-ice', '--type-grass', '--type-electric'];

function Stops() {
  return (
    <>
      {STOPS.map((v, i) => (
        <stop key={v} offset={`${(i / (STOPS.length - 1)) * 100}%`} style={{ stopColor: `var(${v})` }} />
      ))}
    </>
  );
}

/** A: an orb in the type-token rainbow with a four-point spark in the middle. */
function GlyphOrb({ size }: { size: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stops />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill={`url(#${id})`} stroke="var(--surface)" strokeWidth="1.5" />
      <path d="M10 4.5 L11.3 8.7 L15.5 10 L11.3 11.3 L10 15.5 L8.7 11.3 L4.5 10 L8.7 8.7 Z" fill="var(--bg)" opacity="0.85" />
    </svg>
  );
}

/** B: a gradient ring around a small upward chevron pair (evolving up). */
function GlyphRing({ size }: { size: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <Stops />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill="var(--surface)" />
      <circle cx="10" cy="10" r="7.6" fill="none" stroke={`url(#${id})`} strokeWidth="2.6" />
      <path
        d="M6.6 11.6 L10 8.4 L13.4 11.6 M6.6 14.4 L10 11.2 L13.4 14.4"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** C: a faceted gem in the rainbow with a light top facet. */
function GlyphGem({ size }: { size: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stops />
        </linearGradient>
      </defs>
      <path d="M10 1.5 L18 8 L10 18.5 L2 8 Z" fill={`url(#${id})`} stroke="var(--surface)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 8 L18 8 M6 8 L10 1.5 L14 8 L10 18.5 L6 8" fill="none" stroke="var(--bg)" strokeWidth="0.9" opacity="0.55" strokeLinejoin="round" />
    </svg>
  );
}

const OPTIONS: { key: string; name: string; glyph: (size: number) => ReactNode }[] = [
  { key: 'a', name: 'A. Orb with a spark', glyph: (s) => <GlyphOrb size={s} /> },
  { key: 'b', name: 'B. Ring with rising chevrons', glyph: (s) => <GlyphRing size={s} /> },
  { key: 'c', name: 'C. Faceted gem', glyph: (s) => <GlyphGem size={s} /> },
];

const MEGAS = ['venusaur_mega', 'gyarados_mega', 'ampharos_mega'];

/** A plain (not-Mega) token with the glyph pinned to its bottom-right corner. */
function Badged({ id, size, glyph }: { id: string; size: number; glyph: (s: number) => ReactNode }) {
  const g = Math.round(size * 0.42);
  return (
    <span className="mock-nopill" style={{ position: 'relative', display: 'inline-block', width: size, height: size }}>
      <PokemonToken speciesId={id} size={size} showInitial={false} />
      <span style={{ position: 'absolute', right: -3, bottom: -3, lineHeight: 0 }}>{glyph(g)}</span>
    </span>
  );
}

export function MockMega() {
  const name = useName();
  return (
    <div className="screen">
      <style>{'.mock-nopill .token-mega-pill { display: none; }'}</style>
      <div className="page-head">
        <Header variant="top" title="Mega glyph" />
      </div>
      <div className="scroll" style={{ gap: 22 }}>
        <div className="stack" style={{ gap: 8 }}>
          <b>Today: the Mega pill</b>
          <div className="row" style={{ gap: 18, alignItems: 'center' }}>
            {MEGAS.map((id) => (
              <PokemonToken key={id} speciesId={id} size={52} showInitial={false} />
            ))}
            <PokemonToken speciesId="venusaur_mega" size={36} showInitial={false} />
          </div>
        </div>
        {OPTIONS.map((o) => (
          <div className="card" key={o.key} style={{ gap: 12 }}>
            <div className="between">
              <b>{o.name}</b>
              <span className="row" style={{ gap: 10, alignItems: 'center' }}>
                {o.glyph(14)}
                {o.glyph(20)}
                {o.glyph(32)}
              </span>
            </div>
            <div className="row" style={{ gap: 18, alignItems: 'center' }}>
              {MEGAS.map((id) => (
                <Badged key={id} id={id} size={52} glyph={o.glyph} />
              ))}
              <Badged id="venusaur_mega" size={36} glyph={o.glyph} />
            </div>
            <div className="spec-row" style={{ borderBottom: 0, padding: 0 }}>
              <Badged id="gyarados_mega" size={44} glyph={o.glyph} />
              <span style={{ minWidth: 0 }}>
                <span className="spec-name row" style={{ gap: 6, alignItems: 'center' }}>
                  Mega {name('gyarados')}
                  {o.glyph(16)}
                </span>
                <span className="meta" style={{ display: 'block' }}>
                  CP 1498 · Top 2%
                </span>
              </span>
              <span />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
