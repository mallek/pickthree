import { Button } from '@pickthree/ui';
import { useActions, useAppState } from '../../state/store.tsx';

/**
 * Import, first on the hub and on Your data when there is no collection: the page's one
 * primary button, with a line under a collection that is there to update. It closes the sheet
 * and opens Import.
 */
export function ImportCard() {
  const s = useAppState();
  const { closeSheet, navigate } = useActions();
  return (
    <div className="card settings-card">
      {s.collection ? (
        <p className="settings-card-line">Update or replace the collection on this phone.</p>
      ) : null}
      <Button
        variant="primary"
        onClick={() => {
          closeSheet();
          navigate({ screen: 'import' });
        }}
      >
        {s.collection ? 'Import a new CSV' : 'Import a CSV'}
      </Button>
    </div>
  );
}
