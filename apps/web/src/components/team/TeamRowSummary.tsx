import type { TeamRecommendation } from '@pickthree/engine';
import { PokemonToken, useName } from '../../components.tsx';
import { amount, num, SEP } from '../../format.ts';

/**
 * A collapsed team: three overlapping sprites, the three names, and one line of the battle
 * number, fit, difficulty and Stardust. It sits inside ExpandRow's toggle button, so it holds no
 * buttons or links.
 */
export function TeamRowSummary({ team }: { team: TeamRecommendation }) {
  const name = useName();
  const ids = team.slots.map((s) => s.candidate.build.speciesId);
  return (
    <span className="team-summary">
      <span className="team-summary-sprites" aria-hidden="true">
        {ids.map((id, i) => (
          <PokemonToken key={`${id}-${i}`} speciesId={id} size={36} showInitial={false} />
        ))}
      </span>
      <span className="team-summary-text">
        <span className="team-summary-names" data-testid="team-summary-names">
          {ids.map(name).join(' · ')}
        </span>
        <span className="team-summary-line">
          {`${Math.round(team.score.battle)}${SEP}${team.score.fit} fit${SEP}${team.score.difficulty}${SEP}${amount(num(team.cost.stardust), 'Stardust')}`}
        </span>
      </span>
    </span>
  );
}
