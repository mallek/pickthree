import type { TeamRecommendation } from '@pickthree/engine';
import { PokemonToken, useName } from '../../components.tsx';
import { num } from '../../format.ts';

/**
 * A collapsed team: three overlapping sprites, the three names, and one line of fit, difficulty
 * and Stardust. It sits inside ExpandRow's toggle button, so it holds no buttons or links.
 */
export function TeamRowSummary({ team }: { team: TeamRecommendation }) {
  const name = useName();
  const ids = team.slots.map((s) => s.candidate.build.speciesId);
  return (
    <span className="team-row">
      <span className="team-row-sprites" aria-hidden="true">
        {ids.map((id, i) => (
          <PokemonToken key={`${id}-${i}`} speciesId={id} size={36} showInitial={false} />
        ))}
      </span>
      <span className="team-row-text">
        <span className="team-row-names" data-testid="team-row-names">
          {ids.map(name).join(' · ')}
        </span>
        <span className="team-row-line">
          {`${team.score.fit} fit · ${team.score.difficulty} · ${num(team.cost.stardust)} Stardust`}
        </span>
      </span>
    </span>
  );
}
