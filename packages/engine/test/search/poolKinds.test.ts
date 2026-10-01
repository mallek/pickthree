import { describe, expect, it } from 'vitest';
import { poolKinds } from '../../src/search/candidates.js';

const c = (speciesId: string) => ({ build: { speciesId } });
const fold = (id: string) => (id.endsWith('_mega') ? id.slice(0, -'_mega'.length) : id);

describe('poolKinds', () => {
  it('counts distinct team species, a Mega folding into its base form', () => {
    expect(poolKinds([c('medicham'), c('medicham'), c('azumarill')], fold)).toBe(2);
    expect(poolKinds([c('venusaur'), c('venusaur_mega')], fold)).toBe(1);
  });
  it('is zero for an empty pool', () => {
    expect(poolKinds([], fold)).toBe(0);
  });
});
