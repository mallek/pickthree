import type { KeyMatchup, TeamRecommendation } from '@pickthree/engine';
import { Button } from '@pickthree/ui';
import { useState } from 'react';
import { PokemonToken, RankTag, TypeChips } from '../../components.tsx';

function MatchupCard({ m, testId, threat }: { m: KeyMatchup; testId: string; threat?: boolean }) {
  return (
    <div className={threat ? 'mini threat' : 'mini'} data-testid={testId}>
      <PokemonToken speciesId={m.opponent} size={32} showInitial={false} />
      <b>{m.opponentName}</b>
      <TypeChips types={m.opponentTypes} small />
      <RankTag rank={m.opponentRank} />
      <span>{m.line}</span>
    </div>
  );
}

const NO_THREATS = (
  <p className="small muted">
    Nothing in the meta group beats all three of these in the simulated scenarios. Real battles
    vary with shields and energy.
  </p>
);

/**
 * The meta group boiled down: what this team wins and what beats it, collapsed to one of each
 * until asked for more, then the full switch plan for the lead.
 */
export function Matchups({ team, leadName }: { team: TeamRecommendation; leadName: string }) {
  const [expanded, setExpanded] = useState(false);
  const e = team.explanation;
  const firstWin = e.keyWins[0];
  const firstThreat = e.keyThreats[0];
  return (
    <div className="stack" style={{ gap: 12 }}>
      {expanded ? (
        <>
          <div className="stack">
            <h3>Key wins</h3>
            <div className="matchup-grid">
              {e.keyWins.map((w) => (
                <MatchupCard m={w} testId="key-win" key={w.opponent} />
              ))}
            </div>
            <h3 style={{ marginTop: 8 }}>Key threats</h3>
            {e.keyThreats.length === 0 ? (
              NO_THREATS
            ) : (
              <div className="matchup-grid">
                {e.keyThreats.map((w) => (
                  <MatchupCard m={w} testId="key-threat" threat key={w.opponent} />
                ))}
              </div>
            )}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <h3 style={{ marginBottom: 4 }}>When to switch</h3>
            <p className="meta">
              What beats your {leadName} lead and who answers it. Unanswered threats first, then
              the ones you meet most.
            </p>
            {e.switchPlan.length === 0 ? (
              <p className="small muted">
                Nothing in the meta group beats your lead in a 1-shield fight.
              </p>
            ) : null}
            {e.switchPlan.slice(0, 8).map((sw) => (
              <div className="switch-row" key={sw.opponent}>
                <PokemonToken speciesId={sw.opponent} size={32} showInitial={false} />
                <div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <b style={{ fontWeight: 500 }}>{sw.opponentName}</b>
                    <TypeChips types={sw.opponentTypes} small />
                    <RankTag rank={sw.opponentRank} />
                  </div>
                  <div className="meta">
                    {sw.to === null
                      ? 'Nobody on the team beats it. Shield, farm energy, switch on your terms.'
                      : `Switch to ${sw.toName}, ${sw.rating >= 650 ? 'wins comfortably' : sw.rating >= 550 ? 'wins' : 'edges it'}.`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="matchup-cols">
          <div className="stack" style={{ gap: 6 }}>
            <h3>Wins</h3>
            {firstWin ? <MatchupCard m={firstWin} testId="key-win" /> : null}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <h3>Threat</h3>
            {firstThreat ? <MatchupCard m={firstThreat} testId="key-threat" threat /> : NO_THREATS}
          </div>
        </div>
      )}
      <Button variant="text" ariaExpanded={expanded} onClick={() => setExpanded((x) => !x)}>
        {expanded ? 'Show less' : 'Show all'}
      </Button>
    </div>
  );
}
