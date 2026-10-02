import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SaveBar } from '../src/index.ts';

function bar(over: { busy?: boolean; disabled?: boolean } = {}) {
  const onSave = vi.fn();
  const onDiscard = vi.fn();
  render(
    <SaveBar
      saveLabel="Save changes"
      discardLabel="Discard"
      onSave={onSave}
      onDiscard={onDiscard}
      {...over}
    />,
  );
  return { onSave, onDiscard };
}

describe('SaveBar', () => {
  it('is a named group with Discard then Save, each saying what it does', () => {
    const { onSave, onDiscard } = bar();
    const group = screen.getByRole('group', { name: 'Unsaved changes' });
    const buttons = [...group.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Discard', 'Save changes']);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('while a save runs, neither button acts', () => {
    bar({ busy: true });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('a form that cannot be saved yet can still be discarded', () => {
    bar({ disabled: true });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();
  });

  it('leaves a spacer in the flow so the last field scrolls clear of the bar', () => {
    const { container } = render(
      <SaveBar
        saveLabel="Save"
        discardLabel="Discard"
        onSave={() => undefined}
        onDiscard={() => undefined}
      />,
    );
    expect(container.querySelector('.ui-savebar-space')).not.toBeNull();
  });
});
