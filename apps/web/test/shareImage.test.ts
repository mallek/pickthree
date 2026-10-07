import { describe, expect, it } from 'vitest';
import { dexLayout, shareHeadline } from '../src/achievements/shareImage.ts';

describe('share image', () => {
  it('is 1080 wide and fits all 151 slots inside it', () => {
    const l = dexLayout();
    expect(l.width).toBe(1080);
    const last = l.slot(150);
    expect(last.x + l.cell).toBeLessThanOrEqual(l.width);
    expect(last.y + l.cell).toBeLessThan(l.height);
    expect(l.slot(l.cols).y).toBeGreaterThan(l.slot(0).y);
  });

  it('words the headline with and without a shiny', () => {
    const e = (species: string, shiny: boolean) => ({ id: species, earnedAt: 'x', species, shiny });
    expect(shareHeadline({ earned: [e('pidgey', false)], marks: [] })).toBe(
      '1 of 151 · earned by playing GBL',
    );
    expect(shareHeadline({ earned: [e('pidgey', false), e('lapras', true)], marks: [] })).toBe(
      '2 of 151 · 1 shiny · earned by playing GBL',
    );
  });
});
