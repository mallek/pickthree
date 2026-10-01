import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertAscii,
  escapeHtml,
  fillBoards,
  type BoardView,
  type MemberView,
  type RowView,
} from '../scripts/post/fill.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(here, '..', 'scripts', 'post', 'template.html'), 'utf8');

const member = (name: string, extra: Partial<MemberView> = {}): MemberView => ({
  role: 'LEAD',
  name,
  sprite: name.toLowerCase(),
  type: 'water',
  tags: [],
  moves: ['Fast', 'Charged One', 'Charged Two'],
  hero: false,
  ...extra,
});
const row = (strength: number, caution: string[] = []): RowView => ({
  strength,
  members: [
    member('Alpha'),
    member('Beta', { role: 'SWITCH' }),
    member('Gamma', { role: 'CLOSER' }),
  ],
  caution,
});
const board = (id: BoardView['id'], rows: RowView[]): BoardView => ({
  id,
  title: 'Mega Color Cup',
  label: 'LIVE SEP 22 - OCT 6',
  source: [
    'Strength: line one',
    'PvPoke meta only - Sep 30, 2026',
    'Full analysis of every team: links in the post',
  ],
  mascot: 'data:image/png;base64,AAAA',
  rows,
});
const five = [row(92.3), row(91.5, ['Cradily']), row(90.7), row(90.3), row(89.9)];

function section(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  return start < 0 ? '' : html.slice(start, html.indexOf('</section>', start));
}

describe('fillBoards', () => {
  it('writes five rows with the winner first and the strength on each', () => {
    const html = fillBoards(template, [board('top', five)]);
    const top = section(html, 'top');
    expect(top.match(/<article class="team/g)).toHaveLength(5);
    expect(top).toContain('<article class="team winner"');
    expect(top).toContain('style="--strength:92.3%"');
    expect(top).toContain('<strong>92.3</strong>');
    expect(top).toContain('<h1 id="title-top">Mega Color Cup</h1>');
    expect(top).toContain('LIVE SEP 22 - OCT 6');
    expect(top).toContain('src="data:image/png;base64,AAAA"');
    expect(top).toContain('<p class="caution alert"><strong>Watch for:</strong> Cradily</p>');
    expect(top).toContain('<p class="caution clear">Nothing in the meta beats all three</p>');
    expect(top).not.toContain('SAMPLE DATA');
  });

  it('removes a board it was not given', () => {
    const html = fillBoards(template, [board('top', five), board('budget', five)]);
    expect(section(html, 'mega')).toBe('');
    expect(section(html, 'budget')).not.toBe('');
  });

  it('writes a short Mega board and marks its hero', () => {
    const heroRow: RowView = {
      strength: 91.8,
      members: [
        member('Magnezone', { tags: [{ kind: 'shadow', text: 'Shadow' }] }),
        member('Kingdra', { role: 'SWITCH' }),
        member('Charizard', {
          role: 'CLOSER',
          hero: true,
          tags: [
            { kind: 'mega', text: 'Mega X' },
            { kind: 'elite', text: 'Elite TM' },
          ],
        }),
      ],
      caution: [],
    };
    const html = fillBoards(template, [board('mega', [heroRow, row(88)])]);
    const mega = section(html, 'mega');
    expect(mega.match(/<article class="team/g)).toHaveLength(2);
    expect(mega).toContain('<div class="member mega-hero">');
    expect(mega).toContain('<div class="member shadow-member">');
    expect(mega).toContain(
      '<span class="tag mega">Mega X</span><span class="tag elite">Elite TM</span>',
    );
  });

  it('keeps three tags in order: region, then shadow, then Elite TM', () => {
    const r: RowView = {
      ...row(90),
      members: [
        member('Stunfisk', {
          tags: [
            { kind: 'region', text: 'Galarian' },
            { kind: 'shadow', text: 'Shadow' },
            { kind: 'elite', text: 'Elite TM' },
          ],
        }),
        member('Beta', { role: 'SWITCH' }),
        member('Gamma', { role: 'CLOSER' }),
      ],
    };
    const html = fillBoards(template, [board('top', [r])]);
    expect(html).toContain(
      '<span class="tag region">Galarian</span><span class="tag shadow">Shadow</span><span class="tag elite">Elite TM</span>',
    );
  });

  it('escapes text so markup characters cannot break the page', () => {
    const r: RowView = {
      ...row(90),
      members: [member('A<b>&"'), member('B', { role: 'SWITCH' }), member('C', { role: 'CLOSER' })],
    };
    const html = fillBoards(template, [board('top', [r])]);
    expect(html).toContain('A&lt;b&gt;&amp;&quot;');
    expect(escapeHtml(`<&">'`)).toBe('&lt;&amp;&quot;&gt;&#39;');
    const dollar: RowView = {
      ...row(90),
      members: [member('A$&$1'), member('B', { role: 'SWITCH' }), member('C', { role: 'CLOSER' })],
    };
    expect(fillBoards(template, [board('top', [dollar])])).toContain(
      '<span class="name">A$&amp;$1</span>',
    );
  });

  it('uses the long title style for a long cup name', () => {
    const b = { ...board('top', five), title: 'Great League: Mega Edition' };
    expect(fillBoards(template, [b])).toMatch(/<section class="board top long-title" id="top"/);
  });
});

describe('assertAscii', () => {
  it('passes plain text and names a non-ASCII character', () => {
    expect(() => assertAscii('Mega Color Cup - Sep 30')).not.toThrow();
    expect(() => assertAscii('Flabébé leads')).toThrow(/U\+00E9.*Flab/);
  });

  it('accepts the template as shipped', () => {
    expect(() => assertAscii(template)).not.toThrow();
  });
});
