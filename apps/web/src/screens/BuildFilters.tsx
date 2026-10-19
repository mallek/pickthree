import { Sheet, Switch } from '@pickthree/ui';
import { useSticky } from '../components.tsx';

/** Build's search switches and their defaults; Build reads the same keys with the same defaults. */
export const BUILD_FILTERS: readonly {
  key: string;
  label: string;
  line?: string;
  initial: boolean;
}[] = [
  {
    key: 'build.yoursOnly',
    label: 'Yours only',
    line: 'Only the Pokémon you have',
    initial: false,
  },
];

/** One switch on its sticky key: the search reads the same key, so it follows at once. */
function FilterSwitch({ filter }: { filter: (typeof BUILD_FILTERS)[number] }) {
  const [on, setOn] = useSticky<boolean>(filter.key, filter.initial);
  return (
    <Switch
      label={filter.label}
      {...(filter.line ? { line: filter.line } : {})}
      checked={on}
      onChange={setOn}
    />
  );
}

function FiltersBody() {
  return (
    <div className="collection-filters">
      {BUILD_FILTERS.map((f) => (
        <FilterSwitch key={f.key} filter={f} />
      ))}
    </div>
  );
}

/** Build's Filters sheet: the slot search's switches, on the same sticky keys the search reads. */
export function BuildFilters({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      onClose={onClose}
      root={{ id: 'build-filters', title: 'Filters', render: () => <FiltersBody /> }}
    />
  );
}
