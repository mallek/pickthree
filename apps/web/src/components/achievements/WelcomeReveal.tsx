import { Button, Sheet } from '@pickthree/ui';
import { useAchievements } from '../../achievements/AchievementsProvider.tsx';
import { useName } from '../../components.tsx';
import { useActions } from '../../state/store.tsx';
import { RewardToken } from './tokens.tsx';

/**
 * The sheet that opens when several achievements land at once: the first run over an existing
 * battle log, or a log import that earns more than one.
 */
export function WelcomeReveal() {
  const name = useName();
  const { navigate } = useActions();
  const { reveal, closeReveal } = useAchievements();
  if (!reveal) {
    return null;
  }
  return (
    <Sheet
      onClose={closeReveal}
      root={{
        id: 'ach-welcome',
        title: 'Achievements',
        render: () => (
          <div className="stack" style={{ gap: 14 }}>
            <div className="stack" style={{ gap: 4 }}>
              <b style={{ fontSize: 17 }}>{reveal.title}</b>
              <span className="small muted">
                {reveal.firstRun
                  ? 'Your battle log counts from the start. Each one gave you a Kanto Pokemon.'
                  : 'Each one gave you a Kanto Pokemon.'}
              </span>
            </div>
            <div className="mh-team3">
              {reveal.items.map(({ earned, name: title }) => (
                <span key={earned.id}>
                  <RewardToken species={earned.species} shiny={earned.shiny} size={52} />
                  <span className="small">
                    {earned.shiny ? 'Shiny ' : ''}
                    {name(earned.species)}
                  </span>
                  <span className="meta">{title}</span>
                </span>
              ))}
            </div>
            <Button
              variant="primary"
              onClick={() => {
                navigate({ screen: 'achievements' });
                closeReveal();
              }}
            >
              See your achievements
            </Button>
          </div>
        ),
      }}
    />
  );
}
