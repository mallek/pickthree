import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertAscii,
  fillCoreBoard,
  type CoreBoardView,
  type CoreMemberView,
  type CoreRowView,
  type CoreTag,
  type FlexView,
} from '../scripts/post/fillCores.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(
  path.join(here, '..', 'scripts', 'post', 'template-cores.html'),
  'utf8',
);

const member = (name: string, extra: Partial<CoreMemberView> = {}): CoreMemberView => ({
  name,
  sprite: name.toLowerCase(),
  type: 'water',
  tags: [],
  moves: ['Fast', 'Charged One', 'Charged Two'],
  isMega: false,
  ...extra,
});
const flex = (name: string, strength: number, extra: Partial<FlexView> = {}): FlexView => ({
  name,
  sprite: name.toLowerCase(),
  type: 'grass',
  tags: [],
  strength,
  isMega: false,
  ...extra,
});
const mega: CoreTag = { kind: 'mega', text: 'Mega' };
const row = (extra: Partial<CoreRowView> = {}): CoreRowView => ({
  core: [member('Alpha'), member('Beta')],
  flexKind: 'regular',
  flex: [flex('Delta', 91.84), flex('Echo', 90.2)],
  strength: 91.84,
  caution: [],
  ...extra,
});
const board = (rows: CoreRowView[], extra: Partial<CoreBoardView> = {}): CoreBoardView => ({
  id: 'top',
  title: 'Test Cup',
  subtitle: 'Top 5 Cores',
  readingLine: 'Keep the pair. Choose one flex.',
  label: 'LIVE SEP 22 - OCT 6',
  source: ['Source one', 'Source two', 'Source three'],
  mascot: 'data:image/png;base64,AAAA',
  rows,
  ...extra,
});
const fill = (rows: CoreRowView[], extra: Partial<CoreBoardView> = {}): string =>
  fillCoreBoard(template, board(rows, extra));
const rows = (r: CoreRowView[]): string => {
  const out = fill(r);
  return out.slice(out.indexOf('<main'), out.indexOf('</main>'));
};
const count = (s: string, needle: string): number => s.split(needle).length - 1;

describe('template-cores.html', () => {
  it('is ASCII with no em dash and exactly one board', () => {
    expect(() => assertAscii(template)).not.toThrow();
    expect(template).not.toContain(String.fromCharCode(0x2014));
    expect(count(template, '<section')).toBe(1);
  });

  it('carries the real lockup with .gg on its baseline, in header and footer', () => {
    expect(count(template, 'aria-label="pick3.gg"')).toBe(2);
    expect(count(template, 'y="58.38"')).toBe(2);
    expect(template).not.toContain('class="wordmark"');
  });
});

describe('fillCoreBoard', () => {
  it('fills a five-row board with row 1 as the winner', () => {
    const out = rows([row(), row(), row(), row(), row()]);
    expect(count(out, '<article')).toBe(5);
    expect(count(out, 'class="team winner')).toBe(1);
    expect(out).toMatch(/<article class="team winner"/);
    expect(out).toContain('CORE</small><strong>#5</strong>');
  });

  it('handles fewer than five rows', () => {
    const out = rows([row(), row()]);
    expect(count(out, '<article')).toBe(2);
  });

  it('a Mega flex row is mega-in-flex and says PICK A MEGA', () => {
    const megaTag: FlexView['tags'] = [mega];
    const out = rows([
      row({
        flexKind: 'mega',
        flex: [
          flex('M1', 91, { isMega: true, tags: megaTag }),
          flex('M2', 90, { isMega: true, tags: megaTag }),
        ],
      }),
    ]);
    expect(out).toMatch(/<article class="team winner mega-in-flex"/);
    expect(out).toContain('PICK A MEGA');
    expect(out).not.toContain('CHOOSE 1 OF');
    expect(count(out, 'mega-choice')).toBe(2);
    expect(count(out, 'mega-tag-marker')).toBe(2);
  });

  it('a Mega core row is mega-in-core and says CHOOSE 1 OF N', () => {
    const out = rows([
      row({
        core: [member('Alpha'), member('Gyara', { isMega: true, tags: [mega] })],
        flex: [flex('A', 88), flex('B', 87), flex('C', 86)],
      }),
    ]);
    expect(out).toMatch(/<article class="team winner mega-in-core"/);
    expect(out).toContain('CHOOSE 1 OF 3');
    expect(count(out, 'member mega-core')).toBe(1);
    expect(count(out, 'class="mega-marker"')).toBe(1);
    expect(count(out, 'core-portrait-wrap')).toBe(1);
  });

  it('marks Megas with the pick3 orb beside the word Mega, each orb with its own gradient', () => {
    const out = fill([
      row({
        core: [member('Alpha'), member('Gyara', { isMega: true, tags: [mega] })],
      }),
      row({
        flexKind: 'mega',
        flex: [
          flex('M1', 91, { isMega: true, tags: [mega] }),
          flex('M2', 90, { isMega: true, tags: [mega] }),
        ],
      }),
    ]);
    const main = out.slice(out.indexOf('<main'), out.indexOf('</main>'));
    const markers = [
      ...main.matchAll(
        /<span class="(?:mega-marker|tag mega mega-tag-marker)">(<svg[\s\S]*?<\/svg>)Mega<\/span>/g,
      ),
    ];
    expect(markers).toHaveLength(3);
    const ids = markers.map((m) => /<linearGradient id="([^"]+)"/.exec(m[1]!)?.[1]);
    expect(new Set(ids).size).toBe(3);
    for (const [i, m] of markers.entries()) {
      expect(m[1]).toContain(`fill="url(#${ids[i]})"`);
      expect(m[1]).toContain('<circle cx="10" cy="10" r="9"');
    }
    // Ids are unique across the whole page, the template's own markup included.
    const all = [...out.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(all).size).toBe(all.length);
    expect(out).not.toContain('fill="currentColor" d="M8 1');
  });

  it('a regular row without a Mega has no row-type class and no Mega markup', () => {
    const out = rows([row()]);
    expect(out).toMatch(/<article class="team winner" /);
    expect(out).toContain('CHOOSE 1 OF 2');
    expect(out).not.toContain('mega-in-');
    expect(out).not.toContain('mega-marker');
    expect(out).not.toContain('mega-choice');
    expect(out).not.toContain('mega-core"');
  });

  it('renders only as many flex tiles as there are options', () => {
    const opts = [flex('A', 90), flex('B', 89), flex('C', 88), flex('D', 87)];
    for (let n = 1; n <= 4; n++) {
      const out = rows([row({ flex: opts.slice(0, n) })]);
      expect(count(out, 'class="flex-choice')).toBe(n);
      expect(out).toContain(`CHOOSE 1 OF ${n}`);
    }
  });

  it('marks the first tile as best flex and shows its strength to one decimal', () => {
    const out = rows([row()]);
    expect(count(out, 'best-flex')).toBe(1);
    expect(out).toContain('class="flex-choice best-flex"');
    expect(out).toContain('<span>BEST FLEX</span><span class="flex-strength">91.8</span>');
    expect(out).toContain('<span>OPTION</span><span class="flex-strength">90.2</span>');
    expect(out).toContain('aria-label="Delta, completed team strength 91.8, best flex"');
    expect(out).toContain('aria-label="Echo, completed team strength 90.2"');
  });

  it('keeps the strength, the --strength bar and the aria-label in step', () => {
    const out = rows([row({ strength: 83.04 })]);
    expect(out).toContain('style="--strength:83.0%"');
    expect(out).toContain('aria-label="Core 1, best completed team strength 83.0"');
    expect(out).toContain('<div class="score"><strong>83.0</strong>');
  });

  it('marks Shadow members and tiles', () => {
    const shadow: CoreTag = { kind: 'shadow', text: 'Shadow' };
    const out = rows([
      row({
        core: [member('Alpha', { tags: [shadow] }), member('Beta')],
        flex: [flex('Delta', 90, { tags: [shadow] })],
      }),
    ]);
    expect(count(out, 'member shadow-member')).toBe(1);
    expect(out).toContain('flex-choice best-flex shadow-choice');
  });

  it('keeps a five-tag member in order: mega, region, form, shadow, elite', () => {
    const tags: CoreTag[] = [
      mega,
      { kind: 'region', text: 'Alolan' },
      { kind: 'form', text: 'Origin' },
      { kind: 'shadow', text: 'Shadow' },
      { kind: 'elite', text: 'Elite' },
    ];
    const out = rows([row({ core: [member('Tri', { tags, isMega: true }), member('Beta')] })]);
    const order = [
      'tag mega">Mega',
      'tag region">Alolan',
      'tag region">Origin',
      'tag shadow">Shadow',
      'tag elite">Elite',
    ];
    const at = order.map((t) => out.indexOf(`<span class="${t}`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('prints the caution names or the clear sentence', () => {
    const clear = rows([row()]);
    expect(clear).toContain('Nothing in the meta beats all three');
    expect(clear).not.toContain('Watch for:');
    const alert = rows([row({ caution: ['Azu', 'Bul'] })]);
    expect(alert).toContain('<strong>Watch for:</strong> Azu, Bul');
    expect(alert).not.toContain('Nothing in the meta');
  });

  it('escapes text and never reads $ as a back-reference', () => {
    const nasty = 'A<b>&"$& $1 $$';
    const out = fill(
      [
        row({
          core: [member(nasty, { moves: [nasty, 'X', 'Y'] }), member('Beta')],
          flex: [flex(nasty, 90)],
          caution: [nasty],
        }),
      ],
      {
        title: nasty,
        subtitle: nasty,
        readingLine: nasty,
        label: nasty,
        source: [nasty, nasty, nasty],
      },
    );
    expect(out).not.toContain('A<b>');
    expect(out).toContain('A&lt;b&gt;&amp;&quot;$&amp; $1 $$');
    expect(() => assertAscii(out)).not.toThrow();
  });

  it('uses the two-line title style only for long titles', () => {
    expect(fill([row()], { title: 'Short' })).not.toContain('mega-core-board long-title');
    const out = fill([row()], { title: 'A Very Long Cup Title Here' });
    expect(out).toMatch(/<section class="board core-board mega-core-board long-title"/);
  });

  it('fills the header, mascot and footer, leaving no sample text', () => {
    const out = fill([row()]);
    expect(out).toContain('<h1 id="mega-flex-title">Test Cup</h1>');
    expect(out).toContain('<p class="subtitle">Top 5 Cores</p>');
    expect(out).toContain('Keep the pair. Choose one flex.');
    expect(out).toContain('LIVE SEP 22 - OCT 6');
    expect(out).toContain('<img class="mascot-img" src="data:image/png;base64,AAAA"');
    expect(out).toContain('<p>Source one</p><p>Source two</p><p>Source three</p>');
    for (const stale of ['PROVISIONAL', 'placeholder', 'ILLUSTRATIVE', 'Kingdra', 'Color Cup']) {
      expect(out).not.toContain(stale);
    }
    expect(() => assertAscii(out)).not.toThrow();
  });
});
