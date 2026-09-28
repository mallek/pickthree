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
import { SpeciesToken, Tag, Term, type TagTone } from '@pickthree/ui';
import type { CSSProperties, ReactNode } from 'react';
import type { SpeciesLite } from './data.js';
import { blendParts, sourceHeaderLine } from './headerCopy.js';
import { spriteUrl } from './links.js';
import type { SpeciesRanking } from './rank.js';
import { type Confidence, confidence, trendLabel } from './stats.js';

export {
  Chevron,
  Chip,
  LEAGUE_COLORS,
  LeagueShield,
  LeagueSwitcher,
  Select,
  Term,
  TypeChip,
  TypeChips,
  typeColor,
} from '@pickthree/ui';

/** The coloured disc behind a species' sprite, split diagonally between its two types (or one
 * type twice, for a single-typed species). The sprite art overflows the disc by 6px on purpose,
 * matching pick3's own token: the `--sprite-size` custom property set here reaches `.token
 * .sprite` in app.css (custom properties inherit through the SpeciesToken span in between), so
 * this stays true at every size `Sprite` is called with (40, 44, 52, 64 across the app), not just
 * the 40px default. A `width: calc(100% + 6px)` rule on the class alone, with no JS-computed
 * size, was tried first and looked right for most sprites, but relies on a grid item's track
 * stretching to fill its container; that broke for at least one real sprite (a tall image, e.g.
 * Medicham, ballooned far past its disc on the Teams screen), so the pixel size is computed here
 * instead, the same `size + 6` arithmetic the pre-migration Sprite computed in JS.
 *
 * `key={species.id}` on the wrapper: SpeciesToken tracks a broken image with a plain boolean, not
 * one keyed on the species (the old, pre-migration Sprite did key its own broken flag on the
 * species id, so that a list reusing the same component instance for a new species never left a
 * later, perfectly good image hidden by an earlier one's failure). Keying the wrapper here
 * reproduces that: a changed id remounts a fresh instance instead of carrying a stale `broken`
 * flag over. */
export function Sprite({ species, size = 40 }: { species: SpeciesLite; size?: number }) {
  return (
    <span key={species.id} style={{ '--sprite-size': `${size + 6}px` } as CSSProperties}>
      <SpeciesToken
        name={species.name}
        types={species.types}
        src={spriteUrl(species.id)}
        size={size}
      />
    </span>
  );
}

/** The one line every ranked list opens with: `blendParts` joined by " · ", then the "How it is
 * ranked" `Term` whose body starts with the blend's own source sentence (`sourceHeaderLine`,
 * `zero` for the nothing-measured case) and continues with whatever the screen adds after it.
 * Shared by Teams and Pokemon (Task 7) so the two lists that both open with it can never drift
 * apart in shape.
 *
 * A `div`, not a `p`: the Term's body (`.term-tip`) renders inside this line once opened, and the
 * sentences inside it need block-level elements of their own (`.term-line`, supplied by the
 * caller) for their own spacing. A `<p>` nested inside a `<p>` is invalid HTML and React logs it
 * as a console error on every render that opens the Term. */
export function BlendLine({
  ranking,
  zero,
  children,
}: {
  ranking: SpeciesRanking;
  zero: string;
  children?: ReactNode;
}) {
  return (
    <div className="sub">
      {`${blendParts(ranking).join(' · ')} · `}
      <Term term="How it is ranked">
        <span className="term-line">{sourceHeaderLine(ranking, zero)}</span>
        {children}
      </Term>
    </div>
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
  // The ui Tag's own win and loss tones; `.trend-tag` only sets the smaller size a name line needs.
  return (
    <span className={`trend-tag ${points > 0 ? 'up' : 'down'}`}>
      <Tag tone={points > 0 ? 'win' : 'loss'}>{label}</Tag>
    </span>
  );
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

/** How much a sample is worth trusting, said in a word inside the ui `Tag` next to a win rate
 * (a confidence level is read, not tapped, so it is a Tag). The tone is one of three fixed ones
 * (few neutral, some warn, many win), and still is not the only carrier of the meaning: the word
 * itself is the tag's text content, so colour alone never has to carry it. */
const CONFIDENCE_TONE: Record<Confidence, TagTone> = { few: 'neutral', some: 'warn', many: 'win' };

export function ConfidenceTag({ n }: { n: number }) {
  const c = confidence(n);
  return <Tag tone={CONFIDENCE_TONE[c]}>{c}</Tag>;
}

// Header, SitePill and ThemeIcon moved out in Task 5: the ui Header (variant="top"/"sub") and
// SiteLink now carry both those jobs, and the appearance control moved from a header glyph to
// the Seg on About's own Appearance card, so there is no icon left to draw.

// LEAGUE_COLORS, LeagueShield and LeagueSwitcher moved to packages/ui/src/components/League.tsx
// and are re-exported above.
