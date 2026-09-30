/**
 * Fills the Claude Design cup-board template (docs/design/infographic/export/README.txt names
 * its classes) with real rows. Pure: template string in, page string out.
 */
export type BoardId = 'top' | 'budget' | 'mega';

export interface MemberView {
  role: 'LEAD' | 'SWITCH' | 'CLOSER';
  name: string;
  /** Sprite id under https://pick3.gg/data/sprites/. */
  sprite: string;
  /** Primary type of the battling form: the portrait's tint class. */
  type: string;
  tags: { kind: 'mega' | 'region' | 'form' | 'shadow' | 'elite'; text: string }[];
  /** Fast move first, then the charged moves. */
  moves: [string, string, ...string[]];
  /** The Mega a Mega-board row is built around. */
  hero: boolean;
}

export interface RowView {
  strength: number;
  members: [MemberView, MemberView, MemberView];
  /** Names nothing on the team beats, at most three; empty reads "Nothing in the meta ...". */
  caution: string[];
}

export interface BoardView {
  id: BoardId;
  title: string;
  label: string;
  source: [string, string, string];
  /** Mascot image as a data URI. */
  mascot: string;
  rows: RowView[];
}

const SUBTITLE: Record<BoardId, string> = {
  top: 'Top 5 Teams',
  budget: 'Budget Builds - No Elite TM',
  mega: 'Best Team for Each Mega',
};

/** Cup names longer than this take the template's two-line title style. */
const LONG_TITLE = 18;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tagClass(kind: MemberView['tags'][number]['kind']): string {
  return kind === 'form' ? 'region' : kind;
}

function memberHtml(m: MemberView): string {
  const cls = [
    'member',
    m.hero ? 'mega-hero' : '',
    m.tags.some((t) => t.kind === 'shadow') ? 'shadow-member' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const tags = m.tags
    .map((t) => `<span class="tag ${tagClass(t.kind)}">${escapeHtml(t.text)}</span>`)
    .join('');
  const moves = m.moves
    .map((mv, i) => `<span class="move ${i === 0 ? 'fast' : 'charged'}">${escapeHtml(mv)}</span>`)
    .join('');
  const name = escapeHtml(m.name);
  return `<div class="${cls}">
  <div class="portrait ${escapeHtml(m.type)}"><img class="sprite" src="https://pick3.gg/data/sprites/${escapeHtml(m.sprite)}.webp" alt="${name}" width="108" height="108"></div>
  <div class="member-info"><span class="role">${m.role}</span><span class="name">${name}</span>
   <div class="tags">${tags}</div>
   <div class="moves">${moves}</div>
  </div>
 </div>`;
}

function rowHtml(r: RowView, i: number): string {
  const s = r.strength.toFixed(1);
  const caution =
    r.caution.length > 0
      ? `<p class="caution alert"><strong>Watch for:</strong> ${escapeHtml(r.caution.join(', '))}</p>`
      : '<p class="caution clear">Nothing in the meta beats all three</p>';
  return `<article class="team${i === 0 ? ' winner' : ''}" aria-label="Team ${i + 1}, strength ${s}" style="--strength:${s}%">
 <div class="rank"><small>TEAM</small><strong>#${i + 1}</strong></div>
 <div class="members">${r.members.map(memberHtml).join('')}</div>
 <div class="score"><strong>${s}</strong><small>STRENGTH</small><span class="strength-bar" aria-hidden="true"><i></i></span></div>
 ${caution}
</article>`;
}

function sectionBounds(html: string, id: BoardId): [number, number] {
  const marker = html.indexOf(`id="${id}"`);
  if (marker < 0) {
    throw new Error(`template has no board #${id}`);
  }
  const start = html.lastIndexOf('<section', marker);
  const end = html.indexOf('</section>', marker) + '</section>'.length;
  return [start, end];
}

/** Replaces group 2 of the first match of `re` (open tag, content, close tag) with `inner`. A
 *  function replacer, so a "$" in a name or move can never be read as a back-reference. */
function between(sec: string, re: RegExp, inner: string): string {
  return sec.replace(
    re,
    (_all, open: string, _old: string, close: string) => `${open}${inner}${close}`,
  );
}

function fillSection(sec: string, b: BoardView): string {
  const long = b.title.length > LONG_TITLE;
  let out = sec.replace(
    /^<section class="board [a-z]+[^"]*"/,
    () => `<section class="board ${b.id}${long ? ' long-title' : ''}"`,
  );
  out = between(out, /(<h1 id="title-[a-z]+">)([^<]*)(<\/h1>)/, escapeHtml(b.title));
  out = between(out, /(<p class="subtitle">)([^<]*)(<\/p>)/, SUBTITLE[b.id]);
  out = between(out, /(<span class="sample-label">)([^<]*)(<\/span>)/, escapeHtml(b.label));
  out = between(out, /(<img class="mascot-img" src=")([^"]*)(")/, b.mascot);
  out = between(
    out,
    /(<main class="teams"[^>]*>)([\s\S]*?)(<\/main>)/,
    b.rows.map(rowHtml).join(''),
  );
  out = between(
    out,
    /(<div class="source">)([\s\S]*?)(<\/div>)/,
    b.source.map((p) => `<p>${escapeHtml(p)}</p>`).join(''),
  );
  return out;
}

export function fillBoards(template: string, boards: readonly BoardView[]): string {
  let html = template;
  for (const id of ['top', 'budget', 'mega'] as const) {
    const [start, end] = sectionBounds(html, id);
    const b = boards.find((x) => x.id === id);
    const replacement = b ? fillSection(html.slice(start, end), b) : '';
    html = html.slice(0, start) + replacement + html.slice(end);
  }
  return html;
}

/** Throws on the first character outside 7-bit printable ASCII (tabs and newlines allowed). */
export function assertAscii(html: string): void {
  const m = /[^\t\n\r\x20-\x7e]/.exec(html);
  if (m) {
    const code = m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    const context = html.slice(Math.max(0, m.index - 20), m.index + 20);
    throw new Error(`Non-ASCII character U+${code} on the page, near "${context}"`);
  }
}
