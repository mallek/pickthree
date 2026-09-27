import { Sheet, Switch } from '@pickthree/ui';
import { useSticky } from '../components.tsx';

/** The list's five switches and their defaults (Group same Pokémon on, the four filters off);
 * Collection reads the same keys with the same defaults. */
const COLLECTION_FILTERS = [
  {
    key: 'collection.grouped',
    label: 'Group same Pokémon',
    line: 'One row per species, best first',
    initial: true,
  },
  {
    key: 'collection.showIneligible',
    label: 'Show ineligible',
    line: 'Pokémon over the cap or banned here',
    initial: false,
  },
  {
    key: 'collection.shadows',
    label: 'Shadows only',
    line: 'Just the Shadow Pokémon',
    initial: false,
  },
  {
    key: 'collection.recent',
    label: 'Scanned recently',
    line: 'Last two weeks of scans',
    initial: false,
  },
  {
    key: 'collection.meta',
    label: 'Top 50 meta',
    line: 'Only species in the top 50 for this league',
    initial: false,
  },
] as const;

/** One switch on its sticky key: the list reads the same key, so it follows at once. */
function FilterSwitch({ filter }: { filter: (typeof COLLECTION_FILTERS)[number] }) {
  const [on, setOn] = useSticky<boolean>(filter.key, filter.initial);
  return <Switch label={filter.label} line={filter.line} checked={on} onChange={setOn} />;
}

function FiltersBody() {
  return (
    <div className="collection-filters">
      {COLLECTION_FILTERS.map((f) => (
        <FilterSwitch key={f.key} filter={f} />
      ))}
    </div>
  );
}

/** Collection's Filters sheet: the five list switches, read and written through the same sticky
 * keys as the list itself, so the rows and the filter count behind the sheet change as you flip. */
export function CollectionFilters({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      onClose={onClose}
      root={{ id: 'collection-filters', title: 'Filters', render: () => <FiltersBody /> }}
    />
  );
}
