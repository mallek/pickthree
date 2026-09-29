import { describe, expect, it } from 'vitest';
import { closableIssues, parseCheckOutput } from '../src/close-schedule-issues.js';

const out = (warnings: unknown[], feed: boolean, rankings: boolean) =>
  JSON.stringify({ warnings, judged: { feed, rankings } });

describe('parseCheckOutput', () => {
  it.each([
    ['empty output', ''],
    ['whitespace only', '  \n'],
    ['not JSON', 'oops'],
    ['a bare array (old shape)', '[]'],
    ['null', 'null'],
    ['warnings not an array', '{"warnings":{},"judged":{"feed":true,"rankings":true}}'],
    ['judged missing', '{"warnings":[]}'],
    ['judged.feed not boolean', '{"warnings":[],"judged":{"feed":1,"rankings":true}}'],
    ['judged.rankings missing', '{"warnings":[],"judged":{"feed":true}}'],
    [
      'a warning without a title',
      '{"warnings":[{"body":"x"}],"judged":{"feed":true,"rankings":true}}',
    ],
  ])('throws on %s', (_name, text) => {
    expect(() => parseCheckOutput(text)).toThrow();
  });

  it('accepts a valid object with trailing newline', () => {
    const w = [{ title: 'T', body: 'B' }];
    expect(parseCheckOutput(`${out(w, true, false)}\n`)).toEqual({
      warnings: w,
      judged: { feed: true, rankings: false },
    });
  });
});

const OPEN = (...titles: string[]) => titles.map((title, i) => ({ number: i + 1, title }));
const CUP = "Map GBL cup 'X' to a PvPoke cup";
const NOSEASON = 'GBL feed week without a season: Y';
const NORANK = 'Little Cup starts 2026-10-13 with no PvPoke rankings at 500';
const STALE = 'Fantasy Cup starts 2026-10-20 on stale PvPoke rankings';

describe('closableIssues', () => {
  it('closes each kind only when it was judged', () => {
    const open = OPEN(CUP, NOSEASON, NORANK, STALE);
    expect(closableIssues(parseCheckOutput(out([], true, true)), open)).toEqual([1, 2, 3, 4]);
    expect(closableIssues(parseCheckOutput(out([], true, false)), open)).toEqual([1, 2]);
    expect(closableIssues(parseCheckOutput(out([], false, true)), open)).toEqual([3, 4]);
    expect(closableIssues(parseCheckOutput(out([], false, false)), open)).toEqual([]);
  });

  it('keeps issues that are still warned', () => {
    const open = OPEN(CUP, STALE);
    const w = [{ title: CUP, body: '' }];
    expect(closableIssues(parseCheckOutput(out(w, true, true)), open)).toEqual([2]);
  });

  it('never closes the feed-failing issue or unrecognized titles', () => {
    const open = OPEN('GBL schedule feed failing', 'Something a human filed', 'Map GBL cup');
    expect(closableIssues(parseCheckOutput(out([], true, true)), open)).toEqual([]);
  });
});
