import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DERIVES_FROM, SHIPPED_CUPS, readLeagues } from '../src/leagues.js';
import { GAMEMASTER_PATH } from '../src/paths.js';

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);

describe('SHIPPED_CUPS', () => {
  it('names the Play! Championship Series cup and where it derives from', () => {
    expect(SHIPPED_CUPS.map((c) => c.id)).toEqual(['championshipseries']);
    expect(DERIVES_FROM).toEqual({ championshipseries: 'great' });
  });
});

describe.skipIf(!havePvPoke)('readLeagues', () => {
  it('ships the Tournament league whatever PICKTHREE_SPECIAL_CUPS says', () => {
    const before = process.env['PICKTHREE_SPECIAL_CUPS'];
    delete process.env['PICKTHREE_SPECIAL_CUPS'];
    try {
      const leagues = readLeagues();
      const tournament = leagues.find((l) => l.id === 'championshipseries');
      expect(tournament).toBeDefined();
      expect(tournament!.title).toBe('Tournament');
      expect(tournament!.short).toBe('Tournament');
      expect(tournament!.cp).toBe(1500);
      expect(tournament!.cup).toBe('championshipseries');
      expect(tournament!.meta).toBe('great');
      expect(tournament!.kind).toBe('cup');
      expect(tournament!.minCp).toBe(1410);
      // The cup's own rules, copied from the gamemaster: no megas, no Mimikyu.
      expect(tournament!.include).toEqual([]);
      expect(tournament!.exclude).toEqual([
        { filterType: 'tag', values: ['mega'] },
        { filterType: 'id', values: ['mimikyu'] },
      ]);
    } finally {
      if (before !== undefined) {
        process.env['PICKTHREE_SPECIAL_CUPS'] = before;
      }
    }
  });

  it('keeps the three open leagues first and lists the cup exactly once', () => {
    const ids = readLeagues().map((l) => l.id);
    expect(ids.slice(0, 3)).toEqual(['great', 'ultra', 'master']);
    expect(ids.filter((id) => id === 'championshipseries')).toHaveLength(1);
  });
});
