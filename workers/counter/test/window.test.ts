import { describe, expect, it } from 'vitest';
import { readParams } from '../src/meta.js';

function params(qs: string): ReturnType<typeof readParams> {
  return readParams(new URL(`https://meta.pick3.gg/api/v1/meta${qs}`));
}

describe('readParams', () => {
  const ok = '?league=great&since=2026-09-11T00:00:00.000Z&until=2026-09-18T00:00:00.000Z';

  it('accepts a well-formed window', () => {
    expect(params(ok)).toEqual({
      league: 'great',
      since: '2026-09-11T00:00:00.000Z',
      until: '2026-09-18T00:00:00.000Z',
      source: 'all',
    });
  });

  // The rank band filter is retired (Task 13, in step with the Source select). An old link
  // carrying `band=` still parses; the parameter is simply never read.
  it('ignores an old band= parameter entirely', () => {
    expect(params(`${ok}&band=legend`)).not.toHaveProperty('band');
  });

  it('refuses a league that is not an id', () => {
    expect(params(ok.replace('great', 'Great League'))).toEqual({ error: 'bad league' });
  });

  it('refuses a window that is backwards, unparseable or too long', () => {
    expect(params('?league=great&since=nope&until=2026-09-18T00:00:00.000Z')).toEqual({
      error: 'bad window',
    });
    expect(
      params('?league=great&since=2026-09-18T00:00:00.000Z&until=2026-09-11T00:00:00.000Z'),
    ).toEqual({
      error: 'bad window',
    });
    expect(
      params('?league=great&since=2020-01-01T00:00:00.000Z&until=2026-09-18T00:00:00.000Z'),
    ).toEqual({
      error: 'window too long',
    });
  });
});
