import { describe, expect, it } from 'vitest';
import { displayName } from '../../src/explain/explain.js';
import { altMoveType, formNote } from '../../src/gamedata/forms.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { haveStaticData, loadStaticData } from '../fixtures.js';

describe.skipIf(!haveStaticData())('battle form changes', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);

  it('explains the Morpeko toggle and the Aura Wheel type swap', () => {
    const note = formNote('morpeko_full_belly', index);
    expect(note).toContain('after every charged move');
    expect(note).toContain('Aura Wheel alternates Electric and Dark');
    expect(altMoveType('morpeko_full_belly', 'Aura Wheel', index)).toBe('dark');
    expect(altMoveType('morpeko_full_belly', 'Seed Bomb', index)).toBeNull();
  });

  it('calls the bring-in toggle form by its plain name', () => {
    expect(displayName('morpeko_full_belly', index)).toBe('Morpeko');
    expect(displayName('morpeko_hangry', index)).toBe('Morpeko (Hangry)');
    expect(displayName('raichu_alolan', index)).toBe('Alolan Raichu');
  });

  it('covers the other three families from the same field', () => {
    expect(formNote('mimikyu', index)).toContain('disguise');
    expect(formNote('cramorant', index)).toMatch(/Dive or Surf turns it into/);
    expect(formNote('cramorant', index)).toContain('Gulp Missile');
    expect(formNote('aegislash_shield', index)).toContain('Blade');
  });

  it('is quiet for everyone else', () => {
    expect(formNote('swampert', index)).toBeNull();
    expect(formNote('mimikyu_busted', index)).toBeNull();
    expect(altMoveType('swampert', 'Hydro Cannon', index)).toBeNull();
  });
});
