import { Button } from '@pickthree/ui';
import { useActions, useAppState } from '../../state/store.tsx';

/**
 * Import, first on the hub and on Your data when there is no collection: one line and the
 * page's one primary button. It closes the sheet and opens Import.
 */
export function ImportCard() {
  const s = useAppState();
  const { closeSheet, navigate } = useActions();
  return (
    <div className="card settings-card">
      <p className="settings-card-line">Update or replace the collection on this phone.</p>
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
