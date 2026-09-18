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
import lockupDark from '@pickthree/ui/brand/lockup.svg';
import lockupLight from '@pickthree/ui/brand/lockup-light.svg';
import { typeColor } from '@pickthree/ui';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import type { SpeciesLite } from './data.js';
import { spriteUrl } from './links.js';
import { confidence, trendLabel } from './stats.js';
import type { ThemeChoice } from './theme.js';

export { Term, TypeChip, TypeChips, typeColor } from '@pickthree/ui';

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

/**
 * A4/B1: the small coloured tag that follows a name when a trend was earned, "+15" or "-9",
 * green for a rising share and red for a falling one. The caller passes points only once it has
 * already checked `trend !== null` (a null trend is "we cannot say", not a zero one, and must
 * render nothing); this component adds its own second guard for `trendLabel`'s "even" case, a
 * real but sub-whole-point move, since a zero-looking tag colored green or red would claim a
 * direction the rounded number no longer shows.
 */
export function TrendTag({ points }: { points: number }) {
  const label = trendLabel(points);
  if (label === 'even') {
    return null;
  }
  return <span className={`trend-tag ${points > 0 ? 'up' : 'down'}`}>{label}</span>;
}

const SPARK_VIEW_W = 140;
const SPARK_X0 = 4;
const SPARK_X1 = 136;
const SPARK_Y0 = 36;
const SPARK_Y1 = 4;

/** Short form of the worker's own week key ("2026-W36" -> "W36", `isoWeek` in
 * workers/counter/src/meta.ts), the only shape a tick is ever handed. A key that does not carry
 * "-W" still renders, uncut, so a future key format cannot blank a tick rather than shortening it. */
function weekTick(week: string): string {
  const i = week.indexOf('-W');
  return i === -1 ? week : week.slice(i + 1);
}

/**
 * D1: a filled area over a baseline, week ticks along the bottom, and the latest point labelled
 * on the chart itself. Chosen over small weekly bars because the series is a share, a genuinely
 * continuous read from week to week (the whole reason `WeeklyCard`'s all-or-nothing gate exists,
 * see Species.tsx), and an area keeps that continuity on screen instead of drawing each week as
 * its own disconnected column.
 *
 * `preserveAspectRatio="none"` makes the drawing stretch to fill whatever box it is given rather
 * than the default `xMidYMid meet`, which centres a 140x40 drawing inside a wide card and leaves
 * empty space either side. Stretching scales the stroke non-uniformly too, so the polyline pins
 * its own width with `vectorEffect="non-scaling-stroke"` rather than smearing into a band. That
 * same non-uniform scale would turn a circular marker into an ellipse and squeeze or stretch SVG
 * `<text>` glyphs depending on how wide the card happens to be, so the latest-point dot, its
 * label and the week ticks are all plain HTML laid over the chart rather than SVG content: `left`
 * as a percentage of the card's own width lines up with the stretched drawing, and `top` as the
 * SVG's own pixel value lines up too, because only the width is stretched, never the height.
 *
 * A single point has no line to draw, so it renders an empty svg rather than a broken one. */
export function Sparkline({
  values,
  weekLabels,
  latestLabel,
}: {
  values: number[];
  /** One id per value, the worker's own week key, printed as a small tick under its point.
   * Omitted, or mismatched in length with `values`, leaves the chart with no tick row rather
   * than a misaligned one. */
  weekLabels?: string[];
  /** D1: the latest point's own reading, drawn on the chart next to its dot instead of a
   * caller's separate line of text below it. Omitted draws no dot and no label. */
  latestLabel?: string;
}) {
  if (values.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${SPARK_VIEW_W} 40`}
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
  const last = points[points.length - 1]!;
  const lastLeftPct = (last.x / SPARK_VIEW_W) * 100;
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  // The fill closes the line down to the baseline and back, so the chart reads as a filled trend
  // rather than a bare line floating with nothing under it; the line itself is drawn again on top
  // so its stroke stays crisp over the fill instead of being part of the filled shape's outline.
  const areaPoints = `${SPARK_X0},${SPARK_Y0} ${linePoints} ${SPARK_X1},${SPARK_Y0}`;
  const ticks = weekLabels && weekLabels.length === values.length ? weekLabels : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${SPARK_VIEW_W} 40`}
        width="100%"
        height={40}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon points={areaPoints} fill="var(--accent)" fillOpacity={0.15} stroke="none" />
        <line
          x1={SPARK_X0}
          y1={SPARK_Y0}
          x2={SPARK_X1}
          y2={SPARK_Y0}
          stroke="var(--divider)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          points={linePoints}
        />
      </svg>
      {latestLabel ? (
        <>
          <span
            className="spark-dot"
            aria-hidden="true"
            style={{ left: `${lastLeftPct}%`, top: last.y }}
          />
          <span className="spark-label" style={{ left: `${lastLeftPct}%`, top: last.y }}>
            {latestLabel}
          </span>
        </>
      ) : null}
      {ticks ? (
        <div className="spark-ticks">
          {ticks.map((w) => (
            <span key={w}>{weekTick(w)}</span>
          ))}
        </div>
      ) : null}
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

/** C3: how much a sample is worth trusting, said in a word inside a small pick3-style tag
 * (`.tag`, ported from apps/web/src/app.css) next to a win rate, replacing the former dot-plus-
 * word (`ConfidenceDot`). The tag's own tone (one of exactly three fixed ones, so a CSS modifier
 * rather than an inline colour) still is not the only carrier of the meaning: the word itself is
 * the tag's text content, not a separate aria-label, so colour alone never has to carry it. */
export function ConfidenceTag({ n }: { n: number }) {
  const c = confidence(n);
  return <span className={`tag tag-${c}`}>{c}</span>;
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

/** The pill naming the sister site, pick3.gg: same shape and the same placement logic as pick3's
 * own header pill (apps/web/src/components.tsx's `SitePill`), so the two headers rhyme, but drawn
 * from this app's own tokens rather than importing pick3's palette. `name` is the link's full
 * accessible name ("pick3, the team builder"), since the icon alone says nothing about where the
 * link goes to a screen reader.
 *
 * G: the icon is pick3's own lockup (packages/ui/brand/lockup.svg / lockup-light.svg) now, not the
 * bare "3" mark plus a plain "pick3" text label this pill used to carry: the lockup already draws
 * the word "pick3", so a second, plain-text copy of it right next to that drawing would just
 * repeat itself on screen. Both colourways render; `.site-pill-lockup`'s `.only-dark` /
 * `.only-light` pair (app.css) shows the one that matches the active theme. Both images are
 * hidden from assistive tech, same as the old mark was, so the one accessible name lives on
 * `aria-label` and is never announced twice. */
export function SitePill({ href, name }: { href: string; name: string }) {
  return (
    <a className="site-pill" href={href} aria-label={name}>
      <img className="only-dark site-pill-lockup" src={lockupDark} alt="" aria-hidden="true" />
      <img
        className="only-light site-pill-lockup"
        src={lockupLight}
        alt=""
        aria-hidden="true"
      />
    </a>
  );
}

/** The one arrow-like mark in this project: nothing here uses an arrow or chevron character. */
const CHEVRON_TURN: Record<'right' | 'left' | 'down', CSSProperties | undefined> = {
  right: undefined,
  left: { transform: 'scaleX(-1)' },
  down: { transform: 'rotate(90deg)' },
};

export function Chevron({ dir = 'right' }: { dir?: 'right' | 'left' | 'down' }) {
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
      style={CHEVRON_TURN[dir]}
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

/** A labelled native select, the filter control for the window and the rank band. The label
 * is visible, not just aria, so a reader knows what "This season" is a choice of before opening
 * it. The chevron is drawn here rather than the platform's own so both fields match on every
 * browser. */
export function Select<T extends string>({ options, value, onChange, label }: ChoiceProps<T>) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="field-l">{label}</span>
      <span className="select-wrap">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const next = options.find((o) => o.value === e.target.value);
            if (next) {
              onChange(next.value);
            }
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Chevron dir="down" />
      </span>
    </label>
  );
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
