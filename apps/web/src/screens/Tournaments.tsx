import { Header, IconButton } from '@pickthree/ui';
import { CogGlyph } from '../components.tsx';
import { useActions } from '../state/store.tsx';

/** Tournaments: a placeholder until its screen is built; only the sub-header so far. */
export function Tournaments() {
  const { openSheet, back } = useActions();
  return (
    <div className="screen">
      <div className="sub-head">
        <Header
          variant="sub"
          title="Tournaments"
          back={{ label: 'Back', onClick: () => back({ screen: 'meta' }) }}
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
