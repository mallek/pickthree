import lockupDark from '@pickthree/ui/brand/lockup.svg';
import lockupLight from '@pickthree/ui/brand/lockup-light.svg';
import { useEffect, useState } from 'react';
import { PokemonToken } from '../components.tsx';
import { TrainerCounter, useTrainerCount } from '../components/TrainerCounter.tsx';
import { useActions, useAppState } from '../state/store.tsx';

/**
 * The landing screen and nothing else: what pick3 is, and the three ways in. Importing moved to
 * its own screen so this one can stay a pitch rather than a form.
 */
export function Welcome() {
  const { boot, bootError } = useAppState();
  const { navigate } = useActions();
  const count = useTrainerCount();
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (!infoOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setInfoOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [infoOpen]);

  return (
    <div className="screen">
      <div
        className="scroll"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)', gap: 28 }}
      >
        <div className="stack">
          <h1 className="hero">
            Find your best battle team with{' '}
            <img className="only-dark hero-lockup" src={lockupDark} alt="pick3" />
            <img className="only-light hero-lockup" src={lockupLight} alt="pick3" />
          </h1>
          <p className="muted">
            Which Pokémon to use, in what order, with which moves, and what it costs.
          </p>
        </div>
        {/* Decorative: three type-coloured discs for a little colour up top. Hidden from screen
         * readers, which have no use for three Pokémon names that are not part of the flow. */}
        <div className="hero-trio" aria-hidden="true">
          {['pikachu', 'bulbasaur', 'charmander'].map((id) => (
            <PokemonToken key={id} speciesId={id} size={64} showInitial={false} />
          ))}
        </div>
        <ol className="steps">
          <li>
            <span>1</span>
            <b>Get your Pokémon in</b>
          </li>
          <li>
            <span>2</span>
            <b>Get your teams</b>
          </li>
          <li>
            <span>3</span>
            <b>Check any team</b>
          </li>
        </ol>
        {bootError ? (
          <div className="error">Game data failed to load: {bootError}. Reload to try again.</div>
        ) : null}
      </div>
      <div className="bottom-actions">
        <button
          type="button"
          className="btn"
          disabled={boot === 'error'}
          onClick={() => navigate({ screen: 'import' })}
        >
          <i />
          Import your Pokémon
        </button>
        <span className="small muted" style={{ textAlign: 'center' }}>
          No CSV? You do not need one.
        </span>
        <div className="btn-pair">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={boot !== 'ready'}
            onClick={() => navigate({ screen: 'build' })}
          >
            Build a team
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={boot !== 'ready'}
            onClick={() => navigate({ screen: 'add' })}
          >
            Add by hand
          </button>
        </div>
        <div className="trainer-row">
          <TrainerCounter count={count} />
          <button
            type="button"
            className="info-dot"
            aria-label="What pick3 sends"
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen(true)}
          >
            i
          </button>
        </div>
        {infoOpen ? (
          <>
            <div className="overlay clear" onClick={() => setInfoOpen(false)} aria-hidden="true" />
            <div className="popover" role="dialog" aria-label="What pick3 sends">
              <div className="between" style={{ marginBottom: 4 }}>
                <b>Your data</b>
                <button type="button" className="btn-ghost" onClick={() => setInfoOpen(false)}>
                  Done
                </button>
              </div>
              <p className="small muted">
                Your file is processed on your phone and never uploaded anywhere. What is sent: an
                anonymous tick to the counter, anonymous error reports, and the battles you log, as
                anonymous records for the community meta (off in Settings if you prefer). Never your
                Pokémon.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
