import { describe, expect, it } from 'vitest';
import { clearMark, localStamp, mergeScan, removeSpecimens } from '../../src/collection/merge.js';
import { mon, syntheticIndex } from './synthetic.js';

const index = syntheticIndex();
const NOW = '2026-10-01 12:00:00';
const later = { scannedAt: '2026-09-08 10:00' };

describe('localStamp', () => {
  it('is local wall-clock time in the frame scan dates use', () => {
    expect(localStamp(new Date(2026, 9, 1, 7, 5, 9))).toBe('2026-10-01 07:05:09');
  });
});

describe('mergeScan', () => {
  it('a first import adds everything', () => {
    const r = mergeScan([], [], [mon('a', 'eevee'), mon('b', 'stunfisk')], index, NOW);
    expect(r.specimens.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(r.breakdown).toEqual({ added: 2, merged: 0, updated: 0, skipped: 0, notInScan: [] });
  });

  it('the same file again changes nothing', () => {
    const have = [mon('a', 'eevee')];
    const r = mergeScan(have, [], [mon('a', 'eevee')], index, NOW);
    expect(r.specimens).toEqual(have);
    expect(r.breakdown).toMatchObject({ added: 0, merged: 1, updated: 0 });
  });

  it('a newer scan of a powered-up Pokemon updates it and keeps its id', () => {
    const have = [mon('old', 'eevee', { megaLevel4: true })];
    const scan = mon('new', 'eevee', { ...later, level: { min: 20, max: 20 }, cp: 560 });
    const r = mergeScan(have, [], [scan], index, NOW);
    expect(r.specimens).toHaveLength(1);
    expect(r.specimens[0]).toMatchObject({ id: 'old', cp: 560, megaLevel4: true });
    expect(r.specimens[0]?.level.max).toBe(20);
    expect(r.breakdown).toMatchObject({ added: 0, merged: 1, updated: 1 });
  });

  it('an edit newer than the scan is kept', () => {
    const have = [mon('old', 'eevee', { cp: 600, editedAt: '2026-09-20 09:00:00' })];
    const r = mergeScan(have, [], [mon('new', 'eevee', later)], index, NOW);
    expect(r.specimens[0]).toMatchObject({ id: 'old', cp: 600 });
    expect(r.breakdown).toMatchObject({ merged: 1, updated: 0 });
  });

  it('a scan newer than the edit wins', () => {
    const have = [mon('old', 'eevee', { cp: 600, editedAt: '2026-09-05 09:00:00' })];
    const r = mergeScan(have, [], [mon('new', 'eevee', { ...later, cp: 610 })], index, NOW);
    expect(r.specimens[0]).toMatchObject({ id: 'old', cp: 610, editedAt: '2026-09-05 09:00:00' });
  });

  it('an Eevee evolved since the last scan comes back as the same Pokemon', () => {
    const r = mergeScan([mon('old', 'eevee')], [], [mon('new', 'umbreon', later)], index, NOW);
    expect(r.specimens).toHaveLength(1);
    expect(r.specimens[0]).toMatchObject({ id: 'old', speciesId: 'umbreon' });
  });

  it('never matches across regional forms or across the Shadow flag', () => {
    const have = [mon('k', 'stunfisk'), mon('m', 'mudkip')];
    const scans = [mon('g', 'stunfisk_galarian', later), mon('s', 'mudkip_shadow', later)];
    const r = mergeScan(have, [], scans, index, NOW);
    expect(r.breakdown).toMatchObject({ added: 2, merged: 0, notInScan: ['k', 'm'] });
    expect(r.specimens).toHaveLength(4);
  });

  it('two with the same IVs pair by species, then by the closest level', () => {
    const have = [
      mon('low', 'eevee', { level: { min: 10, max: 10 } }),
      mon('high', 'eevee', { level: { min: 30, max: 30 } }),
      mon('umb', 'umbreon'),
    ];
    const scans = [
      mon('s-umb', 'umbreon', { ...later, cp: 1 }),
      mon('s-31', 'eevee', { ...later, level: { min: 31, max: 31 }, cp: 2 }),
      mon('s-11', 'eevee', { ...later, level: { min: 11, max: 11 }, cp: 3 }),
      mon('s-extra', 'eevee', { ...later, level: { min: 20, max: 20 }, cp: 4 }),
    ];
    const r = mergeScan(have, [], scans, index, NOW);
    const cp = (id: string) => r.specimens.find((s) => s.id === id)?.cp;
    expect([cp('umb'), cp('high'), cp('low')]).toEqual([1, 2, 3]);
    expect(r.breakdown).toMatchObject({ added: 1, merged: 3 });
    expect(r.specimens.map((s) => s.id)).toContain('s-extra');
  });

  it('does not depend on the order of the file', () => {
    const have = [mon('a', 'eevee'), mon('b', 'eevee', { level: { min: 30, max: 30 } })];
    const scans = [
      mon('x', 'eevee', { ...later, level: { min: 12, max: 12 }, cp: 7 }),
      mon('y', 'eevee', { ...later, level: { min: 33, max: 33 }, cp: 8 }),
    ];
    const one = mergeScan(have, [], scans, index, NOW);
    const two = mergeScan(have, [], [...scans].reverse(), index, NOW);
    expect(two.specimens).toEqual(one.specimens);
  });

  it('a rescan with IVs fills in a Pokemon that had none', () => {
    const have = [mon('blank', 'eevee', { ivs: null })];
    const r = mergeScan(have, [], [mon('new', 'eevee', later)], index, NOW);
    expect(r.specimens).toHaveLength(1);
    expect(r.specimens[0]).toMatchObject({ id: 'blank', ivs: { atk: 1, def: 15, sta: 13 } });
  });

  it('a removed Pokemon is skipped, and only as many as were removed', () => {
    const gone = removeSpecimens(
      [mon('a', 'eevee'), mon('b', 'eevee', { level: { min: 30, max: 30 } })],
      [],
      new Set(['b']),
      index,
      NOW,
    );
    expect(gone.specimens.map((s) => s.id)).toEqual(['a']);
    const scans = [mon('a', 'eevee'), mon('b', 'eevee', { level: { min: 30, max: 30 } })];
    const r = mergeScan(gone.specimens, gone.removed, scans, index, NOW);
    expect(r.specimens.map((s) => s.id)).toEqual(['a']);
    expect(r.breakdown).toMatchObject({ added: 0, merged: 1, skipped: 1 });
    const three = mergeScan(
      gone.specimens,
      gone.removed,
      [...scans, mon('c', 'eevee')],
      index,
      NOW,
    );
    expect(three.breakdown).toMatchObject({ added: 1, skipped: 1 });
  });

  it('a mark does not block a different line with the same IVs', () => {
    const gone = removeSpecimens([mon('a', 'eevee')], [], new Set(['a']), index, NOW);
    const r = mergeScan([], gone.removed, [mon('s', 'stunfisk')], index, NOW);
    expect(r.breakdown).toMatchObject({ added: 1, skipped: 0 });
  });

  it('adding it back by hand clears the mark', () => {
    const gone = removeSpecimens([mon('a', 'eevee')], [], new Set(['a']), index, NOW);
    expect(clearMark(gone.removed, mon('z', 'eevee'), index)).toEqual([]);
    expect(clearMark(gone.removed, mon('z', 'stunfisk'), index)).toEqual(gone.removed);
  });

  it('what the scan lacks is kept; hand-added ones are not counted as missing', () => {
    const have = [mon('scanned', 'eevee'), mon('typed', 'stunfisk', { source: 'manual' })];
    const r = mergeScan(have, [], [mon('new', 'mudkip')], index, NOW);
    expect(r.specimens.map((s) => s.id).sort()).toEqual(['new', 'scanned', 'typed']);
    expect(r.breakdown.notInScan).toEqual(['scanned']);
  });

  it('a hand-added Pokemon a newer scan matches becomes a scanned one', () => {
    const have = [mon('typed', 'eevee', { source: 'manual' })];
    const r = mergeScan(have, [], [mon('new', 'eevee', { ...later, cp: 500 })], index, NOW);
    expect(r.specimens[0]).toMatchObject({ id: 'typed', cp: 500 });
    expect(r.specimens[0]?.source).toBeUndefined();
  });

  it('a sheet with no dates is dated at the import and wins', () => {
    const have = [mon('old', 'eevee', { editedAt: '2026-09-20 09:00:00' })];
    const r = mergeScan(have, [], [mon('new', 'eevee', { scannedAt: '', cp: 777 })], index, NOW);
    expect(r.specimens[0]).toMatchObject({ id: 'old', cp: 777, scannedAt: NOW });
  });

  it('a new Pokemon whose id is already taken gets an id of its own', () => {
    const have = [mon('h1', 'eevee', { ivs: { atk: 9, def: 9, sta: 9 } })];
    const r = mergeScan(have, [], [mon('h1', 'stunfisk')], index, NOW);
    expect(new Set(r.specimens.map((s) => s.id)).size).toBe(2);
    expect(r.specimens.find((s) => s.speciesId === 'eevee')?.id).toBe('h1');
  });
});
