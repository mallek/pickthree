import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeLegal } from '../src/build-legal.js';

let dir: string;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function rankings(out: string, league: string, ids: string[]): void {
  fs.mkdirSync(path.join(out, 'rankings', league), { recursive: true });
  fs.writeFileSync(
    path.join(out, 'rankings', league, 'overall.json'),
    JSON.stringify(ids.map((speciesId) => ({ speciesId }))),
  );
}

describe('writeLegal', () => {
  it('writes the Play! ban list for a league with an open-equivalent cup, and an empty one otherwise', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-'));
    rankings(dir, 'great', ['azumarill', 'medicham', 'galvantula']);
    rankings(dir, 'championshipseries', ['azumarill', 'galvantula']);
    rankings(dir, 'ultra', ['giratina_altered']);
    const written = writeLegal(dir, ['great', 'championshipseries', 'ultra']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'legal', 'great.json'), 'utf8'))).toEqual({
      cup: 'championshipseries',
      banned: ['medicham'],
    });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'legal', 'ultra.json'), 'utf8'))).toEqual({
      cup: null,
      banned: [],
    });
    expect(written).toContainEqual({ league: 'great', banned: 1 });
  });
});
