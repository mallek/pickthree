import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegal, resetLegal } from '../src/legal.js';

function stub(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
}

describe('loadLegal', () => {
  beforeEach(() => {
    resetLegal();
  });

  it('reads the cup and the ban list as a set', async () => {
    const legal = await loadLegal(
      'great',
      stub({ cup: 'championshipseries', banned: ['mimikyu', 'venusaur_mega'] }),
    );
    expect(legal.cup).toBe('championshipseries');
    expect(legal.banned.has('mimikyu')).toBe(true);
    expect(legal.banned.size).toBe(2);
  });

  it('treats a missing file as nothing banned, so an older bake still renders', async () => {
    const legal = await loadLegal('ultra', stub({ error: 'not found' }, 404));
    expect(legal.cup).toBeNull();
    expect(legal.banned.size).toBe(0);
  });

  it('memoises per league', async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ cup: null, banned: [] }), { status: 200 });
    }) as typeof fetch;
    await loadLegal('great', counting);
    await loadLegal('great', counting);
    expect(calls).toBe(1);
  });
});
