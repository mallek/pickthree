/**
 * The shared presentation pieces: sprite token, type tags, bars, a sparkline, stat cards, a
 * confidence dot, an inline chevron and the two choice controls. One file, same as apps/web's
 * components.tsx, because these are small and share the type-colour helper below.
 *
 * Return types are left to inference rather than annotated `JSX.Element`: with React 19's
 * types there is no longer a global `JSX` namespace to name (it moved to `React.JSX`), and the
 * rest of this codebase (apps/web/src/components.tsx) already leans on inference for the same
 * reason.
 */
import { useState, type ReactNode } from 'react';
import type { SpeciesLite } from './data.js';
import { spriteUrl } from './links.js';
import { confidence } from './stats.js';

const TYPES: readonly string[] = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];

/** A type's paint. Unknown types (a bad CSV cell, a future type) fall back to the neutral token
 * rather than an undefined CSS variable. */
export function typeColor(type: string): string {
  return TYPES.includes(type) ? `var(--type-${type})` : 'var(--muted)';
}

/** From the design export: the types whose colour is dark enough that only white text reads on
 * it. Every other type gets the app's near-black ink. Deliberate, not a guess. */
const WHITE_TEXT = new Set([
  'water',
  'ghost',
  'dragon',
  'fighting',
  'psychic',
  'dark',
  'poison',
  'steel',
]);

function capitalize(s: string): string {
  return s.length === 0 ? s : s.slice(0, 1).toUpperCase() + s.slice(1);
}

/** The coloured disc behind a species' sprite, split diagonally between its two types (or one
 * type twice, for a single-typed species). The sprite art overflows the disc by 6px on purpose,
 * matching pick3's own token.
 *
 * The name lives on the outer span, in every state, so a broken image never leaves the disc
 * nameless to a screen reader: the inner `<img>` carries no name of its own (`alt=""`,
 * `aria-hidden`), so the name is never doubled either. `broken` is keyed on the species id
 * rather than a plain boolean, so swapping which species this instance renders (e.g. a list
 * reusing the same component) does not leave a later, perfectly good image hidden by an
 * earlier one's failure. */
export function Sprite({ species, size = 40 }: { species: SpeciesLite; size?: number }) {
  const [brokenId, setBrokenId] = useState<string | null>(null);
  const broken = brokenId === species.id;
  // typeColor already maps anything unrecognised (including a missing type) to the neutral
  // token, so a species with no types at all still gets a solid disc instead of `undefined`.
  const c1 = typeColor(species.types[0] ?? '');
  const c2 = typeColor(species.types[1] ?? species.types[0] ?? '');
  const imgSize = size + 6;
  return (
    <span
      className="token"
      role="img"
      aria-label={species.name}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${c1} 0 50%, ${c2} 50% 100%)`,
      }}
    >
      {broken ? null : (
        <img
          className="sprite"
          src={spriteUrl(species.id)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={imgSize}
          height={imgSize}
          // `app.css` pins `.token .sprite` at 46px; a stylesheet rule beats an HTML sizing
          // attribute, so the inline style is what actually lets the art scale with `size`.
          // The width/height attributes stay too, so the browser reserves layout space
          // before the image loads.
          style={{ width: imgSize, height: imgSize }}
          onError={() => setBrokenId(species.id)}
        />
      )}
    </span>
  );
}

/** A short overlapping row of sprites, such as a team's three members. One accessible name for
 * the group rather than three alt texts running together; the individual images are hidden from
 * assistive tech so they are not announced twice. */
export function SpriteStack({ species, size }: { species: SpeciesLite[]; size?: number }) {
  const label = species.map((s) => s.name).join(', ');
  return (
    <span role="img" aria-label={label}>
      {species.map((s, i) => (
        <span
          key={`${s.id}-${i}`}
          aria-hidden="true"
          style={{
            display: 'inline-block',
            marginRight: i < species.length - 1 ? -6 : 0,
          }}
        >
          <Sprite species={s} {...(size === undefined ? {} : { size })} />
        </span>
      ))}
    </span>
  );
}

/** One tag per type, plain-worded and coloured, with the foreground chosen per type so the text
 * always reads against its own background. */
export function TypeTags({ types }: { types: string[] }) {
  return (
    <>
      {types.map((t) => (
        <span
          key={t}
          className="type-tag"
          style={{ background: typeColor(t), color: WHITE_TEXT.has(t) ? '#fff' : '#161826' }}
        >
          {capitalize(t)}
        </span>
      ))}
    </>
  );
}

/** A percentage bar. `tone="muted"` is for a bar that is not the headline number on its card. */
export function Bar({
  pct,
  tone = 'accent',
  height,
  label,
}: {
  pct: number;
  tone?: 'accent' | 'muted';
  height?: number;
  /** An accessible name, for a bar that stands alone rather than sitting next to its own label. */
  label?: string;
}) {
  // Math.round(NaN) survives both clamps below, so guard non-finite input (a NaN rate, an
  // unset divide) before it reaches the DOM as aria-valuenow="NaN" and width: NaN%.
  const clamped = Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
      style={height ? { height } : undefined}
    >
      <span className={tone === 'muted' ? 'muted' : undefined} style={{ width: `${clamped}%` }} />
    </div>
  );
}

const SPARK_X0 = 4;
const SPARK_X1 = 136;
const SPARK_Y0 = 36;
const SPARK_Y1 = 4;

/** A trend line with no axes, no labels: the numbers it depicts are always printed beside it,
 * so it is aria-hidden. A single point has no line to draw, so it renders an empty svg rather
 * than a broken one. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <svg viewBox="0 0 140 40" width="100%" height={40} aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = values.length - 1;
  const points = values.map((v, i) => {
    const x = SPARK_X0 + (i / span) * (SPARK_X1 - SPARK_X0);
    // A flat series (max === min) would divide by zero; draw it level at mid height instead.
    const y =
      max === min
        ? (SPARK_Y0 + SPARK_Y1) / 2
        : SPARK_Y0 + ((v - min) / (max - min)) * (SPARK_Y1 - SPARK_Y0);
    return { x, y };
  });
  const last = points[points.length - 1]!;
  return (
    <svg viewBox="0 0 140 40" width="100%" height={40} aria-hidden="true">
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
      />
      <circle cx={last.x} cy={last.y} r={3.5} fill="var(--accent)" />
    </svg>
  );
}

/** One number over its label, as in the design's three-up stat row. */
export function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-n">{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

/** The bordered card used for a small-sample banner or any other aside. `tone="warn"` adds a
 * badge; a title already says what it is, so the badge is decorative there. Without a title
 * the badge is the only visual cue, so the warning gets an accessible name of its own instead
 * (the badge stays `aria-hidden`: it is a repeat of that name, not a second source of it). */
export function Note({
  tone = 'plain',
  title,
  children,
}: {
  tone?: 'plain' | 'warn';
  title?: string;
  children: ReactNode;
}) {
  const warnNoTitle = tone === 'warn' && !title;
  return (
    <div
      className="card note"
      role={warnNoTitle ? 'note' : undefined}
      aria-label={warnNoTitle ? 'Warning' : undefined}
    >
      {tone === 'warn' ? (
        <span className="note-badge" aria-hidden="true">
          !
        </span>
      ) : null}
      {title ? <b>{title}</b> : null}
      {children}
    </div>
  );
}

/** How much a sample is worth trusting, said in a word, not just a colour: colour alone is not
 * an accessible way to carry meaning. The dot itself is a fixed, non-per-item colour (one of
 * exactly three tones), so it is a CSS class and modifier rather than an inline style. */
export function ConfidenceDot({ n }: { n: number }) {
  const c = confidence(n);
  return (
    <span>
      <span className={`conf-dot conf-${c}`} aria-hidden="true" />
      {c}
    </span>
  );
}

/** The one arrow-like mark in this project: nothing here uses an arrow or chevron character. */
export function Chevron({ dir = 'right' }: { dir?: 'right' | 'left' }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={dir === 'left' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface ChoiceProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}

/** `Segmented` and `Pills` share this: a radiogroup of real buttons, one aria-checked at a
 * time, differing only in which class paints the enclosed switch versus the wrapping pill row. */
function ChoiceGroup<T extends string>({
  className,
  options,
  value,
  onChange,
  label,
}: ChoiceProps<T> & { className: string }) {
  return (
    <div className={className} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The enclosed three-up switcher, e.g. Great/Ultra/Master. */
export function Segmented<T extends string>(p: ChoiceProps<T>) {
  return <ChoiceGroup className="seg" {...p} />;
}

/** The wrapping row of pills, e.g. a rank-band filter with more options than fit one row. */
export function Pills<T extends string>(p: ChoiceProps<T>) {
  return <ChoiceGroup className="pills" {...p} />;
}
