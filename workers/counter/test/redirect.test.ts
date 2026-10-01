import { describe, expect, it } from 'vitest';
import { redirectToPick3 } from '../src/redirect.js';

function location(path: string): string | null {
  const res = redirectToPick3(new URL(`https://meta.pick3.gg${path}`));
  expect(res.status).toBe(301);
  return res.headers.get('Location');
}

describe('redirectToPick3', () => {
  it('sends the site root to the Top teams board', () => {
    expect(location('/')).toBe('https://pick3.gg/#/meta/teams');
  });

  it('sends a league root to its Top teams board', () => {
    expect(location('/great')).toBe('https://pick3.gg/#/meta/teams?l=great');
    expect(location('/great/')).toBe('https://pick3.gg/#/meta/teams?l=great');
  });

  it('sends the old /<league>/teams path to the same board', () => {
    expect(location('/ultra/teams')).toBe('https://pick3.gg/#/meta/teams?l=ultra');
  });

  it('keeps a hyphenated league id', () => {
    expect(location('/mega-great')).toBe('https://pick3.gg/#/meta/teams?l=mega-great');
  });

  it('sends the Pokemon list to Collection', () => {
    expect(location('/great/pokemon')).toBe('https://pick3.gg/#/collection?l=great');
  });

  it('sends a species page to the species page', () => {
    expect(location('/great/p/azumarill')).toBe('https://pick3.gg/#/species/azumarill?l=great');
    expect(location('/master/p/giratina_origin')).toBe(
      'https://pick3.gg/#/species/giratina_origin?l=master',
    );
  });

  it('sends About to the Meta landing', () => {
    expect(location('/about')).toBe('https://pick3.gg/#/meta');
  });

  it('sends anything else to the Meta landing', () => {
    expect(location('/assets/index-abc123.js')).toBe('https://pick3.gg/#/meta');
    expect(location('/great/p/azumarill/extra')).toBe('https://pick3.gg/#/meta');
    expect(location('/great/whatever')).toBe('https://pick3.gg/#/meta');
  });

  it('drops an invalid league id', () => {
    expect(location('/Great')).toBe('https://pick3.gg/#/meta/teams');
    expect(location('/favicon.svg')).toBe('https://pick3.gg/#/meta/teams');
    expect(location('/gr%20eat/pokemon')).toBe('https://pick3.gg/#/collection');
  });

  it('drops an invalid species id, landing on the league list it came from', () => {
    expect(location('/great/p/azu-marill')).toBe('https://pick3.gg/#/collection?l=great');
    expect(location('/great/p/%3Cscript%3E')).toBe('https://pick3.gg/#/collection?l=great');
  });

  it('carries window as w and source as src', () => {
    expect(location('/great?window=30&source=ladder')).toBe(
      'https://pick3.gg/#/meta/teams?l=great&w=30&src=ladder',
    );
    expect(location('/great/p/azumarill?w=7&source=tournament')).toBe(
      'https://pick3.gg/#/species/azumarill?l=great&w=7&src=tournament',
    );
  });

  it('reads the legacy season window as This meta', () => {
    expect(location('/great?w=season')).toBe('https://pick3.gg/#/meta/teams?l=great&w=meta');
  });

  it('drops a window or source it does not know', () => {
    expect(location('/great?window=90&source=rumour')).toBe(
      'https://pick3.gg/#/meta/teams?l=great',
    );
    expect(location('/?w=bogus&source=prior')).toBe('https://pick3.gg/#/meta/teams?src=prior');
  });

  it('carries no window or source onto pages without them', () => {
    expect(location('/great/pokemon?window=7&source=ladder')).toBe(
      'https://pick3.gg/#/collection?l=great',
    );
    expect(location('/about?window=7')).toBe('https://pick3.gg/#/meta');
  });

  it('is cacheable for an hour', () => {
    const res = redirectToPick3(new URL('https://meta.pick3.gg/great'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
});
