import { useState } from 'react';
import { typeColor } from '../type.ts';

/** "Shadow Dragonite" -> "D"; strips the regional/shadow prefix before taking the first letter,
 * so the fallback still distinguishes forms when a sprite is off or broken. Exported (not just
 * used internally): apps/web/src/format.ts re-exports this rather than keeping its own copy,
 * since web's format.test.ts tests it directly and web's PokemonToken was its only production
 * caller (grep-confirmed against apps/web/src; the test in apps/web/test was the one caller the
 * plan's grep missed by scoping to src only). */
export function initialOf(name: string): string {
  const base = name.replace(/^(Shadow|Galarian|Alolan|Hisuian|Paldean) /, '');
  return base.charAt(0).toUpperCase();
}

/**
 * The coloured disc behind a species' sprite, split diagonally between its two types (or one
 * type twice, for a single-typed species: `types[1]` falling back to `types[0]`). `src` is the
 * only place this component learns where art comes from; the caller decides whether to point at
 * a local sprite, a hotlinked one, or omit it entirely. Each app's own app.css still owns the
 * `.token .sprite` sizing/clipping rule (see the design note in the implementation plan), so this
 * component only ever sets the `token`/`has-sprite` class names, never inline sizing for the
 * image itself.
 */
export function SpeciesToken({
  name,
  types,
  src,
  size = 44,
  showInitial = false,
}: {
  name: string;
  types: readonly string[];
  src?: string;
  size?: number;
  showInitial?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const c1 = typeColor(types[0] ?? '');
  const c2 = typeColor(types[1] ?? types[0] ?? '');
  const split = types[1] !== undefined && types[1] !== types[0];
  const background = split ? `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` : c1;
  const picture = Boolean(src) && !broken;
  // A split disc is a gradient axe cannot measure; the letter's contrast against its outline over
  // every type color is checked by test/contrast.test.ts instead. A flat disc stays with the audit.
  const audit = split ? { 'data-audit-contrast': 'static' } : {};
  return (
    <span
      className={`token${picture ? ' has-sprite' : ''}`}
      role="img"
      aria-label={name}
      title={name}
      {...audit}
      style={{ width: size, height: size, background, fontSize: Math.round(size * 0.36) }}
    >
      {picture ? (
        <img
          className="sprite"
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : showInitial ? (
        initialOf(name)
      ) : (
        ''
      )}
    </span>
  );
}
