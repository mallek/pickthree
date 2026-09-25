import type { TeamAnalysis, TeamRecommendation } from '@pickthree/engine';
import { Button } from '@pickthree/ui';
import { FitTag, useName } from '../../components.tsx';
import { fitWhy } from '../../format.ts';

export interface CustomNotes {
  analysis: TeamAnalysis;
  best: TeamRecommendation | null;
  shared: boolean;
  leagueTitle: string;
}

/**
 * The headline: battle strength (coverage, consistency, safety), the fit and what it answers, and
 * Take to battle, the page's one primary action, in the same place for every team.
 */
export function ScoreCard({
  team,
  custom,
  onTakeToBattle,
}: {
  team: TeamRecommendation;
  custom: CustomNotes | null;
  onTakeToBattle: () => void;
}) {
  const name = useName();
  const list = (ids: string[]): string => ids.map(name).join(', ');
  const covered = team.score.coveredOpponents.length;
  const all = covered + team.score.uncoveredOpponents.length;
  const order = list(team.slots.map((x) => x.candidate.build.speciesId));
  const tried = custom?.analysis.orders ?? [];
  const hypothetical = custom?.analysis.hypothetical ?? [];
  const chosen = custom?.analysis.chosenMoves ?? [];
  const unranked = custom?.analysis.unranked ?? [];
  const first = tried[0];
  const last = tried.length > 1 ? tried[tried.length - 1] : undefined;
  return (
    <section
      className={custom ? 'score-card custom-note' : 'score-card'}
      aria-label="Battle score"
    >
      <div className="score-head">
        <span className="score-num">{Math.round(team.score.battle)}</span>
        <span className="score-of">/ 100 in battle</span>
        <FitTag fit={team.score.fit} />
      </div>
      <p className="score-line">{fitWhy(team.score.fit, covered, all, team.score.topUncovered)}</p>
      {custom?.shared ? (
        <p className="meta">
          Shared team link.{' '}
          {hypothetical.length > 0
            ? `IVs assumed for ${list(hypothetical)}; the rest are yours.`
            : 'All three are yours, so the numbers are exact.'}
        </p>
      ) : hypothetical.length > 0 ? (
        <p className="meta">
          {list(hypothetical)} {hypothetical.length === 1 ? 'is' : 'are'} not in your collection, so
          the numbers assume a top-10% IV spread rather than a perfect one.
        </p>
      ) : null}
      {custom?.best ? (
        <p className="meta">
          Your best recommended team rates {custom.best.score.fit.toLowerCase()} at{' '}
          {Math.round(custom.best.score.battle)}:{' '}
          {list(custom.best.slots.map((x) => x.candidate.build.speciesId))}.
        </p>
      ) : null}
      {chosen.length > 0 ? (
        <p className="meta">{list(chosen)} ran the moves you chose, not the recommended set.</p>
      ) : null}
      {unranked.length > 0 ? (
        <p className="meta">
          PvPoke does not rank {list(unranked)} in {custom?.leagueTitle ?? 'this league'}, so pick3
          simulated {unranked.length === 1 ? 'it' : 'them'} against the meta on this phone. No rank
          badges; where it plays comes from those battles alone.
        </p>
      ) : null}
      <p className="score-order">Run it in this order: {order}.</p>
      {custom && first && last ? (
        <p className="meta">
          pick3 tried all six orders. Best: {first.names.join(', ')} at {first.battle}. Weakest:{' '}
          {last.names.join(', ')} at {last.battle}.
        </p>
      ) : custom ? (
        <p className="meta">Run in the order you picked.</p>
      ) : null}
      <Button variant="primary" onClick={onTakeToBattle}>
        Take to battle
      </Button>
    </section>
  );
}
