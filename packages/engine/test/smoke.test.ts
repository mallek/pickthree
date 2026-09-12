import { describe, expect, it } from 'vitest';
import { ENGINE_NAME } from '../src/index.js';

describe('engine package', () => {
  it('loads', () => {
    expect(ENGINE_NAME).toBe('@pickthree/engine');
  });
});
