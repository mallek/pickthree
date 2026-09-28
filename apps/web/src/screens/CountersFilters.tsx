import { Seg, Sheet } from '@pickthree/ui';
import { useSticky } from '../components.tsx';

export type CountersOwn = 'all' | 'have' | 'build';

/** The sticky key and default the page and this sheet share, so the rows follow at once. */
export const OWN_KEY = 'counters.own';
export const OWN_DEFAULT: CountersOwn = 'all';

const OWN_OPTIONS: { value: CountersOwn; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'have', label: 'You own' },
  { value: 'build', label: 'Own or can build' },
];

function FiltersBody() {
  const [own, setOwn] = useSticky<CountersOwn>(OWN_KEY, OWN_DEFAULT);
  return (
    <div className="counters-filters">
      <Seg<CountersOwn> value={own} options={OWN_OPTIONS} onChange={setOwn} />
    </div>
  );
}

/** Counters' Filters sheet: which counters to list, by what you own. */
export function CountersFilters({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      onClose={onClose}
      root={{ id: 'counters-filters', title: 'Filters', render: () => <FiltersBody /> }}
    />
  );
}
