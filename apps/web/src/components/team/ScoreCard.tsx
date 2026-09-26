import type { TeamAnalysis, TeamRecommendation } from '@pickthree/engine';
import { Button, IconButton, Term } from '@pickthree/ui';
import { Fragment } from 'react';
import {
  FitTag,
  GLOSSARY,
  PencilGlyph,
  PokemonToken,
  ROLE_SHORT,
  useName,
} from '../../components.tsx';
import { costLine } from '../../format.ts';

export interface CustomNotes {
  analysis: TeamAnalysis;
  best: TeamRecommendation | null;
  shared: boolean;
  leagueTitle: string;
}

/**
 * The hero card: battle strength as a bare number, the structure and the fit, an Edit pencil, the
 * three Pokémon in battle order, how hard the team is to play and the score's factors as read-only
 * bars. Under it, Take to battle (the page's one primary action) and, for a hand-built team, its
 * notes.
 */
export function ScoreCard({
  team,
  custom,
  onTakeToBattle,
  onEdit,
  onShowMember,
}: {
  team: TeamRecommendation;
  custom: CustomNotes | null;
  onTakeToBattle: () => void;
  onEdit: () => void;
  onShowMember: (i: number) => void;
}) {
  const name = useName();
  const list = (ids: string[]): string => ids.map(name).join(', ');
  const structure = team.structure === 'ABB' ? 'ABB line' : 'Balanced ABC';
  const f = team.score.factors;
  // A hand-built team's cost factor only compares its own orders, so it says nothing here: its
  // card gives what it costs to build instead, and leaves out accessibility with it.
  const bars: [string, number][] = custom
    ? [
        ['Coverage', f.coverage],
        ['Consistency', f.consistency],
        ['Safety', f.safety],
      ]
    : [
        ['Coverage', f.coverage],
        ['Consistency', f.consistency],
        ['Safety', f.safety],
        ['Affordable', f.cost],
        ['Accessibility', f.accessibility],
      ];
  const tried = custom?.analysis.orders ?? [];
  const hypothetical = custom?.analysis.hypothetical ?? [];
  const chosen = custom?.analysis.chosenMoves ?? [];
  const unranked = custom?.analysis.unranked ?? [];
  const first = tried[0];
  const last = tried.length > 1 ? tried[tried.length - 1] : undefined;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="score-card" aria-label="Battle score">
        <div className="hero-top">
          <div className="hero-id">
            <span className="hero-num">{Math.round(team.score.battle)}</span>
            <div className="hero-labels">
              <Term term={structure}>{GLOSSARY[structure]}</Term>
              <FitTag fit={team.score.fit} />
            </div>
          </div>
          <IconButton label="Edit team" onClick={onEdit}>
            <PencilGlyph />
          </IconButton>
        </div>
        <div className="hero-rule" />
        <div className="analysis-strip">
          {team.slots.map((slot, i) => {
            const sid = slot.candidate.build.speciesId;
            return (
              <button
                type="button"
                className="analysis-strip-member"
                key={`${sid}-${i}`}
                onClick={() => onShowMember(i)}
              >
                <PokemonToken speciesId={sid} size={48} />
                <b>{name(sid)}</b>
                <span className="meta">{ROLE_SHORT[slot.role]}</span>
              </button>
            );
          })}
        </div>
        <p className="meta hero-difficulty">
          {team.score.difficulty} to play: {team.score.difficultyWhy}
        </p>
        <div className="hero-rule" />
        <div className="hero-bars">
          {bars.map(([label, value]) => {
            const v = Math.round(value);
            return (
              <Fragment key={label}>
                <span className="hero-bar-label" aria-hidden="true">
                  {label}
                </span>
                <div
                  className="hero-bar"
                  role="meter"
                  aria-label={`${label} ${v} of 100`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={v}
                >
                  <div className="hero-bar-fill" style={{ width: `${v}%` }} />
                </div>
              </Fragment>
            );
          })}
        </div>
        {custom ? <p className="meta">To build all three: {costLine(team.cost)}</p> : null}
      </section>
      <Button variant="primary" onClick={onTakeToBattle}>
        Take to battle
      </Button>
      {custom ? (
        <div className="score-notes custom-note">
          {custom.shared ? (
            <p className="meta">
              Shared team link.{' '}
              {hypothetical.length > 0
                ? `IVs assumed for ${list(hypothetical)}; the rest are yours.`
                : 'All three are yours, so the numbers are exact.'}
            </p>
          ) : hypothetical.length > 0 ? (
            <p className="meta">
              {list(hypothetical)} {hypothetical.length === 1 ? 'is' : 'are'} not in your
              collection, so the numbers assume a top-10% IV spread rather than a perfect one.
            </p>
          ) : null}
          {custom.best ? (
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
              PvPoke does not rank {list(unranked)} in {custom.leagueTitle}, so pick3 simulated{' '}
              {unranked.length === 1 ? 'it' : 'them'} against the meta on this phone. No rank
              badges; where it plays comes from those battles alone.
            </p>
          ) : null}
          {first && last ? (
            <p className="meta">
              pick3 tried all six orders. Best: {first.names.join(', ')} at {first.battle}. Weakest:{' '}
              {last.names.join(', ')} at {last.battle}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
