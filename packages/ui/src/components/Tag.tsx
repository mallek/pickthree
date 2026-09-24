import type { ReactNode } from 'react';

export type TagTone = 'neutral' | 'accent' | 'win' | 'loss' | 'tanked' | 'warn';

/** A read-only label: fit, verdict, rank, outcome, "yours", "few", "Shadow". Never tappable and
 * never styled like a button. Types use TypeChip, which is the type tag. Pink is never a tag
 * color: measured numbers use MeasuredValue. */
export function Tag({ tone = 'neutral', children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={`ui-tag ui-tag-${tone}`}>{children}</span>;
}
