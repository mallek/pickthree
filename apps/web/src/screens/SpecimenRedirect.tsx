import { Empty, Header, IconButton, Loading } from '@pickthree/ui';
import { useEffect } from 'react';
import { CogGlyph } from '../components.tsx';
import { ownSpeciesId } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';

/**
 * An old link to a Pokémon's own page (`#/collection/<id>`). That page is gone: the Pokémon is
 * shown on its species page, so the link hands off there, taking this entry's place in history.
 */
export function SpecimenRedirect({ id }: { id: string }) {
  const s = useAppState();
  const { back, navigate, openSheet } = useActions();
  const sp = s.collection?.specimens.find((x) => x.id === id);
  useEffect(() => {
    if (sp) {
      navigate({ screen: 'species', id: ownSpeciesId(sp), copy: sp.id }, { replace: true });
    }
  }, [sp, navigate]);
  return (
    <div className="screen">
      <Header
        variant="sub"
        back={{ label: 'Back', onClick: () => back({ screen: 'collection' }) }}
        actions={
          <IconButton label="Settings" onClick={openSheet}>
            <CogGlyph />
          </IconButton>
        }
      />
      <div className="scroll">
        {sp || !s.settingsLoaded ? (
          <Loading label="Loading your collection" />
        ) : (
          <Empty line="That Pokémon is not in the current collection." />
        )}
      </div>
    </div>
  );
}
