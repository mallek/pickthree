import { describe, expect, it } from 'vitest';
import { newId } from '../src/state/yourMeta.ts';

describe('newId', () => {
  it('is unique', () => {
    expect(newId()).not.toBe(newId());
  });
});
