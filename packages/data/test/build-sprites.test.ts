import { describe, expect, it } from 'vitest';
import { megaBaseId } from '../src/build-gamedata.js';
import { varietyNameFor } from '../src/build-sprites.js';

describe('varietyNameFor Megas', () => {
  it.each([
    ['charizard_mega_x', 'charizard-mega-x'],
    ['charizard_mega_y', 'charizard-mega-y'],
    ['sableye_mega', 'sableye-mega'],
    ['kyogre_primal', 'kyogre-primal'],
    ['groudon_primal', 'groudon-primal'],
  ])('maps %s to the PokeAPI variety %s', (id, variety) => {
    expect(megaBaseId(id)).not.toBeNull();
    expect(varietyNameFor(id)).toBe(variety);
  });

  it('gives a Mega variety that extends its base variety name', () => {
    for (const id of ['swampert_mega', 'garchomp_mega', 'gardevoir_mega']) {
      const base = megaBaseId(id) as string;
      expect(varietyNameFor(id).startsWith(`${varietyNameFor(base)}-mega`)).toBe(true);
    }
  });
});
