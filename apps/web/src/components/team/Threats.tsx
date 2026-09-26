import type { KeyMatchup, TeamRecommendation } from '@pickthree/engine';
import { Button } from '@pickthree/ui';
import { useState } from 'react';
import { PokemonToken, RankTag, TypeChips } from '../../components.tsx';

const NO_WINS = (
  <p className="small muted">
    No Pokémon in the meta group is a clear win for this team in the simulated scenarios.
  </p>
);

const NO_THREATS = (
  <p className="small muted">
    Nothing in the meta group beats all three of these in the simulated scenarios. Real battles vary
    with shields and energy.
  </p>
);

/** One opponent row: token, name, types, meta rank and one engine-written line underneath. */
function MatchupRow({ m, testId }: { m: KeyMatchup; testId: string }) {
  return (
    <div className="switch-row" data-testid={testId}>
      <PokemonToken speciesId={m.opponent} size={32} showInitial={false} />
      <div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <b style={{ fontWeight: 500 }}>{m.opponentName}</b>
          <TypeChips types={m.opponentTypes} small />
          <RankTag rank={m.opponentRank} />
        </div>
        <div className="meta">{m.line}</div>
      </div>
    </div>
  );
}

/**
 * What beats this team: the engine's key threats as rows, then how many more of the meta group
 * also beat it.
 */
export function Threats({ team }: { team: TeamRecommendation }) {
  const threats = team.explanation.keyThreats;
  const listedInUncovered = threats.filter((t) =>
    team.score.uncoveredOpponents.includes(t.opponent),
  ).length;
  const moreCount = team.score.uncoveredOpponents.length - listedInUncovered;
  return (
    <section className="stack">
      <h3 id="threats" className="analysis-section">
        Threats
      </h3>
      {threats.length === 0 ? (
        NO_THREATS
      ) : (
        <>
          {threats.map((t) => (
            <MatchupRow m={t} testId="threat-row" key={t.opponent} />
          ))}
          {moreCount > 0 ? (
            <p className="small muted">and {moreCount} more beat this team</p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * What beats the lead and who answers it, without repeating an opponent already listed under
 * Threats: five rows, then Show all up to eight.
 */
export function SwitchList({ team, leadName }: { team: TeamRecommendation; leadName: string }) {
  const [expanded, setExpanded] = useState(false);
  const rawPlan = team.explanation.switchPlan;
  const threatIds = new Set(team.explanation.keyThreats.map((t) => t.opponent));
  const plan = rawPlan.filter((sw) => !threatIds.has(sw.opponent));
  const shown = plan.slice(0, expanded ? 8 : 5);
  return (
    <section className="stack" style={{ gap: 4 }}>
      <h3 id="switch" className="analysis-section" style={{ marginBottom: 4 }}>
        When to switch
      </h3>
      <p className="meta">
        What beats your {leadName} lead and who answers it. Unanswered threats first, then the
        ones you meet most.
      </p>
      {rawPlan.length === 0 ? (
        <p className="small muted">
          Nothing in the meta group beats your lead in a 1-shield fight.
        </p>
      ) : plan.length === 0 ? (
        <p className="small muted">Everything that beats your lead is listed under Threats.</p>
      ) : (
        <>
          {shown.map((sw) => (
            <MatchupRow m={sw} testId={`switch-${sw.opponent}`} key={sw.opponent} />
          ))}
          {plan.length > 5 ? (
            <Button variant="text" ariaExpanded={expanded} onClick={() => setExpanded((x) => !x)}>
              {expanded ? 'Show less' : 'Show all'}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

/** The engine's key wins, as the same compact rows. */
export function KeyWins({ team }: { team: TeamRecommendation }) {
  const wins = team.explanation.keyWins;
  return (
    <section className="stack">
      <h3 id="key-wins" className="analysis-section">
        Key wins
      </h3>
      {wins.length === 0
        ? NO_WINS
        : wins.map((w) => <MatchupRow m={w} testId="key-win" key={w.opponent} />)}
    </section>
  );
}
