import 'fake-indexeddb/auto';
import type { Faceoff } from '@pickthree/engine';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpponentCard } from '../src/components/OpponentCard.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { fakeHost } from './fakeHost.ts';

const faceoff: Faceoff = {
  opponent: 'medicham',
  ranked: true,
  moves: [
    { moveId: 'ASTONISH', name: 'Astonish', type: 'ghost', countFromFast: null, recommended: true },
    {
      moveId: 'NIGHT_SHADE',
      name: 'Night Shade',
      type: 'ghost',
      countFromFast: 5,
      recommended: true,
    },
    {
      moveId: 'SCORCHING_SANDS',
      name: 'Scorching Sands',
      type: 'ground',
      countFromFast: 4,
      recommended: false,
    },
  ],
  members: [
    {
      speciesId: 'azumarill',
      specimenId: null,
      realIvs: false,
      fast: 'BUBBLE',
      charged: ['ICE_BEAM', 'PLAY_ROUGH'],
      cells: [
        { efficacy: 'neutral', multiplier: 1 },
        { efficacy: 'neutral', multiplier: 1 },
        { efficacy: 'super', multiplier: 1.6 },
      ],
      // 0-0, 0-1, 0-2 / 1-0, 1-1, 1-2 / 2-0, 2-1, 2-2
      grid: [900, 560, 440, 100, 700, 500, 610, 390, 300],
      wins: 4,
      evenWins: 1,
      verdict: 'shields',
    },
  ],
  best: 0,
  battles: 9,
  ms: 1,
};

describe('in-battle card shield grid', () => {
  it('fills a decisive result and outlines a close one, the letters never faded', () => {
    const { container } = render(
      <AppProvider host={fakeHost()}>
        <OpponentCard opponent="medicham" data={faceoff} />
      </AppProvider>,
    );
    const grid = container.querySelector('.fo-grid');
    // One-letter cells axe cannot judge; test/contrast.test.ts checks their fills instead.
    expect(grid).toHaveAttribute('data-audit-contrast', 'static');
    const cells = [...container.querySelectorAll('.fo-grid i.w, .fo-grid i.l')];
    expect(cells.map((c) => `${c.className}:${c.textContent}`)).toEqual([
      'w:W',
      'w close:W',
      'l close:L',
      'l:L',
      'w:W',
      'l close:L',
      'w:W',
      'l:L',
      'l:L',
    ]);
    for (const c of cells) {
      expect((c as HTMLElement).style.opacity).toBe('');
    }
  });

  it('shrinks a move name whose longest word is too wide for its column, never breaking it', () => {
    const { container } = render(
      <AppProvider host={fakeHost()}>
        <OpponentCard opponent="medicham" data={faceoff} />
      </AppProvider>,
    );
    const names = [...container.querySelectorAll('.fo-move-name')].map(
      (el) => `${el.textContent}:${el.classList.contains('long')}`,
    );
    // "Astonish" broke as "Astonis / h" at 390px; a long word inside two words shrinks too.
    expect(names).toEqual(['Astonish:true', 'Night Shade:false', 'Scorching Sands:true']);
  });
});
