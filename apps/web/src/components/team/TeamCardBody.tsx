import type { TeamRecommendation } from '@pickthree/engine';
import { Term } from '@pickthree/ui';
import { FitTag, GLOSSARY, PokemonToken, RoleLabel, useName } from '../../components.tsx';
import { costLine } from '../../format.ts';

/**
 * Today's team card content, without its own click handling: fit, structure (tap to define),
 * difficulty and why, the three Pokémon with roles in battle order, the specific explanation, and
 * the full cost. `legend` adds the one-time line that teaches the three roles.
 */
export function TeamCardBody({
  team,
  legend = false,
}: {
  team: TeamRecommendation;
  legend?: boolean;
}) {
  const name = useName();
  const structure = team.structure === 'ABB' ? 'ABB line' : 'Balanced ABC';
  return (
    <div className="team-body">
      <div className="between">
        <span className="row">
          <FitTag fit={team.score.fit} />
          <Term term={structure}>{GLOSSARY[structure]}</Term>
        </span>
        <span className="diff">
          <span className="small">{team.score.difficulty} to play</span>
          <span className="diff-why">{team.score.difficultyWhy}</span>
        </span>
      </div>
      <div className="slots3">
        {team.slots.map((s) => (
          <div className="slot" key={s.candidate.build.specimenId}>
            <PokemonToken speciesId={s.candidate.build.speciesId} size={52} />
            <span className="slot-name">{name(s.candidate.build.speciesId)}</span>
            <RoleLabel role={s.role} />
          </div>
        ))}
      </div>
      {legend ? (
        <p className="meta" style={{ textAlign: 'center' }}>
          Lead opens the battle. Safe Switch answers a bad start. Closer finishes once shields are
          gone.
        </p>
      ) : null}
      <p className="team-why">{team.explanation.why}</p>
      <div className="cost-line">
        <span>{costLine(team.cost)}</span>
      </div>
    </div>
  );
}
