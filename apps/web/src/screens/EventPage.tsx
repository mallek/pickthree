import { Header, IconButton } from '@pickthree/ui';
import { CogGlyph } from '../components.tsx';
import { useActions } from '../state/store.tsx';

/** EventPage: a placeholder until its screen is built; only the sub-header so far. */
export function EventPage({ id }: { id: string; p?: string }) {
  const { openSheet, back } = useActions();
  return (
    <div className="screen" data-event={id}>
      <div className="sub-head">
        <Header
          variant="sub"
          title="Tournament"
          back={{ label: 'Back', onClick: () => back({ screen: 'meta-events' }) }}
          actions={
            <IconButton label="Settings" onClick={openSheet}>
              <CogGlyph />
            </IconButton>
          }
        />
      </div>
    </div>
  );
}
