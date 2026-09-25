import type { TeamRecommendation } from '@pickthree/engine';
import { Term } from '@pickthree/ui';
import { GLOSSARY, PokemonToken, ROLE_TEXT, useName } from '../../components.tsx';

/**
 * The why: the engine's own sentence, the team's structure (ABB line or Balanced ABC), then the
 * score broken into its factors so "why this number" is never a mystery.
 */
export function WhyThisTeam({ team }: { team: TeamRecommendation }) {
  const name = useName();
  const lead = team.slots[0];
  const back = team.slots.slice(1);
  const structureTerm = team.structure === 'ABB' ? 'ABB line' : 'Balanced ABC';
  return (
    <div className="stack" style={{ gap: 16 }}>
      <p>{team.explanation.why}</p>
      <div className="stack">
        <div className="between">
          <h3>Team structure</h3>
          <Term term={structureTerm}>{GLOSSARY[structureTerm]}</Term>
        </div>
        {team.structure === 'ABB' ? (
          <div className="card">
            <div className="struct-abb">
              <div className="slot">
                <PokemonToken
                  speciesId={lead.candidate.build.speciesId}
                  size={40}
                  showInitial={false}
                />
                <span className="role">Lead</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <span className="meta">Beaten by</span>
                <div className="pills">
                  {team.leadCounters.slice(0, 6).map((op) => (
                    <span className="pill" key={op}>
                      <PokemonToken speciesId={op} size={18} showInitial={false} />
                      {name(op)}
                    </span>
                  ))}
                  {team.leadCounters.length === 0 ? (
                    <span className="meta">nothing in the meta</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="struct-abb divider-top" style={{ paddingTop: 12 }}>
              <div className="slot">
                <div className="token-stack">
                  {back.map((b) => (
                    <PokemonToken
                      key={b.candidate.build.specimenId}
                      speciesId={b.candidate.build.speciesId}
                      size={40}
                      showInitial={false}
                    />
                  ))}
                </div>
                <span className="role">Back line</span>
              </div>
              <div style={{ fontSize: 14 }}>
                Both your <Term term="back line">{GLOSSARY['back line']}</Term> Pokémon beat
                these.
                <span className="meta" style={{ display: 'block', marginTop: 4 }}>
                  {team.explanation.structureLine}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="slices">
              {team.slots.map((slot) => (
                <div className="slice" key={slot.candidate.build.specimenId}>
                  <PokemonToken
                    speciesId={slot.candidate.build.speciesId}
                    size={32}
                    showInitial={false}
                  />
                  <span className="role">{ROLE_TEXT[slot.role]}</span>
                  <span className="meta" style={{ lineHeight: 1.3 }}>
                    beats {slot.sim.wins} of {slot.sim.results.length}
                  </span>
                </div>
              ))}
            </div>
            <p className="meta">{team.explanation.structureLine}</p>
          </>
        )}
      </div>
      <p className="meta">
        Battle strength {Math.round(team.score.battle)} is coverage, consistency and safety (
        {team.score.factors.coverage}, {team.score.factors.consistency},{' '}
        {team.score.factors.safety}). The total, {team.score.total}, also counts cost (
        {team.score.factors.cost}) and accessibility ({team.score.factors.accessibility}).
      </p>
    </div>
  );
}
