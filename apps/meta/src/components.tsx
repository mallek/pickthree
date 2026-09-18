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
import type { ThemeChoice } from './theme.js';

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
 * it. Every other type gets the app's near-black ink. Deliberate, not a guess. Private: `Tag`
 * below is the one place that reads it. */
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

/** One coloured pill: background from the type's paint, foreground chosen so the label always
 * reads against it. `type` picks the colour; `label` is the text, which need not be the type's
 * own name (Species.tsx uses this for a move, tinted by the move's type, labelled with the
 * move's name). The only place the two foreground hex literals and the white-text type list
 * exist, so `TypeTags` and a move tag can never disagree on which types get which ink. */
export function Tag({ type, label }: { type: string; label: string }) {
  return (
    <span
      className="type-tag"
      style={{ background: typeColor(type), color: WHITE_TEXT.has(type) ? '#fff' : '#161826' }}
    >
      {label}
    </span>
  );
}

/** One tag per type, plain-worded and coloured. */
export function TypeTags({ types }: { types: string[] }) {
  return (
    <>
      {types.map((t) => (
        <Tag key={t} type={t} label={capitalize(t)} />
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
 * than a broken one.
 *
 * `preserveAspectRatio="none"` on both returns makes the drawing stretch to fill whatever box
 * it is given rather than the default `xMidYMid meet`, which centres a 140x40 drawing inside a
 * wide card and leaves empty space either side (it only looked right in the design export
 * because that card was about as narrow as the viewBox is wide). Stretching scales the stroke
 * non-uniformly too, so the polyline pins its own width with `vectorEffect="non-scaling-stroke"`
 * rather than smearing into a band. A circular end-point marker cannot survive that same
 * non-uniform scale without becoming an ellipse, so there is no marker here; the value it would
 * have marked is already printed as text under the chart by every caller. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <svg
        viewBox="0 0 140 40"
        width="100%"
        height={40}
        preserveAspectRatio="none"
        aria-hidden="true"
      />
    );
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
  return (
    <svg
      viewBox="0 0 140 40"
      width="100%"
      height={40}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
      />
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
  // The badge and the title read as one line, so they share a row of their own rather than
  // becoming two stacked flex items once .card lays its children out in a column: without this
  // wrapper, .card's own gap would land between the badge and the title it is decorating rather
  // than between that line and the body text below it.
  const badgeAndTitle = tone === 'warn' || title;
  return (
    <div
      className="card note"
      role={warnNoTitle ? 'note' : undefined}
      aria-label={warnNoTitle ? 'Warning' : undefined}
    >
      {badgeAndTitle ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tone === 'warn' ? (
            <span className="note-badge" aria-hidden="true">
              !
            </span>
          ) : null}
          {title ? <b>{title}</b> : null}
        </div>
      ) : null}
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

/** The sticky per-screen header: a back link (or spacer, so the title stays centred) on the
 * left, the title and an optional subtitle in the middle, and a right-hand slot for this app's
 * one recurring action, the appearance toggle. Modelled on apps/web's own Header
 * (apps/web/src/components.tsx), including that the title is a plain span rather than a heading:
 * each screen's own `<h2>`s still carry the real heading structure, this is chrome around them.
 * `backHref` is a real link (not a button with an onClick) so the back target stays openable in
 * a new tab, same as every other link on this site. */
export function Header({
  title,
  sub,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  sub?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <header className="hdr">
      {backHref ? (
        <a className="back" href={backHref}>
          <Chevron dir="left" /> {backLabel ?? 'Back'}
        </a>
      ) : (
        <span className="back-spacer" />
      )}
      <span className="hdr-title">
        <span>{title}</span>
        {sub ? <span className="hdr-sub">{sub}</span> : null}
      </span>
      {action ? <span className="hdr-actions">{action}</span> : <span className="back-spacer" />}
    </header>
  );
}

/** The pill naming the sister site, pick3.gg: same shape, same mark and the same placement logic
 * as pick3's own header pill (apps/web/src/components.tsx's `SitePill`), so the two headers rhyme,
 * but drawn from this app's own tokens rather than importing pick3's palette. `label` is the
 * visible text ("pick3"); `name` is the link's full accessible name ("pick3, the team builder"),
 * since a bare "pick3" read aloud says nothing about where the link goes. The mark carries its own
 * `alt=""`/`aria-hidden`, and the visible label is hidden from assistive tech too so the name is
 * never announced twice. */
export function SitePill({ href, label, name }: { href: string; label: string; name: string }) {
  return (
    <a className="site-pill" href={href} aria-label={name}>
      <img className="site-pill-mark" src="/mark.svg" alt="" aria-hidden="true" />
      <span aria-hidden="true">{label}</span>
    </a>
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

/** The appearance control's glyph. This project's rendered text is strict 7-bit ASCII, so the
 * design's moon/sun characters are drawn, not spelled, in the same stroke style as Chevron.
 * System gets a half-filled circle (the familiar contrast/"auto" symbol) rather than a monitor
 * outline: a rectangle would sit oddly next to two round marks, and the half-circle already
 * reads, on its own, as "follows whatever is set elsewhere" at 16px. The sun keeps to four
 * cardinal rays rather than the design's full ring of them, which blurs into a smear at this
 * size. */
export function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  if (choice === 'dark') {
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
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }
  if (choice === 'light') {
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
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    );
  }
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
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
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

/** `Pills` and `LeagueSwitcher` both render a radiogroup of real buttons, one aria-checked at a
 * time; `Pills` is the shared body, `LeagueSwitcher` below draws its own markup instead of
 * reusing it because a league segment also carries a shield icon `Pills` has no room for. */
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

/** The wrapping row of pills, e.g. a rank-band filter with more options than fit one row. */
export function Pills<T extends string>(p: ChoiceProps<T>) {
  return <ChoiceGroup className="pills" {...p} />;
}

/** Game colours for the three open leagues, kept byte-identical to pick3's own
 * apps/web/src/components/LeagueSwitcher.tsx: these are the game's own league colours, brand
 * rather than this site's theme, so they are not swapped for anything in `tokens.css`. */
export const LEAGUE_COLORS: Record<string, string> = {
  great: '#3F7DE8',
  ultra: '#F2B01E',
  master: '#B03DBE',
};

/** The shield mark pick3 draws for a league, ported geometry-for-geometry from pick3's own
 * `LeagueShield` so the two sites' league controls read as the same control. `id` doubles as a
 * `LEAGUE_COLORS` key; anything else (there is no cup switcher on this site today) falls back to
 * the neutral shield rather than an undefined fill. */
export function LeagueShield({ id, size = 16 }: { id: string; size?: number }) {
  const color = LEAGUE_COLORS[id] ?? '#8E9AAF';
  return (
    <svg
      className="league-shield"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill={color} />
      <path d="M12 6.2l4.4 1.9v3.4c0 3-1.9 5.5-4.4 6.9V6.2z" fill="rgba(255,255,255,0.28)" />
    </svg>
  );
}

/** The league toggle: a full-width radiogroup with the game's own shield colours, replacing the
 * generic `Segmented` control (the enclosed pill switch) this site used before porting pick3's
 * purpose-built one. Each option's `value` is a league id, which is also the `LeagueShield` /
 * `LEAGUE_COLORS` key that picks its colour. */
export function LeagueSwitcher<T extends string>({
  options,
  value,
  onChange,
  label,
}: ChoiceProps<T>) {
  return (
    <div className="league-switcher" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : undefined}
          onClick={() => onChange(o.value)}
        >
          <LeagueShield id={o.value} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
