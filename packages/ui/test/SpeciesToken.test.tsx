import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpeciesToken } from '../src/index.ts';

describe('SpeciesToken', () => {
  it('marks a two-type disc for the static contrast test: axe cannot measure its gradient', () => {
    render(<SpeciesToken name="Morpeko" types={['electric', 'dark']} showInitial />);
    expect(screen.getByRole('img', { name: 'Morpeko' })).toHaveAttribute(
      'data-audit-contrast',
      'static',
    );
  });

  it('leaves a one-type disc to the audit, which measures its flat color', () => {
    render(
      <>
        <SpeciesToken name="Melmetal" types={['steel']} showInitial />
        <SpeciesToken name="Clodsire" types={['poison', 'poison']} showInitial />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Melmetal' })).not.toHaveAttribute(
      'data-audit-contrast',
    );
    expect(screen.getByRole('img', { name: 'Clodsire' })).not.toHaveAttribute(
      'data-audit-contrast',
    );
  });
});
