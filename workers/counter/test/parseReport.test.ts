import { describe, expect, it } from 'vitest';
import { parseReport } from '../src/report.js';

describe('error report parsing', () => {
  it('accepts a well-formed report and clips the fields', () => {
    const r = parseReport({
      build: 'a114140',
      stage: 'verdicts',
      message: 'Unknown second move cost tier: false',
      ua: 'iOS Safari installed',
    });
    expect(r).not.toBeNull();
    expect(r!.build).toBe('a114140');
    expect(r!.stage).toBe('verdicts');
    expect(r!.ua).toBe('iOS Safari installed');
    expect(r!.at).toMatch(/^\d{4}-/);
    const long = parseReport({ build: 'dev', stage: 'boot', message: 'x'.repeat(1000) });
    expect(long!.message.length).toBe(600);
  });

  it('drops anything that is not the shape the app sends', () => {
    expect(parseReport(null)).toBeNull();
    expect(parseReport('nope')).toBeNull();
    expect(parseReport({ build: 'not a sha', stage: 'verdicts', message: 'x' })).toBeNull();
    expect(parseReport({ build: 'a114140', stage: 'Verdicts!', message: 'x' })).toBeNull();
    expect(parseReport({ build: 'a114140', stage: 'verdicts', message: '' })).toBeNull();
  });
});
