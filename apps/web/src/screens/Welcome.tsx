import lockupDark from '@pickthree/ui/brand/lockup.svg';
import lockupLight from '@pickthree/ui/brand/lockup-light.svg';
import { useEffect, useState } from 'react';
import { PokemonToken } from '../components.tsx';
import { ArrowGlyph, LockGlyph, PeopleGlyph } from '../components/LandingGlyphs.tsx';
import { LandingScene } from '../components/LandingScene.tsx';
import { MetaPreview } from '../components/MetaPreview.tsx';
import { TrainerCounter, useTrainerCount } from '../components/TrainerCounter.tsx';
import { useActions, useAppState } from '../state/store.tsx';

/**
 * The landing screen, in this order: who this is, what pick3 does, real output you can look at
 * without owning anything, then the two ways in, then the promise and the count.
 *
 * It scrolls as one page rather than squeezing into one viewport behind a stuck action bar. The
 * bar bought a screenful at the cost of flattening everything into it; on a page whose job is to
 * be looked at before anything is tapped, the scroll is the cheaper trade.
 *
 * Build a team is deliberately not here. It is reachable from Teams, and offering import, manual
 * entry, team building and the meta as four equal choices was the reason this page read as a menu
 * rather than an answer.
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
    <div className="screen landing">
      <LandingScene />
      <div className="scroll landing-scroll">
        <div className="stack landing-intro">
          <h1 className="hero">
            Find your best battle team with{' '}
            <img className="only-dark hero-lockup" src={lockupDark} alt="pick3" />
            <img className="only-light hero-lockup" src={lockupLight} alt="pick3" />
          </h1>
          <p className="muted">
            Which three to bring, in what order, with which moves, and what they will cost to build.
          </p>
        </div>
        {/* Decorative: three type-coloured discs under the headline. Hidden from screen readers,
         * which have no use for three Pokémon names that are not part of the flow, and the first
         * thing dropped on a short screen since nothing depends on it. */}
        <div className="hero-trio" aria-hidden="true">
          {['pikachu', 'bulbasaur', 'charmander'].map((id) => (
            <span className="trio-disc" key={id}>
              <PokemonToken speciesId={id} size={84} showInitial={false} />
            </span>
          ))}
        </div>
        <MetaPreview />
        {bootError ? (
          <div className="error">Game data failed to load: {bootError}. Reload to try again.</div>
        ) : null}
        <div className="landing-you">
          <div className="footer-head">
            <span className="mp-kicker">
              <PeopleGlyph />
              Your Pokémon
            </span>
            <span>Find battle teams with Pokémon from your collection.</span>
          </div>
          <button
            type="button"
            className="btn btn-cta"
            disabled={boot === 'error'}
            onClick={() => navigate({ screen: 'import' })}
          >
            Import your collection
            <ArrowGlyph />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-cta"
            disabled={boot !== 'ready'}
            onClick={() => navigate({ screen: 'add' })}
          >
            Add a few by hand
            <ArrowGlyph />
          </button>
        </div>
        <div className="landing-foot">
          <button
            type="button"
            className="privacy-line"
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen(true)}
          >
            <LockGlyph />
            Runs on your phone. Your collection never leaves it.
          </button>
          <TrainerCounter count={count} inline />
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
                pick3 is free, has no ads and needs no account. Your file is read on your phone and
                never uploaded anywhere, and the teams are worked out on the device. What is sent:
                an anonymous tick to the counter, anonymous error reports, and the battles you log,
                as anonymous records for the community meta (off in Settings if you prefer). Never
                your Pokémon.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
