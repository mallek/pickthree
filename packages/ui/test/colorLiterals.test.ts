import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectLiterals } from '../../../scripts/color-literals.mjs';

const baselineFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/color-literal-baseline.json',
);
const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Record<
  string,
  Record<string, number>
>;

describe('color literals outside tokens.css', () => {
  it('match the baseline exactly (the baseline may only shrink)', () => {
    expect(collectLiterals()).toEqual(baseline);
  });

  it('never appear in packages/ui/base.css', () => {
    expect(collectLiterals()['packages/ui/base.css'] ?? {}).toEqual({});
  });
});
