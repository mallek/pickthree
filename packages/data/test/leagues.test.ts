import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import type { League } from '@pickthree/engine';
import {
  DERIVES_FROM,
  SHIPPED_CUPS,
  hasGroup,
  hasRankings,
  isStale,
  readLeagues,
} from '../src/leagues.js';
import { GAMEMASTER_PATH, OUTPUT_DIR } from '../src/paths.js';
import { readSchedule } from '../src/schedule-feed.js';

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
  it('adds one rotation league per scheduled cup PvPoke ranks, after the Tournament league', () => {
    const leagues = readLeagues();
    const schedule = readSchedule();
    const rotation = leagues.filter((l) => l.kind === 'rotation');
    const tournamentAt = leagues.findIndex((l) => l.id === 'championshipseries');
    for (const l of rotation) {
      expect(leagues.indexOf(l)).toBeGreaterThan(tournamentAt);
      const entry = schedule.find((e) => e.league === l.id);
      expect(entry, l.id).toBeDefined();
      expect(l.cup).toBe(entry!.cup);
      expect(l.cp).toBe(entry!.cp);
      expect(l.title).toBe(entry!.title);
      expect(hasRankings(l.cup, l.cp)).toBe(true);
      expect(l.rankingsUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof l.stale).toBe('boolean');
    }
    expect(new Set(rotation.map((l) => l.id)).size).toBe(rotation.length);
  });

  it.skipIf(!fs.existsSync(path.join(OUTPUT_DIR, 'leagues.json')))(
    'every built rotation league has rankings, a non-empty meta (at most 48 when derived from rankings) and a matrix covering it',
    () => {
      const read = <T>(...parts: string[]): T =>
        JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, ...parts), 'utf8')) as T;
      const built = read<League[]>('leagues.json');
      for (const l of built.filter((x) => x.kind === 'rotation')) {
        const overall = read<unknown[]>('rankings', l.id, 'overall.json');
        const meta = read<{ speciesId: string }[]>('meta', `${l.id}.json`);
        expect(overall.length, l.id).toBeGreaterThan(0);
        expect(meta.length, l.id).toBeGreaterThanOrEqual(1);
        // PvPoke's own groups are not capped; only the ranked-top-n fallback is.
        if (!hasGroup(l.meta)) {
          expect(meta.length, l.id).toBeLessThanOrEqual(48);
        }
        expect(l.metaSize).toBe(meta.length);
        const matrix = read<{ opponents: string[] }>('matrix', `${l.id}.json`);
        expect(new Set(matrix.opponents)).toEqual(new Set(meta.map((m) => m.speciesId)));
      }
    },
  );
});

describe('isStale', () => {
  it('is stale when the rankings predate the run by more than 30 days', () => {
    expect(isStale('2024-03-04', '2026-10-13T20:00:00.000Z')).toBe(true);
    expect(isStale('2026-09-15', '2026-09-22T20:00:00.000Z')).toBe(false);
    expect(isStale('2026-08-24', '2026-09-22T20:00:00.000Z')).toBe(false);
    expect(isStale('2026-08-22', '2026-09-22T20:00:00.000Z')).toBe(true);
  });

  it('is stale when the date is unknown', () => {
    expect(isStale(null, '2026-09-22T20:00:00.000Z')).toBe(true);
  });
});
