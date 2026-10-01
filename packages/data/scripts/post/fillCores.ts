/**
 * Fills the core + flex board template (docs/design/infographic/core-flex/, template-cores.html)
 * with one board of core rows. Pure: template string in, page string out. One board per page;
 * the caller fills the same template once per board.
 */
import { assertAscii, escapeHtml } from './fill.js';

export { assertAscii };

export type CoreTagKind = 'mega' | 'region' | 'form' | 'shadow' | 'elite';
export interface CoreTag {
  kind: CoreTagKind;
  text: string;
}
export interface CoreMemberView {
  name: string;
  /** Sprite id under https://pick3.gg/data/sprites/. */
  sprite: string;
  /** Primary type of the battling form: the portrait's tint class. */
  type: string;
  tags: CoreTag[];
  /** Fast move first, then the charged moves. */
  moves: [string, string, ...string[]];
  isMega: boolean;
}
export interface FlexView {
  name: string;
  sprite: string;
  type: string;
  tags: CoreTag[];
  /** Completed-team strength with this flex, shown to one decimal. */
  strength: number;
  isMega: boolean;
}
export interface CoreRowView {
  core: [CoreMemberView, CoreMemberView];
  flexKind: 'mega' | 'regular';
  /** Best first, one to four; flex[0] is the best-flex tile. */
  flex: FlexView[];
  /** The headline team: flex[0]'s completed-team strength. */
  strength: number;
  /** Names nothing on the team beats, at most three; empty reads "Nothing in the meta ...". */
  caution: string[];
}
export interface CoreBoardView {
  id: 'top' | 'budget' | 'mega';
  title: string;
  subtitle: string;
  readingLine: string;
  label: string;
  source: [string, string, string];
  /** Mascot image as a data URI. */
  mascot: string;
  rows: CoreRowView[];
}

/** Cup names longer than this take the template's two-line title style. */
const LONG_TITLE = 18;

const SPRITES = 'https://pick3.gg/data/sprites/';

const SPARK =
  '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M8 1 10 6 15 8 10 10 8 15 6 10 1 8 6 6Z"/></svg>';

function tagClass(kind: CoreTagKind): string {
  return kind === 'form' ? 'region' : kind;
}

function tagHtml(t: CoreTag, marker: boolean): string {
  if (t.kind === 'mega' && marker) {
    return `<span class="tag mega mega-tag-marker">${SPARK}${escapeHtml(t.text)}</span>`;
  }
  return `<span class="tag ${tagClass(t.kind)}">${escapeHtml(t.text)}</span>`;
}

const isShadow = (tags: CoreTag[]): boolean => tags.some((t) => t.kind === 'shadow');

function memberHtml(m: CoreMemberView): string {
  const cls = ['member', m.isMega ? 'mega-core' : '', isShadow(m.tags) ? 'shadow-member' : '']
    .filter(Boolean)
    .join(' ');
  const name = escapeHtml(m.name);
  const portrait = `<div class="portrait ${escapeHtml(m.type)}"><img class="sprite" src="${SPRITES}${escapeHtml(m.sprite)}.webp" alt="${name}" width="97" height="97"></div>`;
  const head = m.isMega
    ? `<div class="core-portrait-wrap">${portrait}<span class="mega-marker">${SPARK}Mega</span></div>`
    : portrait;
  const tags = m.tags.map((t) => tagHtml(t, false)).join('');
  const moves = m.moves
    .map((mv, i) => `<span class="move ${i === 0 ? 'fast' : 'charged'}">${escapeHtml(mv)}</span>`)
    .join('');
  return `<div class="${cls}">${head}<div class="member-info"><span class="name">${name}</span><div class="tags">${tags}</div><div class="moves">${moves}</div></div></div>`;
}

function flexHtml(f: FlexView, best: boolean): string {
  const s = f.strength.toFixed(1);
  const name = escapeHtml(f.name);
  const cls = [
    'flex-choice',
    best ? 'best-flex' : '',
    f.isMega ? 'mega-choice' : '',
    isShadow(f.tags) ? 'shadow-choice' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const tags = f.tags.map((t) => tagHtml(t, true)).join('');
  return `<div class="${cls}" aria-label="${name}, completed team strength ${s}${best ? ', best flex' : ''}"><span class="choice-label"><span>${best ? 'BEST FLEX' : 'OPTION'}</span><span class="flex-strength">${s}</span></span><div class="flex-disc"><img src="${SPRITES}${escapeHtml(f.sprite)}.webp" alt="${name}"></div><span class="flex-name">${name}</span><div class="flex-tags">${tags}</div></div>`;
}

function rowHtml(r: CoreRowView, i: number): string {
  const s = r.strength.toFixed(1);
  const coreMega = r.core.some((m) => m.isMega);
  const rowType = r.flexKind === 'mega' ? 'mega-in-flex' : coreMega ? 'mega-in-core' : '';
  const cls = ['team', i === 0 ? 'winner' : '', rowType].filter(Boolean).join(' ');
  const label = r.flexKind === 'mega' ? 'PICK A MEGA' : `CHOOSE 1 OF ${r.flex.length}`;
  const applies = '<span class="applies">With best flex</span>';
  const caution =
    r.caution.length > 0
      ? `<p class="caution alert"><strong>Watch for:</strong> ${escapeHtml(r.caution.join(', '))}${applies}</p>`
      : `<p class="caution clear">Nothing in the meta beats all three${applies}</p>`;
  return `<article class="${cls}" style="--strength:${s}%" aria-label="Core ${i + 1}, best completed team strength ${s}"><div class="rank"><small>CORE</small><strong>#${i + 1}</strong></div>
<div class="build"><div class="core-block"><div class="group-label">CORE <small>Keep both</small></div><div class="core-members">${r.core.map(memberHtml).join('')}</div></div><div class="flex-block"><div class="group-label">${label}</div><div class="flex-grid">${r.flex.map((f, k) => flexHtml(f, k === 0)).join('')}</div></div></div>
<div class="score"><strong>${s}</strong><small>STRENGTH</small><span class="score-context">with best flex</span><span class="strength-bar" aria-hidden="true"><i></i></span></div>${caution}</article>`;
}

/** Replaces group 2 of the first match of `re`. A function replacer, so a "$" in a name or move
 *  can never be read as a back-reference. */
function between(html: string, re: RegExp, inner: string): string {
  if (!re.test(html)) {
    throw new Error(`template is missing ${re.source.slice(0, 40)}`);
  }
  return html.replace(
    re,
    (_all, open: string, _old: string, close: string) => `${open}${inner}${close}`,
  );
}

export function fillCoreBoard(template: string, b: CoreBoardView): string {
  const long = b.title.length > LONG_TITLE;
  let out = template.replace(
    /<section class="board core-board mega-core-board"/,
    () => `<section class="board core-board mega-core-board${long ? ' long-title' : ''}"`,
  );
  out = between(out, /(<title>)([^<]*)(<\/title>)/, `pick3.gg - ${escapeHtml(b.title)}`);
  out = between(out, /(<h1 id="[a-z-]+">)([^<]*)(<\/h1>)/, escapeHtml(b.title));
  out = between(out, /(<p class="subtitle">)([^<]*)(<\/p>)/, escapeHtml(b.subtitle));
  out = between(out, /(<span class="read-order">)([^<]*)(<\/span>)/, escapeHtml(b.readingLine));
  out = between(out, /(<span class="sample-label">)([^<]*)(<\/span>)/, escapeHtml(b.label));
  out = between(out, /(<img class="mascot-img" src=")([^"]*)(")/, b.mascot);
  out = between(
    out,
    /(<main class="teams"[^>]*>)([\s\S]*?)(<\/main>)/,
    b.rows.map(rowHtml).join('\n'),
  );
  out = between(
    out,
    /(<div class="source">)([\s\S]*?)(<\/div>)/,
    b.source.map((p) => `<p>${escapeHtml(p)}</p>`).join(''),
  );
  return out;
}
